-- ==============================================================================
-- Davao Bank — Phase 5 Stage C: Scheduled & Recurring Payments + Simulated Bill Pay
-- Single Money Engine (_transfer_core), Biller Infrastructure, Schedules & Cron
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Schema Extensions (§C.1)
-- ------------------------------------------------------------------------------

-- Allow system profile role for biller settlement accounts
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('customer', 'admin', 'system'));

-- Allow 'bill_payment' transaction type
alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions add constraint transactions_type_check check (
  type in ('transfer', 'deposit', 'withdrawal', 'adjustment', 'reversal', 'bill_payment')
);

-- Billers table: simulated utility, telecom, and service billers
create table if not exists public.billers (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  category text not null check (category in ('electricity', 'water', 'internet', 'mobile', 'other')),
  account_id uuid unique not null references public.accounts(id),
  reference_label text not null,
  reference_pattern text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.billers enable row level security;

-- Authenticated users can view active billers; admins can view all billers
drop policy if exists "billers_read_active" on public.billers;
create policy "billers_read_active"
  on public.billers
  for select
  to authenticated
  using (is_active = true or public.is_admin());

-- Bill payments envelope table: links transaction to biller and biller reference
create table if not exists public.bill_payments (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid unique not null references public.transactions(id) on delete cascade,
  biller_id uuid not null references public.billers(id),
  payer_account uuid not null references public.accounts(id),
  biller_reference text not null,
  created_at timestamptz not null default now()
);

alter table public.bill_payments enable row level security;

-- Payer (via account ownership) or staff admin can view bill payment details
drop policy if exists "bill_payments_read_payer" on public.bill_payments;
create policy "bill_payments_read_payer"
  on public.bill_payments
  for select
  to authenticated
  using (
    exists (
      select 1 from public.accounts a
      where a.id = bill_payments.payer_account
        and a.user_id = auth.uid()
    )
    or public.is_admin()
  );

-- Scheduled payments table: once, weekly, and monthly recurring payment instructions
create table if not exists public.scheduled_payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  from_account uuid not null references public.accounts(id),
  kind text not null check (kind in ('transfer', 'bill')),
  to_account uuid null references public.accounts(id),
  biller_id uuid null references public.billers(id),
  biller_reference text null,
  amount bigint not null check (amount > 0),
  note text,
  frequency text not null check (frequency in ('once', 'weekly', 'monthly')),
  start_date date not null,
  end_date date null,
  max_runs int null check (max_runs > 0),
  runs_done int not null default 0,
  next_run_date date not null,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint check_scheduled_kind_targets check (
    (kind = 'transfer' and to_account is not null and biller_id is null and biller_reference is null)
    or
    (kind = 'bill' and biller_id is not null and biller_reference is not null and to_account is null)
  ),
  constraint check_scheduled_dates check (
    end_date is null or end_date >= start_date
  )
);

alter table public.scheduled_payments enable row level security;

-- Owner or staff admin can select scheduled payments
drop policy if exists "scheduled_payments_read_owner" on public.scheduled_payments;
create policy "scheduled_payments_read_owner"
  on public.scheduled_payments
  for select
  to authenticated
  using (owner_id = auth.uid() or public.is_admin());

-- Scheduled payment execution runs table: logs each execution attempt with run-once guarantee
create table if not exists public.scheduled_payment_runs (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.scheduled_payments(id) on delete cascade,
  run_date date not null,
  status text not null check (status in ('completed', 'failed')),
  transaction_id uuid null references public.transactions(id),
  failure_reason text null,
  created_at timestamptz not null default now(),
  constraint unique_schedule_run_date unique (schedule_id, run_date)
);

alter table public.scheduled_payment_runs enable row level security;

-- Owner of schedule or staff admin can select execution runs
drop policy if exists "scheduled_runs_read_owner" on public.scheduled_payment_runs;
create policy "scheduled_runs_read_owner"
  on public.scheduled_payment_runs
  for select
  to authenticated
  using (
    exists (
      select 1 from public.scheduled_payments s
      where s.id = scheduled_payment_runs.schedule_id
        and (s.owner_id = auth.uid() or public.is_admin())
    )
  );

-- ------------------------------------------------------------------------------
-- 2. Single Money Engine: _transfer_core (§C.2)
-- Revoked from public, anon, and authenticated. Internal-only atomic transfer engine.
-- ------------------------------------------------------------------------------
create or replace function public._transfer_core(
  p_actor uuid,
  p_from uuid,
  p_to uuid,
  p_amount bigint,
  p_idempotency_key text,
  p_reference text,
  p_tx_type text default 'transfer'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_existing_tx record;
  v_from_acc record;
  v_to_acc record;
  v_source_balance bigint;
  v_tx_id uuid;
  v_transfer_id uuid;
  v_clean_ref text;
  v_first_acc uuid;
  v_second_acc uuid;
  v_effective_type text := coalesce(p_tx_type, 'transfer');
begin
  -- 1. Idempotency First: check for existing transaction with same key
  if p_idempotency_key is not null and p_idempotency_key <> '' then
    select id, type, status, reference, created_at into v_existing_tx
    from public.transactions
    where idempotency_key = p_idempotency_key;

    if found then
      return jsonb_build_object(
        'id', v_existing_tx.id,
        'type', v_existing_tx.type,
        'status', v_existing_tx.status,
        'reference', v_existing_tx.reference,
        'created_at', v_existing_tx.created_at,
        'idempotent_replay', true
      );
    end if;
  else
    raise exception 'Idempotency key is required';
  end if;

  -- 2. Basic Validation & Authorization
  if p_actor is null then
    raise exception 'Authentication required';
  end if;

  -- Check actor profile suspension status
  if exists (
    select 1
    from public.profiles
    where id = p_actor
      and status <> 'active'
  ) then
    raise exception 'Your profile is suspended';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Transfer amount must be greater than zero';
  end if;

  if p_amount > 500000000 then -- PHP 5,000,000.00 prototype ceiling
    raise exception 'Transfer amount exceeds maximum allowed limit of PHP 5,000,000';
  end if;

  if p_from is null or p_to is null then
    raise exception 'Source and destination accounts are required';
  end if;

  if p_from = p_to then
    raise exception 'Cannot transfer funds to the same account';
  end if;

  -- 3. Concurrency Safety: Deterministic Row Locking
  if p_from < p_to then
    v_first_acc := p_from;
    v_second_acc := p_to;
  else
    v_first_acc := p_to;
    v_second_acc := p_from;
  end if;

  perform 1 from public.accounts where id = v_first_acc for update;
  perform 1 from public.accounts where id = v_second_acc for update;

  -- 4. Account Verification
  select id, account_number, user_id, status, currency
  into v_from_acc
  from public.accounts
  where id = p_from;

  if not found then
    raise exception 'Source account does not exist';
  end if;

  if v_from_acc.user_id <> p_actor then
    raise exception 'Unauthorized: source account does not belong to caller';
  end if;

  if v_from_acc.status <> 'active' then
    raise exception 'Source account is not active (current status: %)', v_from_acc.status;
  end if;

  select id, account_number, user_id, status, currency
  into v_to_acc
  from public.accounts
  where id = p_to;

  if not found then
    raise exception 'Destination account does not exist';
  end if;

  if v_to_acc.status <> 'active' then
    raise exception 'Destination account is not active (current status: %)', v_to_acc.status;
  end if;

  if v_from_acc.currency <> v_to_acc.currency then
    raise exception 'Currency mismatch: cannot transfer between different currencies';
  end if;

  -- 5. Calculate authoritative source balance inside the lock
  select coalesce(sum(case when direction = 'credit' then amount else -amount end), 0)
  into v_source_balance
  from public.ledger_entries
  where account_id = p_from;

  if v_source_balance < p_amount then
    -- Re-check idempotency key first on insufficient funds path (race condition hardening)
    select id, type, status, reference, created_at into v_existing_tx
    from public.transactions
    where idempotency_key = p_idempotency_key;

    if found then
      return jsonb_build_object(
        'id', v_existing_tx.id,
        'type', v_existing_tx.type,
        'status', v_existing_tx.status,
        'reference', v_existing_tx.reference,
        'created_at', v_existing_tx.created_at,
        'idempotent_replay', true
      );
    end if;

    raise exception 'Insufficient funds';
  end if;

  v_clean_ref := coalesce(
    nullif(trim(p_reference), ''),
    case when v_effective_type = 'bill_payment' then 'Bill Payment' else 'Funds Transfer' end
  );

  -- 6. Insert All-or-Nothing Transaction (with race handling)
  begin
    insert into public.transactions (
      type, status, initiated_by, idempotency_key, reference
    ) values (
      v_effective_type, 'completed', p_actor, p_idempotency_key, v_clean_ref
    )
    returning id into v_tx_id;
  exception
    when unique_violation then
      select id, type, status, reference, created_at into v_existing_tx
      from public.transactions
      where idempotency_key = p_idempotency_key;

      return jsonb_build_object(
        'id', v_existing_tx.id,
        'type', v_existing_tx.type,
        'status', v_existing_tx.status,
        'reference', v_existing_tx.reference,
        'created_at', v_existing_tx.created_at,
        'idempotent_replay', true
      );
  end;

  insert into public.transfers (
    transaction_id, from_account, to_account, amount
  ) values (
    v_tx_id, p_from, p_to, p_amount
  )
  returning id into v_transfer_id;

  insert into public.ledger_entries (account_id, transaction_id, direction, amount)
  values (p_from, v_tx_id, 'debit', p_amount);

  insert into public.ledger_entries (account_id, transaction_id, direction, amount)
  values (p_to, v_tx_id, 'credit', p_amount);

  -- 7. Audit log & In-app Notifications
  perform public.write_audit(
    case when v_effective_type = 'bill_payment' then 'bill_payment_completed' else 'funds_transferred' end,
    'transfers',
    v_transfer_id::text,
    jsonb_build_object(
      'transaction_id', v_tx_id,
      'from_account', v_from_acc.account_number,
      'to_account', v_to_acc.account_number,
      'amount_centavos', p_amount,
      'reference', v_clean_ref,
      'type', v_effective_type
    )
  );

  if v_effective_type = 'bill_payment' then
    insert into public.notifications (user_id, type, message)
    values (
      v_from_acc.user_id,
      'bill_payment',
      'You paid PHP ' || trim(to_char(p_amount / 100.0, 'FM999,999,990.00')) ||
      ' for ' || v_clean_ref || '.'
    );
  else
    insert into public.notifications (user_id, type, message)
    values (
      v_from_acc.user_id,
      'transfer_out',
      'You transferred PHP ' || trim(to_char(p_amount / 100.0, 'FM999,999,990.00')) ||
      ' to account ' || v_to_acc.account_number || ' (Ref: ' || v_clean_ref || ').'
    );

    insert into public.notifications (user_id, type, message)
    values (
      v_to_acc.user_id,
      'transfer_in',
      'You received PHP ' || trim(to_char(p_amount / 100.0, 'FM999,999,990.00')) ||
      ' from account ' || v_from_acc.account_number || ' (Ref: ' || v_clean_ref || ').'
    );
  end if;

  return jsonb_build_object(
    'id', v_tx_id,
    'type', v_effective_type,
    'status', 'completed',
    'amount', p_amount,
    'from_account', v_from_acc.account_number,
    'to_account', v_to_acc.account_number,
    'reference', v_clean_ref,
    'idempotency_key', p_idempotency_key,
    'created_at', now(),
    'idempotent_replay', false
  );
end;
$$;

-- Revoke internal engine from all client roles
revoke execute on function public._transfer_core(uuid, uuid, uuid, bigint, text, text, text) from public, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 3. Public transfer() Thin Wrapper (§C.2)
-- Maintains identical client API and passes auth.uid() as actor
-- ------------------------------------------------------------------------------
create or replace function public.transfer(
  p_from_account uuid,
  p_to_account uuid,
  p_amount bigint,
  p_idempotency_key text,
  p_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  return public._transfer_core(
    auth.uid(),
    p_from_account,
    p_to_account,
    p_amount,
    p_idempotency_key,
    p_reference,
    'transfer'
  );
end;
$$;

grant execute on function public.transfer(uuid, uuid, bigint, text, text) to authenticated;

-- ------------------------------------------------------------------------------
-- 4. Simulated Bill Pay: pay_bill() (§C.3)
-- Validates biller status & reference regex, executes via _transfer_core
-- ------------------------------------------------------------------------------
create or replace function public.pay_bill(
  p_from_account uuid,
  p_biller_id uuid,
  p_biller_reference text,
  p_amount bigint,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_caller_id uuid := auth.uid();
  v_biller record;
  v_clean_ref text;
  v_ref_string text;
  v_res jsonb;
  v_tx_id uuid;
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  -- Check caller profile suspension
  if exists (
    select 1 from public.profiles where id = v_caller_id and status <> 'active'
  ) then
    raise exception 'Your profile is suspended';
  end if;

  if p_biller_id is null then
    raise exception 'Biller ID is required';
  end if;

  select * into v_biller
  from public.billers
  where id = p_biller_id;

  if not found then
    raise exception 'Biller not found';
  end if;

  if not v_biller.is_active then
    raise exception 'Biller is currently inactive';
  end if;

  v_clean_ref := trim(coalesce(p_biller_reference, ''));
  if v_clean_ref = '' then
    raise exception 'Biller reference is required';
  end if;

  if not (v_clean_ref ~ v_biller.reference_pattern) then
    raise exception 'Invalid reference format for % (expected pattern: %)', v_biller.name, v_biller.reference_pattern;
  end if;

  v_ref_string := 'Bill: ' || v_biller.name || ' · ' || v_clean_ref;

  -- Execute transfer via core money engine
  v_res := public._transfer_core(
    v_caller_id,
    p_from_account,
    v_biller.account_id,
    p_amount,
    p_idempotency_key,
    v_ref_string,
    'bill_payment'
  );

  v_tx_id := (v_res->>'id')::uuid;

  -- Insert bill_payments linkage (if not replay)
  insert into public.bill_payments (
    transaction_id, biller_id, payer_account, biller_reference
  ) values (
    v_tx_id, p_biller_id, p_from_account, v_clean_ref
  )
  on conflict (transaction_id) do nothing;

  return v_res || jsonb_build_object(
    'biller_id', p_biller_id,
    'biller_name', v_biller.name,
    'biller_reference', v_clean_ref
  );
end;
$$;

grant execute on function public.pay_bill(uuid, uuid, text, bigint, text) to authenticated;

-- ------------------------------------------------------------------------------
-- 5. Scheduled Payments Management Functions (§C.3)
-- ------------------------------------------------------------------------------

-- create_scheduled_payment
create or replace function public.create_scheduled_payment(
  p_from_account uuid,
  p_kind text,
  p_to_account uuid default null,
  p_biller_id uuid default null,
  p_biller_reference text default null,
  p_amount bigint default null,
  p_frequency text default 'once',
  p_start_date date default null,
  p_end_date date default null,
  p_max_runs int default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_caller_id uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_from_acc record;
  v_to_acc record;
  v_biller record;
  v_clean_ref text;
  v_active_count int;
  v_new_id uuid;
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  if exists (
    select 1 from public.profiles where id = v_caller_id and status <> 'active'
  ) then
    raise exception 'Your profile is suspended';
  end if;

  -- Validate source account ownership & active status
  select * into v_from_acc
  from public.accounts
  where id = p_from_account;

  if not found then
    raise exception 'Source account does not exist';
  end if;

  if v_from_acc.user_id <> v_caller_id then
    raise exception 'Unauthorized: source account does not belong to caller';
  end if;

  if v_from_acc.status <> 'active' then
    raise exception 'Source account is not active';
  end if;

  -- Validate kind
  if p_kind not in ('transfer', 'bill') then
    raise exception 'Invalid scheduled payment kind. Must be transfer or bill';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  if p_amount > 500000000 then
    raise exception 'Amount exceeds maximum limit of PHP 5,000,000';
  end if;

  if p_frequency not in ('once', 'weekly', 'monthly') then
    raise exception 'Invalid frequency. Must be once, weekly, or monthly';
  end if;

  if p_start_date is null then
    raise exception 'Start date is required';
  end if;

  if p_start_date < v_today then
    raise exception 'Start date cannot be in the past';
  end if;

  if p_end_date is not null and p_end_date < p_start_date then
    raise exception 'End date cannot be earlier than start date';
  end if;

  if p_max_runs is not null and p_max_runs <= 0 then
    raise exception 'Max runs must be greater than zero';
  end if;

  -- Rate limit: max 20 active schedules per user
  select count(*) into v_active_count
  from public.scheduled_payments
  where owner_id = v_caller_id and status = 'active';

  if v_active_count >= 20 then
    raise exception 'Maximum of 20 active scheduled payments allowed per user';
  end if;

  if p_kind = 'transfer' then
    if p_to_account is null then
      raise exception 'Destination account is required for scheduled transfers';
    end if;

    if p_to_account = p_from_account then
      raise exception 'Cannot schedule transfer to the same account';
    end if;

    select * into v_to_acc
    from public.accounts
    where id = p_to_account;

    if not found or v_to_acc.status <> 'active' then
      raise exception 'Destination account does not exist or is not active';
    end if;

    v_clean_ref := null;
  elsif p_kind = 'bill' then
    if p_biller_id is null then
      raise exception 'Biller ID is required for scheduled bill payments';
    end if;

    select * into v_biller
    from public.billers
    where id = p_biller_id;

    if not found or not v_biller.is_active then
      raise exception 'Biller is not available';
    end if;

    v_clean_ref := trim(coalesce(p_biller_reference, ''));
    if v_clean_ref = '' then
      raise exception 'Biller reference is required';
    end if;

    if not (v_clean_ref ~ v_biller.reference_pattern) then
      raise exception 'Invalid reference format for % (expected pattern: %)', v_biller.name, v_biller.reference_pattern;
    end if;
  end if;

  insert into public.scheduled_payments (
    owner_id,
    from_account,
    kind,
    to_account,
    biller_id,
    biller_reference,
    amount,
    note,
    frequency,
    start_date,
    end_date,
    max_runs,
    runs_done,
    next_run_date,
    status
  ) values (
    v_caller_id,
    p_from_account,
    p_kind,
    p_to_account,
    p_biller_id,
    v_clean_ref,
    p_amount,
    nullif(trim(p_note), ''),
    p_frequency,
    p_start_date,
    p_end_date,
    p_max_runs,
    0,
    p_start_date,
    'active'
  )
  returning id into v_new_id;

  perform public.write_audit(
    'scheduled_payment_created',
    'scheduled_payments',
    v_new_id::text,
    jsonb_build_object(
      'kind', p_kind,
      'amount', p_amount,
      'frequency', p_frequency,
      'start_date', p_start_date,
      'next_run_date', p_start_date
    )
  );

  return jsonb_build_object(
    'id', v_new_id,
    'owner_id', v_caller_id,
    'kind', p_kind,
    'amount', p_amount,
    'frequency', p_frequency,
    'next_run_date', p_start_date,
    'status', 'active'
  );
end;
$$;

grant execute on function public.create_scheduled_payment(uuid, text, uuid, uuid, text, bigint, text, date, date, int, text) to authenticated;

-- update_scheduled_payment
create or replace function public.update_scheduled_payment(
  p_id uuid,
  p_amount bigint default null,
  p_next_run_date date default null,
  p_end_date date default null,
  p_max_runs int default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_caller_id uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_sched record;
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_sched
  from public.scheduled_payments
  where id = p_id;

  if not found then
    raise exception 'Scheduled payment not found';
  end if;

  if v_sched.owner_id <> v_caller_id and not public.is_admin() then
    raise exception 'Unauthorized to modify this scheduled payment';
  end if;

  if v_sched.status <> 'active' then
    raise exception 'Only active schedules can be updated (current status: %)', v_sched.status;
  end if;

  if p_amount is not null then
    if p_amount <= 0 or p_amount > 500000000 then
      raise exception 'Invalid amount';
    end if;
  end if;

  if p_next_run_date is not null and p_next_run_date < v_today then
    raise exception 'Next run date cannot be in the past';
  end if;

  if p_end_date is not null and p_end_date < coalesce(p_next_run_date, v_sched.next_run_date) then
    raise exception 'End date cannot be earlier than next run date';
  end if;

  if p_max_runs is not null and p_max_runs <= v_sched.runs_done then
    raise exception 'Max runs must be greater than runs already completed (%)', v_sched.runs_done;
  end if;

  update public.scheduled_payments
  set amount = coalesce(p_amount, amount),
      next_run_date = coalesce(p_next_run_date, next_run_date),
      end_date = coalesce(p_end_date, end_date),
      max_runs = coalesce(p_max_runs, max_runs),
      updated_at = now()
  where id = p_id;

  perform public.write_audit(
    'scheduled_payment_updated',
    'scheduled_payments',
    p_id::text,
    jsonb_build_object(
      'amount', coalesce(p_amount, v_sched.amount),
      'next_run_date', coalesce(p_next_run_date, v_sched.next_run_date)
    )
  );

  return jsonb_build_object('success', true, 'id', p_id);
end;
$$;

grant execute on function public.update_scheduled_payment(uuid, bigint, date, date, int) to authenticated;

-- cancel_scheduled_payment
create or replace function public.cancel_scheduled_payment(
  p_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_caller_id uuid := auth.uid();
  v_sched record;
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_sched
  from public.scheduled_payments
  where id = p_id;

  if not found then
    raise exception 'Scheduled payment not found';
  end if;

  if v_sched.owner_id <> v_caller_id and not public.is_admin() then
    raise exception 'Unauthorized to cancel this scheduled payment';
  end if;

  if v_sched.status = 'cancelled' then
    return jsonb_build_object('success', true, 'id', p_id, 'status', 'cancelled');
  end if;

  update public.scheduled_payments
  set status = 'cancelled',
      updated_at = now()
  where id = p_id;

  perform public.write_audit(
    'scheduled_payment_cancelled',
    'scheduled_payments',
    p_id::text,
    jsonb_build_object('reason', p_reason, 'cancelled_by', v_caller_id)
  );

  -- Notify user if cancelled by staff admin
  if v_sched.owner_id <> v_caller_id then
    insert into public.notifications (user_id, type, message)
    values (
      v_sched.owner_id,
      'scheduled_payment_cancelled',
      'Your scheduled payment of PHP ' || trim(to_char(v_sched.amount / 100.0, 'FM999,999,990.00')) ||
      ' was cancelled by bank staff.' || coalesce(' Reason: ' || p_reason, '')
    );
  end if;

  return jsonb_build_object('success', true, 'id', p_id, 'status', 'cancelled');
end;
$$;

grant execute on function public.cancel_scheduled_payment(uuid, text) to authenticated;

-- ------------------------------------------------------------------------------
-- 6. Scheduled Payments Executor: run_due_scheduled_payments() (§C.3)
-- Revoked from clients. Executes due runs atomically with FOR UPDATE SKIP LOCKED
-- ------------------------------------------------------------------------------
create or replace function public.run_due_scheduled_payments()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_sched record;
  v_biller record;
  v_run_id uuid;
  v_idempotency_key text;
  v_res jsonb;
  v_tx_id uuid;
  v_processed_count int := 0;
  v_success_count int := 0;
  v_fail_count int := 0;
  v_new_runs_done int;
  v_next_date date;
  v_err_msg text;
begin
  for v_sched in
    select *
    from public.scheduled_payments
    where status = 'active'
      and next_run_date <= v_today
    order by next_run_date asc, created_at asc
    for update skip locked
  loop
    v_processed_count := v_processed_count + 1;

    -- 1. Insert scheduled_payment_runs row for (schedule_id, next_run_date).
    -- If duplicate already exists, unique constraint skips this run.
    begin
      insert into public.scheduled_payment_runs (
        schedule_id, run_date, status
      ) values (
        v_sched.id, v_sched.next_run_date, 'failed'
      )
      returning id into v_run_id;
    exception
      when unique_violation then
        continue; -- Run already recorded or in progress for this date
    end;

    v_idempotency_key := 'sched:' || v_sched.id::text || ':' || v_sched.next_run_date::text;

    -- 2. Execute transfer or bill pay inside isolated sub-block
    begin
      if v_sched.kind = 'transfer' then
        v_res := public._transfer_core(
          v_sched.owner_id,
          v_sched.from_account,
          v_sched.to_account,
          v_sched.amount,
          v_idempotency_key,
          coalesce(v_sched.note, 'Scheduled Transfer'),
          'transfer'
        );
      elsif v_sched.kind = 'bill' then
        select * into v_biller
        from public.billers
        where id = v_sched.biller_id;

        if not found or not v_biller.is_active then
          raise exception 'Biller is inactive or unavailable';
        end if;

        v_res := public._transfer_core(
          v_sched.owner_id,
          v_sched.from_account,
          v_biller.account_id,
          v_sched.amount,
          v_idempotency_key,
          'Bill: ' || v_biller.name || ' · ' || v_sched.biller_reference,
          'bill_payment'
        );

        insert into public.bill_payments (
          transaction_id, biller_id, payer_account, biller_reference
        ) values (
          (v_res->>'id')::uuid, v_sched.biller_id, v_sched.from_account, v_sched.biller_reference
        )
        on conflict (transaction_id) do nothing;
      end if;

      v_tx_id := (v_res->>'id')::uuid;

      -- Update run status to completed
      update public.scheduled_payment_runs
      set status = 'completed',
          transaction_id = v_tx_id,
          failure_reason = null
      where id = v_run_id;

      v_success_count := v_success_count + 1;

    exception
      when others then
        v_err_msg := sqlerrm;
        -- Record failed run without throwing (does not rollback other schedules)
        update public.scheduled_payment_runs
        set status = 'failed',
            failure_reason = v_err_msg
        where id = v_run_id;

        insert into public.notifications (user_id, type, message)
        values (
          v_sched.owner_id,
          'scheduled_payment_failed',
          'Scheduled payment of PHP ' || trim(to_char(v_sched.amount / 100.0, 'FM999,999,990.00')) ||
          ' failed on ' || v_sched.next_run_date::text || ': ' || v_err_msg
        );

        v_fail_count := v_fail_count + 1;
    end;

    -- 3. Advance schedule dates and handle completion (§C.3)
    v_new_runs_done := v_sched.runs_done + 1;

    if v_sched.frequency = 'once' then
      update public.scheduled_payments
      set runs_done = v_new_runs_done,
          status = 'completed',
          updated_at = now()
      where id = v_sched.id;
    else
      -- Advance next_run_date
      if v_sched.frequency = 'weekly' then
        v_next_date := (v_sched.next_run_date + interval '7 days')::date;
      elsif v_sched.frequency = 'monthly' then
        -- Clamps to month-end anchored to start_date without drifting
        v_next_date := (v_sched.start_date + ((v_new_runs_done)::text || ' month')::interval)::date;
      end if;

      -- Check completion rules
      if (v_sched.max_runs is not null and v_new_runs_done >= v_sched.max_runs)
         or (v_sched.end_date is not null and v_next_date > v_sched.end_date) then
        update public.scheduled_payments
        set runs_done = v_new_runs_done,
            next_run_date = v_next_date,
            status = 'completed',
            updated_at = now()
      where id = v_sched.id;
      else
        update public.scheduled_payments
        set runs_done = v_new_runs_done,
            next_run_date = v_next_date,
            updated_at = now()
        where id = v_sched.id;
      end if;
    end if;

  end loop;

  return jsonb_build_object(
    'processed', v_processed_count,
    'succeeded', v_success_count,
    'failed', v_fail_count,
    'execution_date', v_today
  );
end;
$$;

-- Revoke run_due_scheduled_payments from client access
revoke execute on function public.run_due_scheduled_payments() from public, anon, authenticated;

-- Admin trigger for testing and manual execution
create or replace function public.admin_run_due_schedules_now()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_res jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admin authorization required';
  end if;

  perform public.write_audit(
    'admin_run_schedules_triggered',
    'scheduled_payments',
    null,
    jsonb_build_object('triggered_at', now())
  );

  v_res := public.run_due_scheduled_payments();
  return v_res;
end;
$$;

grant execute on function public.admin_run_due_schedules_now() to authenticated;

-- ------------------------------------------------------------------------------
-- 7. Admin Biller Management Functions (§C.5)
-- ------------------------------------------------------------------------------

-- admin_create_biller: creates biller settlement account under system user
create or replace function public.admin_create_biller(
  p_name text,
  p_category text,
  p_reference_label text,
  p_reference_pattern text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_system_user_id uuid;
  v_account_number text;
  v_account_id uuid;
  v_biller_id uuid;
  v_exists boolean;
begin
  if not public.is_admin() then
    raise exception 'Admin authorization required';
  end if;

  -- 1. Find system profile
  select id into v_system_user_id
  from public.profiles
  where role = 'system'
  limit 1;

  if v_system_user_id is null then
    raise exception 'System profile not found. Run seed to initialize system billers profile.';
  end if;

  -- 2. Generate unique 10-digit Davao Bank account number
  loop
    v_account_number := '10' || lpad(floor(random() * 100000000)::text, 8, '0');
    select exists (
      select 1 from public.accounts where account_number = v_account_number
    ) into v_exists;
    exit when not v_exists;
  end loop;

  -- 3. Provision settlement account under system user
  insert into public.accounts (
    account_number, user_id, type, currency, status
  ) values (
    v_account_number, v_system_user_id, 'checking', 'PHP', 'active'
  )
  returning id into v_account_id;

  -- 4. Create biller entry
  insert into public.billers (
    name, category, account_id, reference_label, reference_pattern, is_active
  ) values (
    trim(p_name), p_category, v_account_id, trim(p_reference_label), trim(p_reference_pattern), true
  )
  returning id into v_biller_id;

  perform public.write_audit(
    'biller_created',
    'billers',
    v_biller_id::text,
    jsonb_build_object(
      'name', p_name,
      'category', p_category,
      'account_number', v_account_number
    )
  );

  return jsonb_build_object(
    'id', v_biller_id,
    'name', p_name,
    'category', p_category,
    'account_id', v_account_id,
    'account_number', v_account_number,
    'reference_label', p_reference_label,
    'reference_pattern', p_reference_pattern,
    'is_active', true
  );
end;
$$;

grant execute on function public.admin_create_biller(text, text, text, text) to authenticated;

-- admin_set_biller_active
create or replace function public.admin_set_biller_active(
  p_biller_id uuid,
  p_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_biller record;
begin
  if not public.is_admin() then
    raise exception 'Admin authorization required';
  end if;

  select * into v_biller
  from public.billers
  where id = p_biller_id;

  if not found then
    raise exception 'Biller not found';
  end if;

  update public.billers
  set is_active = p_is_active
  where id = p_biller_id;

  perform public.write_audit(
    'biller_status_changed',
    'billers',
    p_biller_id::text,
    jsonb_build_object('name', v_biller.name, 'is_active', p_is_active)
  );

  return jsonb_build_object('success', true, 'id', p_biller_id, 'is_active', p_is_active);
end;
$$;

grant execute on function public.admin_set_biller_active(uuid, boolean) to authenticated;

-- ------------------------------------------------------------------------------
-- 8. Transaction-History and Statement Updates for bill_payment
-- ------------------------------------------------------------------------------
create or replace function public.get_account_transactions(
  p_account_id uuid default null
)
returns table (
  ledger_entry_id uuid,
  transaction_id uuid,
  account_id uuid,
  account_number text,
  type text,
  direction text,
  amount bigint,
  signed_amount bigint,
  status text,
  reference text,
  counterparty_account_number text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_caller_id uuid := auth.uid();
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  return query
  select
    le.id as ledger_entry_id,
    t.id as transaction_id,
    a.id as account_id,
    a.account_number,
    t.type,
    le.direction,
    le.amount,
    case when le.direction = 'credit' then le.amount else -le.amount end as signed_amount,
    t.status,
    t.reference,
    case
      when t.type in ('transfer', 'bill_payment') and tr.from_account = a.id then to_acc.account_number
      when t.type in ('transfer', 'bill_payment') and tr.to_account = a.id then from_acc.account_number
      else null
    end as counterparty_account_number,
    t.created_at
  from public.ledger_entries le
  join public.transactions t on t.id = le.transaction_id
  join public.accounts a on a.id = le.account_id
  left join public.transfers tr on tr.transaction_id = t.id
  left join public.accounts to_acc on to_acc.id = tr.to_account
  left join public.accounts from_acc on from_acc.id = tr.from_account
  where (public.is_admin() or a.user_id = v_caller_id)
    and (p_account_id is null or a.id = p_account_id)
  order by t.created_at desc;
end;
$$;

grant execute on function public.get_account_transactions(uuid) to authenticated;

-- ------------------------------------------------------------------------------
-- 9. pg_cron Recurring Job Registration (§C.3)
-- ------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('davao-run-schedules');
    perform cron.schedule('davao-run-schedules', '*/5 * * * *', 'select public.run_due_scheduled_payments()');
  end if;
exception
  when others then
    null; -- Graceful fallback if pg_cron is not yet loaded in current cluster
end;
$$;

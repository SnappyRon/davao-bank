-- Phase 6.5: five-minute server-enforced TOTP step-up. Apply only after review.
-- The window is session freshness, not a single-use transaction authorization.
create table public.security_settings (
  money_step_up_enabled boolean not null default true,
  step_up_window_seconds int not null default 300 check (step_up_window_seconds between 1 and 300)
);
create unique index security_settings_single_row on public.security_settings ((true));
insert into public.security_settings default values;
alter table public.security_settings enable row level security;
revoke all on public.security_settings from public, anon, authenticated, service_role;
grant update (money_step_up_enabled, step_up_window_seconds) on public.security_settings to authenticated;
create policy security_settings_admin_update on public.security_settings for update to authenticated
  using (public.is_admin() and auth.jwt()->>'aal' = 'aal2')
  with check (public.is_admin() and auth.jwt()->>'aal' = 'aal2');

create or replace function public.assert_money_step_up()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_enabled boolean;
  v_window int;
  v_jwt jsonb := auth.jwt();
  v_timestamp numeric;
begin
  select money_step_up_enabled, step_up_window_seconds into v_enabled, v_window from public.security_settings;
  if not found then raise exception 'STEP_UP_REQUIRED'; end if;
  if not v_enabled then return; end if;
  if auth.uid() is null or v_jwt is null or v_jwt = '{}'::jsonb then
    raise exception 'Authentication required';
  end if;
  if (v_jwt->>'aal') is distinct from 'aal2' then
    if not exists (select 1 from auth.mfa_factors where user_id = auth.uid() and factor_type = 'totp' and status = 'verified') then
      raise exception 'STEP_UP_NOT_ENROLLED';
    end if;
    raise exception 'STEP_UP_REQUIRED';
  end if;
  select max(case when entry->>'timestamp' ~ '^[0-9]+(\.[0-9]+)?$' then (entry->>'timestamp')::numeric end)
    into v_timestamp
    from jsonb_array_elements(case when jsonb_typeof(v_jwt->'amr') = 'array' then v_jwt->'amr' else '[]'::jsonb end) entry
    where entry->>'method' = 'totp';
  -- Allow 30 s of clock skew between the Auth server and the database.
  if v_timestamp is null or v_timestamp > extract(epoch from clock_timestamp()) + 30
     or extract(epoch from clock_timestamp()) - v_timestamp > v_window then
    raise exception 'STEP_UP_EXPIRED';
  end if;
end;
$$;
revoke all on function public.assert_money_step_up() from public, anon, authenticated;

create or replace function public.assert_admin_aal2()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if auth.jwt()->>'aal' is distinct from 'aal2' then raise exception 'STEP_UP_REQUIRED'; end if;
end;
$$;
revoke all on function public.assert_admin_aal2() from public, anon, authenticated;

-- Body copied from 20261023220000_phase5_stage_c_schedules_bills.sql; only the first guard statement is added.
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
  perform public.assert_money_step_up();
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

-- Body copied from 20261021173518_phase3_core_banking.sql; only the first guard statement is added.
create or replace function public.transfer_by_account_number(
  p_from_account uuid,
  p_to_account_number text,
  p_amount bigint,
  p_idempotency_key text,
  p_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_dest_account_id uuid;
begin
  perform public.assert_money_step_up();
  select id into v_dest_account_id
  from public.accounts
  where account_number = trim(p_to_account_number);

  if not found then
    raise exception 'Recipient account number not found: %', p_to_account_number;
  end if;

  return public.transfer(
    p_from_account,
    v_dest_account_id,
    p_amount,
    p_idempotency_key,
    p_reference
  );
end;
$$;

-- Body copied from 20261023184000_phase4_fixes.sql; only the first guard statement is added.
create or replace function public.withdraw(
  p_account uuid,
  p_amount bigint,
  p_idempotency_key text,
  p_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id uuid := auth.uid();
  v_existing_tx record;
  v_acc record;
  v_balance bigint;
  v_tx_id uuid;
  v_clean_ref text;
begin
  perform public.assert_money_step_up();
  -- 1. Idempotency Check
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
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  -- Fix 2: Check caller profile suspension status
  if exists (
    select 1
    from public.profiles
    where id = v_caller_id
      and status <> 'active'
  ) then
    raise exception 'Your profile is suspended';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Withdrawal amount must be greater than zero';
  end if;

  if p_amount > 500000000 then
    raise exception 'Withdrawal amount exceeds maximum allowed limit of PHP 5,000,000';
  end if;

  -- 3. Lock account
  perform 1 from public.accounts where id = p_account for update;

  select id, account_number, user_id, status, currency
  into v_acc
  from public.accounts
  where id = p_account;

  if not found then
    raise exception 'Account does not exist';
  end if;

  if v_acc.user_id <> v_caller_id then
    raise exception 'Unauthorized: account does not belong to caller';
  end if;

  if v_acc.status <> 'active' then
    raise exception 'Account is not active (current status: %)', v_acc.status;
  end if;

  -- 4. Calculate current balance inside the lock
  select coalesce(sum(case when direction = 'credit' then amount else -amount end), 0)
  into v_balance
  from public.ledger_entries
  where account_id = p_account;

  if v_balance < p_amount then
    raise exception 'Insufficient funds';
  end if;

  v_clean_ref := coalesce(nullif(trim(p_reference), ''), 'ATM Withdrawal');

  -- 5. Insert Transaction
  begin
    insert into public.transactions (
      type, status, initiated_by, idempotency_key, reference
    ) values (
      'withdrawal', 'completed', v_caller_id, p_idempotency_key, v_clean_ref
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

  insert into public.ledger_entries (account_id, transaction_id, direction, amount)
  values (p_account, v_tx_id, 'debit', p_amount);

  -- 6. Audit & Notification
  perform public.write_audit(
    'withdrawal_completed',
    'accounts',
    p_account::text,
    jsonb_build_object(
      'transaction_id', v_tx_id,
      'account_number', v_acc.account_number,
      'amount_centavos', p_amount,
      'reference', v_clean_ref
    )
  );

  insert into public.notifications (user_id, type, message)
  values (
    v_acc.user_id,
    'withdrawal',
    'Withdrawal of PHP ' || trim(to_char(p_amount / 100.0, 'FM999,999,990.00')) ||
    ' debited from account ' || v_acc.account_number || '.'
  );

  return jsonb_build_object(
    'id', v_tx_id,
    'type', 'withdrawal',
    'status', 'completed',
    'amount', p_amount,
    'account_number', v_acc.account_number,
    'reference', v_clean_ref,
    'idempotency_key', p_idempotency_key,
    'created_at', now(),
    'idempotent_replay', false
  );
end;
$$;

-- Body copied from 20261023220000_phase5_stage_c_schedules_bills.sql; only the first guard statement is added.
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
  perform public.assert_money_step_up();
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

-- Body copied from 20261104000000_phase6_stage_b_security.sql; only the first guard statement is added.
create or replace function public.pay_payment_request(
  p_request_id uuid,
  p_from_account uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_caller_id uuid := auth.uid();
  v_req record;
  v_from_acc record;
  v_tx_res jsonb;
  v_tx_id uuid;
begin
  perform public.assert_money_step_up();
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  -- 1. Lock payment request row FIRST to prevent race conditions & duplicate payment
  select * into v_req
  from public.payment_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Payment request not found';
  end if;

  -- 2. Verify caller is the designated payer
  if v_req.payer_user_id <> v_caller_id then
    raise exception 'Unauthorized to pay this payment request';
  end if;

  -- 3. Idempotent Retry Handling:
  -- If request is already paid by the same idempotency key, return existing success result
  if v_req.status = 'paid' then
    if v_req.transaction_id is not null then
      perform 1
      from public.transactions
      where id = v_req.transaction_id and idempotency_key = p_idempotency_key;

      if found then
        return jsonb_build_object(
          'success', true,
          'request_id', p_request_id,
          'transaction_id', v_req.transaction_id,
          'status', 'paid',
          'idempotent_replay', true
        );
      end if;
    end if;

    raise exception 'Payment request is no longer pending (status: %)', v_req.status;
  end if;

  if v_req.status <> 'pending' then
    raise exception 'Payment request is no longer pending (status: %)', v_req.status;
  end if;

  -- 4. Check expiry
  if now() >= v_req.expires_at then
    update public.payment_requests
    set status = 'expired'
    where id = p_request_id;

    raise exception 'Payment request has expired';
  end if;

  -- 5. Verify source account ownership
  select * into v_from_acc
  from public.accounts
  where id = p_from_account;

  if not found or v_from_acc.user_id <> v_caller_id then
    raise exception 'You do not own the payment source account';
  end if;

  if v_from_acc.status <> 'active' then
    raise exception 'Source payment account is not active';
  end if;

  -- 6. Execute atomic transfer via Single Money Engine (_transfer_core)
  v_tx_res := public._transfer_core(
    v_caller_id,
    p_from_account,
    v_req.requester_account,
    v_req.amount,
    p_idempotency_key,
    coalesce('Request: ' || v_req.note, 'Payment request response'),
    'transfer'
  );

  v_tx_id := (v_tx_res->>'id')::uuid;
  if v_tx_id is null then
    raise exception 'Failed to retrieve transaction id from transfer engine';
  end if;

  -- 7. Update payment request status in the SAME transaction
  update public.payment_requests
  set status = 'paid',
      transaction_id = v_tx_id,
      responded_at = now()
  where id = p_request_id;

  -- 8. Audit trail
  perform public.write_audit(
    'payment_request_paid',
    'payment_requests',
    p_request_id::text,
    jsonb_build_object(
      'transaction_id', v_tx_id,
      'amount', v_req.amount,
      'payer_account', v_from_acc.account_number
    )
  );

  -- 9. Notify requester
  insert into public.notifications (user_id, type, message)
  values (
    v_req.requester_id,
    'payment_request_paid',
    'Your payment request of PHP ' || trim(to_char(v_req.amount / 100.0, 'FM999,999,990.00')) ||
    ' was paid by account ' || v_from_acc.account_number
  );

  return jsonb_build_object(
    'success', true,
    'request_id', p_request_id,
    'transaction_id', v_tx_id,
    'status', 'paid',
    'transfer_result', v_tx_res
  );
end;
$$;

-- Body copied from 20261023220000_phase5_stage_c_schedules_bills.sql; only the first guard statement is added.
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
  perform public.assert_money_step_up();
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

-- Body copied from 20261103000000_phase6_stage0_carryovers.sql; only the first guard statement is added.
create or replace function public.create_scheduled_transfer_to_number(
  p_from_account uuid,
  p_to_account_number text,
  p_amount bigint,
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
  v_to_account uuid;
begin
  perform public.assert_money_step_up();
  if p_to_account_number is null or trim(p_to_account_number) = '' then
    raise exception 'Recipient account number not found';
  end if;

  select id into v_to_account
  from public.accounts
  where account_number = trim(p_to_account_number)
    and status = 'active';

  if v_to_account is null then
    raise exception 'Recipient account number not found';
  end if;

  return public.create_scheduled_payment(
    p_from_account := p_from_account,
    p_kind := 'transfer',
    p_to_account := v_to_account,
    p_biller_id := null,
    p_biller_reference := null,
    p_amount := p_amount,
    p_frequency := p_frequency,
    p_start_date := p_start_date,
    p_end_date := p_end_date,
    p_max_runs := p_max_runs,
    p_note := p_note
  );
end;
$$;

-- Body copied from 20261023220000_phase5_stage_c_schedules_bills.sql; only the first guard statement is added.
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
  if p_amount is not null or p_next_run_date is not null or p_end_date is not null or p_max_runs is not null then perform public.assert_money_step_up(); end if;
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

-- Body copied from 20261023051000_phase4_admin_management.sql; only the first guard statement is added.
create or replace function public.admin_adjust_balance(
  p_account_id uuid,
  p_amount bigint,
  p_direction text,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id uuid := auth.uid();
  v_existing_tx record;
  v_account record;
  v_current_balance bigint;
  v_clean_reason text;
  v_tx_id uuid;
  v_ledger_id uuid;
begin
  perform public.assert_admin_aal2();
  -- 1. Authorization
  if not public.is_admin() then
    raise exception 'Admin privilege required';
  end if;

  -- 2. Idempotency Check
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
    raise exception 'Idempotency key is required for balance adjustment';
  end if;

  -- 3. Validation
  if p_account_id is null then
    raise exception 'Account ID is required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Adjustment amount must be greater than zero';
  end if;

  if p_direction is null or p_direction not in ('credit', 'debit') then
    raise exception 'Direction must be credit or debit';
  end if;

  v_clean_reason := trim(coalesce(p_reason, ''));
  if v_clean_reason = '' then
    raise exception 'Reason is mandatory for manual balance adjustments';
  end if;

  -- 4. Concurrency Safety: Lock Account Under Review
  select * into v_account
  from public.accounts
  where id = p_account_id
  for update;

  if not found then
    raise exception 'Account not found';
  end if;

  if v_account.status = 'closed' then
    raise exception 'Cannot adjust balance of a closed account';
  end if;

  -- Calculate current balance from ledger under lock
  select coalesce(sum(case when direction = 'credit' then amount else -amount end), 0)
  into v_current_balance
  from public.ledger_entries
  where account_id = p_account_id;

  -- Check negative balance guard on debit
  if p_direction = 'debit' and (v_current_balance - p_amount < 0) then
    raise exception 'Adjustment debit would drive balance negative. Available: %, Requested debit: %', v_current_balance, p_amount;
  end if;

  -- 5. Execution
  begin
    insert into public.transactions (type, status, initiated_by, idempotency_key, reference)
    values ('adjustment', 'completed', v_caller_id, p_idempotency_key, v_clean_reason)
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

  insert into public.ledger_entries (account_id, transaction_id, direction, amount)
  values (p_account_id, v_tx_id, p_direction, p_amount)
  returning id into v_ledger_id;

  -- 6. Audit Log
  perform public.write_audit(
    'balance_adjustment',
    'accounts',
    p_account_id::text,
    jsonb_build_object(
      'admin_id', v_caller_id,
      'transaction_id', v_tx_id,
      'ledger_entry_id', v_ledger_id,
      'account_number', v_account.account_number,
      'direction', p_direction,
      'amount', p_amount,
      'reason', v_clean_reason,
      'balance_before', v_current_balance,
      'balance_after', case when p_direction = 'credit' then v_current_balance + p_amount else v_current_balance - p_amount end,
      'idempotency_key', p_idempotency_key
    )
  );

  -- 7. User Notification
  insert into public.notifications (user_id, type, message)
  values (
    v_account.user_id,
    'balance_adjustment',
    'Staff adjustment: ' || upper(p_direction) || ' ' || (p_amount / 100)::numeric(12,2) || ' PHP on account ' || v_account.account_number || '. Reason: ' || v_clean_reason
  );

  return jsonb_build_object(
    'id', v_tx_id,
    'type', 'adjustment',
    'status', 'completed',
    'account_id', p_account_id,
    'account_number', v_account.account_number,
    'direction', p_direction,
    'amount', p_amount,
    'reference', v_clean_reason,
    'idempotency_key', p_idempotency_key,
    'created_at', now(),
    'idempotent_replay', false
  );
end;
$$;

-- Body copied from 20261023184000_phase4_fixes.sql; only the first guard statement is added.
create or replace function public.admin_reverse_transaction(
  p_transaction_id uuid,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id uuid := auth.uid();
  v_existing_tx record;
  v_orig_tx record;
  v_clean_reason text;
  v_reversal_tx_id uuid;
  v_entry record;
  v_affected_account_ids uuid[];
  v_current_bal bigint;
  v_acc record;
  v_orig_transfer record;
begin
  perform public.assert_admin_aal2();
  -- 1. Authorization (Requires active admin)
  if not public.is_admin() then
    raise exception 'Admin privilege required';
  end if;

  -- 2. Idempotency Check
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
    raise exception 'Idempotency key is required for reversal';
  end if;

  -- 3. Validation
  if p_transaction_id is null then
    raise exception 'Transaction ID is required';
  end if;

  v_clean_reason := trim(coalesce(p_reason, ''));
  if v_clean_reason = '' then
    raise exception 'Reason is mandatory for transaction reversal';
  end if;

  -- Fix 1 Core: Lock the original transaction row FIRST before checking status
  select * into v_orig_tx
  from public.transactions
  where id = p_transaction_id
  for update;

  if not found then
    raise exception 'Transaction not found';
  end if;

  if v_orig_tx.status = 'reversed' then
    raise exception 'Transaction is already reversed';
  end if;

  if v_orig_tx.status <> 'completed' then
    raise exception 'Only completed transactions can be reversed (status: %)', v_orig_tx.status;
  end if;

  if v_orig_tx.type = 'reversal' then
    raise exception 'Cannot reverse a reversal transaction';
  end if;

  -- Find all affected account IDs
  select array_agg(account_id order by account_id) into v_affected_account_ids
  from (
    select distinct account_id from public.ledger_entries where transaction_id = p_transaction_id
  ) s;

  if v_affected_account_ids is null or array_length(v_affected_account_ids, 1) = 0 then
    raise exception 'No ledger entries found for transaction %', p_transaction_id;
  end if;

  -- 4. Concurrency Safety: Lock All Involved Accounts in Deterministic Order
  perform 1 from public.accounts where id = any(v_affected_account_ids) order by id for update;

  -- 5. Negative Balance Verification on Compensating Debits
  for v_entry in (
    select account_id, amount from public.ledger_entries
    where transaction_id = p_transaction_id and direction = 'credit'
  ) loop
    select coalesce(sum(case when direction = 'credit' then amount else -amount end), 0)
    into v_current_bal
    from public.ledger_entries
    where account_id = v_entry.account_id;

    if v_current_bal - v_entry.amount < 0 then
      select account_number into v_acc from public.accounts where id = v_entry.account_id;
      raise exception 'Reversal rejected: compensating debit of % would drive account % negative (Available: %)',
        v_entry.amount, v_acc.account_number, v_current_bal;
    end if;
  end loop;

  -- 6. Insert Reversal Transaction with structural guard reverses_transaction_id
  begin
    insert into public.transactions (
      type, status, initiated_by, idempotency_key, reference, reverses_transaction_id
    ) values (
      'reversal',
      'completed',
      v_caller_id,
      p_idempotency_key,
      'Reversal of ' || p_transaction_id || ': ' || v_clean_reason,
      p_transaction_id
    )
    returning id into v_reversal_tx_id;
  exception
    when unique_violation then
      -- Handles race condition on idempotency_key or reverses_transaction_id unique index
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

      raise exception 'Transaction is already reversed';
  end;

  -- 7. Mark Original Transaction as Reversed
  update public.transactions
  set status = 'reversed'
  where id = p_transaction_id;

  -- 8. Insert Opposite Compensating Ledger Entries
  for v_entry in (
    select account_id, direction, amount
    from public.ledger_entries
    where transaction_id = p_transaction_id
  ) loop
    insert into public.ledger_entries (account_id, transaction_id, direction, amount)
    values (
      v_entry.account_id,
      v_reversal_tx_id,
      case when v_entry.direction = 'credit' then 'debit' else 'credit' end,
      v_entry.amount
    );
  end loop;

  -- If original was transfer, insert compensating transfers row
  select * into v_orig_transfer from public.transfers where transaction_id = p_transaction_id;
  if found then
    insert into public.transfers (transaction_id, from_account, to_account, amount)
    values (v_reversal_tx_id, v_orig_transfer.to_account, v_orig_transfer.from_account, v_orig_transfer.amount);
  end if;

  -- 9. Audit Log
  perform public.write_audit(
    'transaction_reversed',
    'transactions',
    p_transaction_id::text,
    jsonb_build_object(
      'admin_id', v_caller_id,
      'reversal_transaction_id', v_reversal_tx_id,
      'original_type', v_orig_tx.type,
      'reason', v_clean_reason,
      'idempotency_key', p_idempotency_key
    )
  );

  -- 10. Notify Affected Account Owners
  insert into public.notifications (user_id, type, message)
  select distinct
    a.user_id,
    'transaction_reversed',
    'Transaction ' || p_transaction_id || ' was reversed by administration. Reason: ' || v_clean_reason
  from public.accounts a
  where a.id = any(v_affected_account_ids);

  return jsonb_build_object(
    'id', v_reversal_tx_id,
    'type', 'reversal',
    'status', 'completed',
    'reversed_transaction_id', p_transaction_id,
    'reference', 'Reversal of ' || p_transaction_id || ': ' || v_clean_reason,
    'idempotency_key', p_idempotency_key,
    'created_at', clock_timestamp()
  );
end;
$$;

-- Body copied from 20261023051000_phase4_admin_management.sql; only the first guard statement is added.
create or replace function public.admin_set_user_status(
  p_user_id uuid,
  p_status text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id uuid := auth.uid();
  v_profile record;
  v_old_status text;
  v_clean_reason text;
begin
  perform public.assert_admin_aal2();
  -- 1. Authorization
  if not public.is_admin() then
    raise exception 'Admin privilege required';
  end if;

  -- 2. Validation
  if p_user_id is null then
    raise exception 'User ID is required';
  end if;

  if p_status is null or p_status not in ('active', 'suspended') then
    raise exception 'Invalid status: must be active or suspended';
  end if;

  v_clean_reason := trim(coalesce(p_reason, ''));
  if v_clean_reason = '' then
    raise exception 'Reason is mandatory for changing user status';
  end if;

  select * into v_profile from public.profiles where id = p_user_id;
  if not found then
    raise exception 'User not found';
  end if;

  v_old_status := v_profile.status;

  -- 3. Execution
  update public.profiles
  set status = p_status
  where id = p_user_id;

  -- 4. Audit Log
  perform public.write_audit(
    'admin_user_status_changed',
    'profiles',
    p_user_id::text,
    jsonb_build_object(
      'admin_id', v_caller_id,
      'old_status', v_old_status,
      'new_status', p_status,
      'reason', v_clean_reason
    )
  );

  -- 5. User Notification
  insert into public.notifications (user_id, type, message)
  values (
    p_user_id,
    'account_alert',
    'Your Davao Bank profile status has been changed to ' || upper(p_status) || '. Reason: ' || v_clean_reason
  );

  return jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'old_status', v_old_status,
    'new_status', p_status,
    'reason', v_clean_reason
  );
end;
$$;

-- Body copied from 20261023184000_phase4_fixes.sql; only the first guard statement is added.
create or replace function public.admin_set_account_status(
  p_account_id uuid,
  p_status text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id uuid := auth.uid();
  v_account record;
  v_balance bigint;
  v_clean_reason text;
  v_old_status text;
begin
  perform public.assert_admin_aal2();
  -- 1. Authorization (Requires active admin)
  if not public.is_admin() then
    raise exception 'Admin privilege required';
  end if;

  -- 2. Validation
  if p_account_id is null then
    raise exception 'Account ID is required';
  end if;

  if p_status is null or p_status not in ('active', 'frozen', 'closed') then
    raise exception 'Invalid account status: must be active, frozen, or closed';
  end if;

  v_clean_reason := trim(coalesce(p_reason, ''));
  if v_clean_reason = '' then
    raise exception 'Reason is mandatory for changing account status';
  end if;

  -- Lock account under review
  select * into v_account
  from public.accounts
  where id = p_account_id
  for update;

  if not found then
    raise exception 'Account not found';
  end if;

  -- Fix 5 Core: Reject no-op changes immediately without writing audit or notification
  if v_account.status = p_status then
    raise exception 'Account is already %', p_status;
  end if;

  if v_account.status = 'closed' and p_status <> 'closed' then
    raise exception 'Cannot alter status of a closed account';
  end if;

  -- If closing, verify account balance is exactly zero
  if p_status = 'closed' then
    select coalesce(sum(case when direction = 'credit' then amount else -amount end), 0)
    into v_balance
    from public.ledger_entries
    where account_id = p_account_id;

    if v_balance <> 0 then
      raise exception 'Cannot close account with non-zero balance (% centavos). Balance must be zeroed first', v_balance;
    end if;
  end if;

  v_old_status := v_account.status;

  -- 3. Execution
  update public.accounts
  set status = p_status
  where id = p_account_id;

  -- 4. Audit Log (Authoritative single audit with admin attribution and reason)
  perform public.write_audit(
    'admin_account_status_changed',
    'accounts',
    p_account_id::text,
    jsonb_build_object(
      'admin_id', v_caller_id,
      'account_number', v_account.account_number,
      'old_status', v_old_status,
      'new_status', p_status,
      'reason', v_clean_reason
    )
  );

  -- 5. Notification
  insert into public.notifications (user_id, type, message)
  values (
    v_account.user_id,
    'account_alert',
    'Your Davao Bank account (' || v_account.account_number || ') status has been updated to ' || upper(p_status) || '. Reason: ' || v_clean_reason
  );

  return jsonb_build_object(
    'account_id', p_account_id,
    'account_number', v_account.account_number,
    'old_status', v_old_status,
    'new_status', p_status,
    'reason', v_clean_reason,
    'updated_at', now()
  );
end;
$$;

-- Body copied from 20261104000000_phase6_stage_b_security.sql; only the first guard statement is added.
create or replace function public.admin_open_account(
  p_user_id uuid,
  p_type text default 'savings',
  p_currency text default 'PHP'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_id uuid := auth.uid();
  v_account_number text;
  v_exists boolean;
  v_account_id uuid;
begin
  perform public.assert_admin_aal2();
  -- 1. Authorization
  if not public.is_admin() then
    raise exception 'Admin privilege required';
  end if;

  -- 2. Validation
  if p_user_id is null then
    raise exception 'User ID is required';
  end if;

  perform 1 from public.profiles where id = p_user_id;
  if not found then
    raise exception 'User profile not found';
  end if;

  if p_type is null or p_type not in ('savings', 'checking') then
    raise exception 'Invalid account type: must be savings or checking';
  end if;

  if p_currency is null or trim(p_currency) = '' then
    p_currency := 'PHP';
  end if;

  -- 3. Unique 10-digit Account Number Generation
  loop
    v_account_number := '10' || lpad(floor(random() * 100000000)::text, 8, '0');
    select exists (
      select 1 from public.accounts where account_number = v_account_number
    ) into v_exists;
    exit when not v_exists;
  end loop;

  -- 4. Insert Account
  insert into public.accounts (account_number, user_id, type, currency, status)
  values (v_account_number, p_user_id, p_type, p_currency, 'active')
  returning id into v_account_id;

  -- 5. Audit Log
  perform public.write_audit(
    'admin_account_opened',
    'accounts',
    v_account_id::text,
    jsonb_build_object(
      'admin_id', v_caller_id,
      'account_number', v_account_number,
      'user_id', p_user_id,
      'type', p_type,
      'currency', p_currency
    )
  );

  -- 6. Notification
  insert into public.notifications (user_id, type, message)
  values (
    p_user_id,
    'account_opened',
    'A new ' || upper(p_type) || ' account (' || v_account_number || ') has been opened for you by bank administration.'
  );

  return jsonb_build_object(
    'success', true,
    'account_id', v_account_id,
    'account_number', v_account_number,
    'user_id', p_user_id,
    'type', p_type,
    'currency', p_currency,
    'status', 'active'
  );
end;
$$;

-- Body copied from 20261023220000_phase5_stage_c_schedules_bills.sql; only the first guard statement is added.
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
  perform public.assert_admin_aal2();
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

-- Body copied from 20261023220000_phase5_stage_c_schedules_bills.sql; only the first guard statement is added.
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
  perform public.assert_admin_aal2();
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

-- Body copied from 20261023220000_phase5_stage_c_schedules_bills.sql; only the first guard statement is added.
create or replace function public.admin_run_due_schedules_now()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_res jsonb;
begin
  perform public.assert_admin_aal2();
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

create or replace function public.admin_reset_user_mfa(target_user uuid, reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_admin_aal2();
  if not public.is_admin() then raise exception 'Admin privilege required'; end if;
  if target_user = auth.uid() then raise exception 'Cannot reset your own MFA factors'; end if;
  if length(trim(coalesce(reason, ''))) < 10 then raise exception 'Reason must contain at least 10 characters'; end if;
  if not exists (select 1 from public.profiles where id = target_user and role = 'customer') then
    raise exception 'Customer not found';
  end if;
  delete from auth.mfa_factors where user_id = target_user;
  perform public.write_audit('user_mfa_reset', 'profiles', target_user::text, jsonb_build_object('reason', trim(reason)));
end;
$$;
revoke all on function public.admin_reset_user_mfa(uuid,text) from public, anon;
grant execute on function public.admin_reset_user_mfa(uuid,text) to authenticated;

-- Safe admin-only factor-status projection; never expose MFA secrets to clients.
create or replace function public.admin_user_has_totp(target_user uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_admin_aal2();
  if not public.is_admin() then raise exception 'Admin privilege required'; end if;
  return exists(select 1 from auth.mfa_factors where user_id = target_user and factor_type = 'totp' and status = 'verified');
end;
$$;
revoke all on function public.admin_user_has_totp(uuid) from public, anon;
grant execute on function public.admin_user_has_totp(uuid) to authenticated;

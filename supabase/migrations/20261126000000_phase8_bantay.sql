-- ==============================================================================
-- Phase 8 · Stage A — Bantay Security Center (Backend)
--
-- 1. Table public.security_limits + RLS scoped to auth.uid()
-- 2. Default limit provisioning (backfill + trigger on public.profiles)
-- 3. RPCs: get_security_settings(), set_daily_limit(bigint), lookup_payee(text)
-- 4. Guard function assert_daily_transfer_limit(...) called in _transfer_core
--    right after balance validation (covers transfer, transfer_by_account_number,
--    pay_bill, pay_payment_request, and run_due_scheduled_payments).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. security_limits table & RLS
-- ------------------------------------------------------------------------------
create table if not exists public.security_limits (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  daily_transfer_limit_centavos bigint not null default 5000000
    check (daily_transfer_limit_centavos between 100000 and 50000000),
  updated_at timestamptz not null default now()
);

alter table public.security_limits enable row level security;

revoke all on public.security_limits from public, anon, authenticated;
grant select on public.security_limits to authenticated;
grant all on public.security_limits to service_role;

drop policy if exists "security_limits_select_own" on public.security_limits;
create policy "security_limits_select_own"
  on public.security_limits
  for select
  to authenticated
  using (user_id = auth.uid());

create index if not exists idx_transactions_created_at
  on public.transactions(created_at);

-- ------------------------------------------------------------------------------
-- 2. Default limit provisioning for existing & new profiles
-- ------------------------------------------------------------------------------
insert into public.security_limits (user_id)
select id from public.profiles
on conflict (user_id) do nothing;

create or replace function public.ensure_profile_security_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.security_limits (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.ensure_profile_security_limit() from public, anon, authenticated;

drop trigger if exists trg_ensure_profile_security_limit on public.profiles;
create trigger trg_ensure_profile_security_limit
  after insert on public.profiles
  for each row execute function public.ensure_profile_security_limit();

-- ------------------------------------------------------------------------------
-- 3. Internal daily spend helper & guard
-- ------------------------------------------------------------------------------
create or replace function public._spent_today_centavos(p_user_id uuid)
returns bigint
language sql
security definer
set search_path = ''
stable
as $$
  with manila_bounds as (
    select
      ((now() at time zone 'Asia/Manila')::date::timestamp at time zone 'Asia/Manila') as day_start,
      (((now() at time zone 'Asia/Manila')::date + 1)::timestamp at time zone 'Asia/Manila') as day_end
  )
  select coalesce(sum(le.amount), 0)::bigint
  from public.ledger_entries le
  join public.transactions t on t.id = le.transaction_id
  join public.accounts a on a.id = le.account_id
  cross join manila_bounds mb
  where a.user_id = p_user_id
    and le.direction = 'debit'
    and t.type in ('transfer', 'bill_payment')
    and t.status in ('pending', 'completed')
    and t.created_at >= mb.day_start
    and t.created_at < mb.day_end;
$$;

revoke all on function public._spent_today_centavos(uuid) from public, anon, authenticated;

create or replace function public.assert_daily_transfer_limit(
  p_user_id uuid,
  p_amount bigint,
  p_idempotency_key text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_status text;
  v_limit bigint;
  v_spent_today bigint;
begin
  if p_user_id is null then
    raise exception 'Authentication required';
  end if;

  select status into v_profile_status
  from public.profiles
  where id = p_user_id;

  if found and v_profile_status <> 'active' then
    raise exception 'Your profile is suspended';
  end if;

  -- Preserve idempotent replay even if the daily limit is now full
  if p_idempotency_key is not null and p_idempotency_key <> '' then
    if exists (select 1 from public.transactions where idempotency_key = p_idempotency_key) then
      return;
    end if;
  end if;

  -- Let downstream amount validation reject null/non-positive amounts
  if p_amount is null or p_amount <= 0 then
    return;
  end if;

  -- Lock the user's security_limits row (insert default on demand if missing)
  select daily_transfer_limit_centavos
  into v_limit
  from public.security_limits
  where user_id = p_user_id
  for update;

  if not found and exists (select 1 from public.profiles where id = p_user_id) then
    insert into public.security_limits (user_id)
    values (p_user_id)
    on conflict (user_id) do nothing;

    select daily_transfer_limit_centavos
    into v_limit
    from public.security_limits
    where user_id = p_user_id
    for update;
  end if;

  v_limit := coalesce(v_limit, 5000000);
  v_spent_today := public._spent_today_centavos(p_user_id);

  if (v_spent_today + p_amount) > v_limit then
    raise exception 'Daily limit reached';
  end if;
end;
$$;

revoke all on function public.assert_daily_transfer_limit(uuid, bigint, text) from public, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 4. Bantay Security Center RPCs: get_security_settings, set_daily_limit, lookup_payee
-- ------------------------------------------------------------------------------
create or replace function public.get_security_settings()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_limit bigint;
  v_spent_today bigint;
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  if exists (select 1 from public.profiles where id = v_caller_id) then
    insert into public.security_limits (user_id)
    values (v_caller_id)
    on conflict (user_id) do nothing;

    select daily_transfer_limit_centavos
    into v_limit
    from public.security_limits
    where user_id = v_caller_id;
  end if;

  v_limit := coalesce(v_limit, 5000000);
  v_spent_today := public._spent_today_centavos(v_caller_id);

  return jsonb_build_object(
    'daily_transfer_limit_centavos', v_limit,
    'spent_today_centavos', v_spent_today,
    'remaining_today_centavos', greatest(v_limit - v_spent_today, 0)
  );
end;
$$;

revoke all on function public.get_security_settings() from public, anon;
grant execute on function public.get_security_settings() to authenticated;

create or replace function public.set_daily_limit(
  p_limit_centavos bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_profile_status text;
  v_old_limit bigint;
begin
  perform public.assert_money_step_up();

  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  select status into v_profile_status
  from public.profiles
  where id = v_caller_id;

  if not found then
    raise exception 'Profile not found';
  end if;

  if v_profile_status <> 'active' then
    raise exception 'Your profile is suspended';
  end if;

  if p_limit_centavos is null or p_limit_centavos < 100000 or p_limit_centavos > 50000000 then
    raise exception 'Daily limit must be between ₱1,000.00 and ₱500,000.00';
  end if;

  select daily_transfer_limit_centavos into v_old_limit
  from public.security_limits
  where user_id = v_caller_id;

  v_old_limit := coalesce(v_old_limit, 5000000);

  insert into public.security_limits (user_id, daily_transfer_limit_centavos, updated_at)
  values (v_caller_id, p_limit_centavos, now())
  on conflict (user_id) do update
    set daily_transfer_limit_centavos = excluded.daily_transfer_limit_centavos,
        updated_at = now();

  perform public.write_audit(
    'daily_limit_updated',
    'security_limits',
    v_caller_id::text,
    jsonb_build_object(
      'old_limit_centavos', v_old_limit,
      'new_limit_centavos', p_limit_centavos
    )
  );

  return public.get_security_settings();
end;
$$;

revoke all on function public.set_daily_limit(bigint) from public, anon;
grant execute on function public.set_daily_limit(bigint) to authenticated;

create or replace function public.lookup_payee(
  p_account_number text
)
returns table (
  masked_name text,
  account_type text
)
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_caller_id uuid := auth.uid();
  v_clean_acc text := trim(coalesce(p_account_number, ''));
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  if v_clean_acc = '' then
    return;
  end if;

  return query
  select
    (
      select string_agg(left(part, 1) || '***', ' ' order by ord)
      from unnest(
        regexp_split_to_array(
          trim(coalesce(nullif(trim(p.full_name), ''), 'Customer')),
          '\s+'
        )
      ) with ordinality as t(part, ord)
    ) as masked_name,
    a.type as account_type
  from public.accounts a
  join public.profiles p on p.id = a.user_id
  where a.account_number = v_clean_acc
    and a.status = 'active'
  limit 1;
end;
$$;

revoke all on function public.lookup_payee(text) from public, anon;
grant execute on function public.lookup_payee(text) to authenticated;

-- ------------------------------------------------------------------------------
-- 5. Daily Limit Enforcement in _transfer_core
-- Body copied from 20261111000000_phase7_notifications.sql; only the single
-- assert_daily_transfer_limit guard call after balance validation is added.
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

  -- 5b. Daily outgoing transfer / bill payment limit guard (Phase 8 Bantay)
  perform public.assert_daily_transfer_limit(p_actor, p_amount, p_idempotency_key);

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
    insert into public.notifications (user_id, type, message, related_transaction_id)
    values (
      v_from_acc.user_id,
      'bill_payment',
      'You paid ₱' || trim(to_char(p_amount / 100.0, 'FM999,999,999,990.00')) ||
      coalesce(' to ' || (select b.name from public.billers b where b.account_id = v_to_acc.id), '') || '.',
      v_tx_id
    );
  else
    insert into public.notifications (user_id, type, message, related_transaction_id)
    values (
      v_from_acc.user_id,
      'transfer_out',
      'You sent ₱' || trim(to_char(p_amount / 100.0, 'FM999,999,999,990.00')) ||
      ' to •• ' || right(v_to_acc.account_number, 4) || '.' ||
      coalesce(' Note: ' || nullif(trim(p_reference), ''), ''),
      v_tx_id
    );

    insert into public.notifications (user_id, type, message, related_transaction_id)
    values (
      v_to_acc.user_id,
      'transfer_in',
      'You received ₱' || trim(to_char(p_amount / 100.0, 'FM999,999,999,990.00')) ||
      ' from •• ' || right(v_from_acc.account_number, 4) || '.',
      v_tx_id
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

revoke all on function public._transfer_core(uuid, uuid, uuid, bigint, text, text, text) from public, anon, authenticated;

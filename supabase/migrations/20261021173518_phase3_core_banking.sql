-- ==============================================================================
-- Davao Bank — Phase 3: Core Banking Server-Side Logic
-- Atomic, Idempotent, Concurrency-Safe Money Movement & History Read Model
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 0. Pre-step Security Fix (§0)
-- Guard trigger preventing non-admins from changing profile role or status
-- ------------------------------------------------------------------------------
create or replace function public.guard_profile_self_update()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    if new.role is distinct from old.role or new.status is distinct from old.status then
      raise exception 'Only admins may change role or status';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_profile_self_update on public.profiles;

create trigger trg_guard_profile_self_update
  before update on public.profiles
  for each row execute function public.guard_profile_self_update();

-- ------------------------------------------------------------------------------
-- 1. Transfer Function (§3.1)
-- Atomic, Idempotent, Concurrency-Safe Peer-to-Peer Transfer
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
set search_path = public, auth
as $$
declare
  v_caller_id uuid := auth.uid();
  v_existing_tx record;
  v_from_acc record;
  v_to_acc record;
  v_source_balance bigint;
  v_tx_id uuid;
  v_transfer_id uuid;
  v_clean_ref text;
  v_first_acc uuid;
  v_second_acc uuid;
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
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Transfer amount must be greater than zero';
  end if;

  if p_amount > 500000000 then -- PHP 5,000,000.00 prototype ceiling
    raise exception 'Transfer amount exceeds maximum allowed limit of PHP 5,000,000';
  end if;

  if p_from_account is null or p_to_account is null then
    raise exception 'Source and destination accounts are required';
  end if;

  if p_from_account = p_to_account then
    raise exception 'Cannot transfer funds to the same account';
  end if;

  -- 3. Concurrency Safety: Deterministic Row Locking
  -- Lock both accounts in deterministic order (by UUID) to prevent deadlocks
  if p_from_account < p_to_account then
    v_first_acc := p_from_account;
    v_second_acc := p_to_account;
  else
    v_first_acc := p_to_account;
    v_second_acc := p_from_account;
  end if;

  perform 1 from public.accounts where id = v_first_acc for update;
  perform 1 from public.accounts where id = v_second_acc for update;

  -- 4. Account Verification
  select id, account_number, user_id, status, currency
  into v_from_acc
  from public.accounts
  where id = p_from_account;

  if not found then
    raise exception 'Source account does not exist';
  end if;

  -- Explicit ownership check (SECURITY DEFINER bypasses RLS)
  if v_from_acc.user_id <> v_caller_id then
    raise exception 'Unauthorized: source account does not belong to caller';
  end if;

  if v_from_acc.status <> 'active' then
    raise exception 'Source account is not active (current status: %)', v_from_acc.status;
  end if;

  select id, account_number, user_id, status, currency
  into v_to_acc
  from public.accounts
  where id = p_to_account;

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
  where account_id = p_from_account;

  if v_source_balance < p_amount then
    raise exception 'Insufficient funds';
  end if;

  v_clean_ref := coalesce(nullif(trim(p_reference), ''), 'Funds Transfer');

  -- 6. Insert All-or-Nothing Transaction (with race handling)
  begin
    insert into public.transactions (
      type, status, initiated_by, idempotency_key, reference
    ) values (
      'transfer', 'completed', v_caller_id, p_idempotency_key, v_clean_ref
    )
    returning id into v_tx_id;
  exception
    when unique_violation then
      -- Concurrent insert won the race: return existing transaction
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

  -- Insert transfer record
  insert into public.transfers (
    transaction_id, from_account, to_account, amount
  ) values (
    v_tx_id, p_from_account, p_to_account, p_amount
  )
  returning id into v_transfer_id;

  -- Insert balanced double-entry ledger entries (debit source, credit destination)
  insert into public.ledger_entries (account_id, transaction_id, direction, amount)
  values (p_from_account, v_tx_id, 'debit', p_amount);

  insert into public.ledger_entries (account_id, transaction_id, direction, amount)
  values (p_to_account, v_tx_id, 'credit', p_amount);

  -- 7. Audit log & In-app Notifications
  perform public.write_audit(
    'funds_transferred',
    'transfers',
    v_transfer_id::text,
    jsonb_build_object(
      'transaction_id', v_tx_id,
      'from_account', v_from_acc.account_number,
      'to_account', v_to_acc.account_number,
      'amount_centavos', p_amount,
      'reference', v_clean_ref
    )
  );

  -- Notify sender
  insert into public.notifications (user_id, type, message)
  values (
    v_from_acc.user_id,
    'transfer_out',
    'You transferred PHP ' || trim(to_char(p_amount / 100.0, 'FM999,999,990.00')) ||
    ' to account ' || v_to_acc.account_number || ' (Ref: ' || v_clean_ref || ').'
  );

  -- Notify recipient
  insert into public.notifications (user_id, type, message)
  values (
    v_to_acc.user_id,
    'transfer_in',
    'You received PHP ' || trim(to_char(p_amount / 100.0, 'FM999,999,990.00')) ||
    ' from account ' || v_from_acc.account_number || ' (Ref: ' || v_clean_ref || ').'
  );

  return jsonb_build_object(
    'id', v_tx_id,
    'type', 'transfer',
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

grant execute on function public.transfer(uuid, uuid, bigint, text, text) to authenticated;

-- Helper to transfer using recipient account number
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

grant execute on function public.transfer_by_account_number(uuid, text, bigint, text, text) to authenticated;

-- ------------------------------------------------------------------------------
-- 2. Simulated Deposit Function (§3.2)
-- Atomic, Idempotent Simulated Cash-in
-- ------------------------------------------------------------------------------
create or replace function public.deposit(
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
  v_tx_id uuid;
  v_clean_ref text;
begin
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

  if p_amount is null or p_amount <= 0 then
    raise exception 'Deposit amount must be greater than zero';
  end if;

  if p_amount > 500000000 then -- PHP 5,000,000.00 prototype ceiling
    raise exception 'Deposit amount exceeds maximum allowed limit of PHP 5,000,000';
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

  v_clean_ref := coalesce(nullif(trim(p_reference), ''), 'Cash Deposit');

  -- 4. Insert Transaction
  begin
    insert into public.transactions (
      type, status, initiated_by, idempotency_key, reference
    ) values (
      'deposit', 'completed', v_caller_id, p_idempotency_key, v_clean_ref
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

  -- Insert credit ledger entry
  insert into public.ledger_entries (account_id, transaction_id, direction, amount)
  values (p_account, v_tx_id, 'credit', p_amount);

  -- 5. Audit & Notification
  perform public.write_audit(
    'deposit_completed',
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
    'deposit',
    'Deposit of PHP ' || trim(to_char(p_amount / 100.0, 'FM999,999,990.00')) ||
    ' credited to account ' || v_acc.account_number || '.'
  );

  return jsonb_build_object(
    'id', v_tx_id,
    'type', 'deposit',
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

grant execute on function public.deposit(uuid, bigint, text, text) to authenticated;

-- ------------------------------------------------------------------------------
-- 3. Simulated Withdrawal Function (§3.3)
-- Atomic, Idempotent, Concurrency-Safe Cash Out with Balance Check
-- ------------------------------------------------------------------------------
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

  -- Insert debit ledger entry
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

grant execute on function public.withdraw(uuid, bigint, text, text) to authenticated;

-- ------------------------------------------------------------------------------
-- 4. Transaction-History Read Model (§3.4)
-- Returns per-account history rows scoped strictly to the caller
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
set search_path = public, auth
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
      when t.type = 'transfer' and tr.from_account = a.id then to_acc.account_number
      when t.type = 'transfer' and tr.to_account = a.id then from_acc.account_number
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

-- Security-invoker view for direct SQL queries
create or replace view public.account_transactions
with (security_invoker = true)
as
select
  le.id as ledger_entry_id,
  t.id as transaction_id,
  a.id as account_id,
  a.account_number,
  a.user_id,
  t.type,
  le.direction,
  le.amount,
  case when le.direction = 'credit' then le.amount else -le.amount end as signed_amount,
  t.status,
  t.reference,
  case
    when t.type = 'transfer' and tr.from_account = a.id then to_acc.account_number
    when t.type = 'transfer' and tr.to_account = a.id then from_acc.account_number
    else null
  end as counterparty_account_number,
  t.created_at
from public.ledger_entries le
join public.transactions t on t.id = le.transaction_id
join public.accounts a on a.id = le.account_id
left join public.transfers tr on tr.transaction_id = t.id
left join public.accounts to_acc on to_acc.id = tr.to_account
left join public.accounts from_acc on from_acc.id = tr.from_account;

-- Phase 7 · Stage 7B.9 — Notification wording, related transaction id and
-- biller name in transaction history (owner-approved 2026-11-11).
--
-- 1. notifications.related_transaction_id (nullable, FK to transactions,
--    on delete set null) + index. RLS policies are row-based (user_id /
--    is_admin) and unchanged; they cover the new column.
-- 2. Every function that inserts a notification is re-created from its latest
--    definition. The ONLY change in each is the notification insert statement:
--    new customer wording (sentence case, ₱, masked "•• 1234", no ids, no staff
--    reasons) and related_transaction_id where the function has just written
--    the transaction. Logic, signatures, security definer, search_path,
--    step-up guards and grants are unchanged (create or replace keeps grants).
-- 3. get_account_transactions gains a trailing nullable biller_name column
--    (bill_payment rows only). Return type changes, so it is dropped and
--    re-created with the same security, search_path, caller scoping and grants.

-- ------------------------------------------------------------------------------
-- 1. Related transaction id on notifications
-- ------------------------------------------------------------------------------
alter table public.notifications
  add column if not exists related_transaction_id uuid null
  references public.transactions(id) on delete set null;

create index if not exists idx_notifications_related_transaction_id
  on public.notifications(related_transaction_id);

-- ------------------------------------------------------------------------------
-- 2. Functions that write notifications (notification insert changed only)
-- ------------------------------------------------------------------------------

-- Body copied from 20261023220000_phase5_stage_c_schedules_bills.sql; only the notification insert changes.
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
    insert into public.notifications (user_id, type, message, related_transaction_id)
    values (
      v_from_acc.user_id,
      'bill_payment',
      'You paid ₱' || trim(to_char(p_amount / 100.0, 'FM999,999,990.00')) ||
      coalesce(' to ' || (select b.name from public.billers b where b.account_id = v_to_acc.id), '') || '.',
      v_tx_id
    );
  else
    insert into public.notifications (user_id, type, message, related_transaction_id)
    values (
      v_from_acc.user_id,
      'transfer_out',
      'You sent ₱' || trim(to_char(p_amount / 100.0, 'FM999,999,990.00')) ||
      ' to •• ' || right(v_to_acc.account_number, 4) || '.' ||
      coalesce(' Note: ' || nullif(trim(p_reference), ''), ''),
      v_tx_id
    );

    insert into public.notifications (user_id, type, message, related_transaction_id)
    values (
      v_to_acc.user_id,
      'transfer_in',
      'You received ₱' || trim(to_char(p_amount / 100.0, 'FM999,999,990.00')) ||
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

-- Body copied from 20261023184000_phase4_fixes.sql; only the notification insert changes.
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

  insert into public.notifications (user_id, type, message, related_transaction_id)
  values (
    v_acc.user_id,
    'deposit',
    'You added ₱' || trim(to_char(p_amount / 100.0, 'FM999,999,990.00')) ||
    ' to •• ' || right(v_acc.account_number, 4) || '.',
    v_tx_id
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

-- Body copied from 20261110000000_phase6_5_step_up.sql; only the notification insert changes.
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

  insert into public.notifications (user_id, type, message, related_transaction_id)
  values (
    v_acc.user_id,
    'withdrawal',
    'You cashed out ₱' || trim(to_char(p_amount / 100.0, 'FM999,999,990.00')) ||
    ' from •• ' || right(v_acc.account_number, 4) || '.',
    v_tx_id
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

-- Body copied from 20261110000000_phase6_5_step_up.sql; only the notification insert changes.
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
  insert into public.notifications (user_id, type, message, related_transaction_id)
  values (
    v_account.user_id,
    'balance_adjustment',
    case
      when p_direction = 'credit' then
        'We added ₱' || trim(to_char(p_amount / 100.0, 'FM999,999,990.00')) || ' to your account.'
      else
        'We deducted ₱' || trim(to_char(p_amount / 100.0, 'FM999,999,990.00')) || ' from your account.'
    end,
    v_tx_id
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

-- Body copied from 20261110000000_phase6_5_step_up.sql; only the notification insert changes.
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
  -- One notification per affected owner (as before). An owner of both sides
  -- of a transfer gets the sender's wording. No ids or staff reason.
  insert into public.notifications (user_id, type, message, related_transaction_id)
  select distinct on (a.user_id)
    a.user_id,
    'transaction_reversed',
    case
      when v_orig_tx.type = 'transfer' and a.id = v_orig_transfer.from_account then
        'Your transfer of ₱' || trim(to_char(v_orig_transfer.amount / 100.0, 'FM999,999,990.00')) ||
        ' to •• ' || right((select x.account_number from public.accounts x where x.id = v_orig_transfer.to_account), 4) ||
        ' was reversed.'
      when v_orig_tx.type = 'transfer' then
        'A transfer of ₱' || trim(to_char(v_orig_transfer.amount / 100.0, 'FM999,999,990.00')) ||
        ' from •• ' || right((select x.account_number from public.accounts x where x.id = v_orig_transfer.from_account), 4) ||
        ' was reversed.'
      when v_orig_tx.type = 'bill_payment' and a.id = v_orig_transfer.from_account then
        'Your bill payment of ₱' || trim(to_char(v_orig_transfer.amount / 100.0, 'FM999,999,990.00')) || ' was reversed.'
      when v_orig_tx.type = 'bill_payment' then
        'A bill payment of ₱' || trim(to_char(v_orig_transfer.amount / 100.0, 'FM999,999,990.00')) || ' was reversed.'
      when v_orig_tx.type = 'deposit' then
        'Money you added (₱' || trim(to_char((select le.amount from public.ledger_entries le where le.transaction_id = p_transaction_id and le.account_id = a.id limit 1) / 100.0, 'FM999,999,990.00')) || ') was reversed.'
      when v_orig_tx.type = 'withdrawal' then
        'Your cash out of ₱' || trim(to_char((select le.amount from public.ledger_entries le where le.transaction_id = p_transaction_id and le.account_id = a.id limit 1) / 100.0, 'FM999,999,990.00')) || ' was reversed.'
      else
        'A bank adjustment of ₱' || trim(to_char((select le.amount from public.ledger_entries le where le.transaction_id = p_transaction_id and le.account_id = a.id limit 1) / 100.0, 'FM999,999,990.00')) || ' was reversed.'
    end,
    v_reversal_tx_id
  from public.accounts a
  where a.id = any(v_affected_account_ids)
  order by a.user_id, (a.id = v_orig_transfer.from_account) desc nulls last;

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

-- Body copied from 20261110000000_phase6_5_step_up.sql; only the notification insert changes.
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
    case p_status
      when 'active' then 'Your account is active again.'
      when 'frozen' then 'Your account •• ' || right(v_account.account_number, 4) ||
        ' is on hold. You can''t send or receive money with it until our team reviews it.'
      else 'Your account •• ' || right(v_account.account_number, 4) || ' is now closed.'
    end
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

-- Body copied from 20261110000000_phase6_5_step_up.sql; only the notification insert changes.
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
    case p_status
      when 'active' then 'Your account is active again.'
      else 'Your account is on hold. You can''t send or receive money until our team reviews it.'
    end
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

-- Body copied from 20261110000000_phase6_5_step_up.sql; only the notification insert changes.
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
    'We opened a new ' || p_type || ' account for you: •• ' || right(v_account_number, 4) || '.'
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

-- Body copied from 20261023220000_phase5_stage_c_schedules_bills.sql; only the notification insert changes.
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
      'Your scheduled payment of ₱' || trim(to_char(v_sched.amount / 100.0, 'FM999,999,990.00')) ||
      ' was cancelled by our team.'
    );
  end if;

  return jsonb_build_object('success', true, 'id', p_id, 'status', 'cancelled');
end;
$$;

-- Body copied from 20261024090000_phase5_stage_d_qr_requests.sql; only the notification insert changes.
create or replace function public.create_payment_request(
  p_requester_account uuid,
  p_payer_account_number text,
  p_amount bigint,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_caller_id uuid := auth.uid();
  v_caller_profile record;
  v_req_acc record;
  v_payer_acc record;
  v_clean_payer_acc_num text;
  v_clean_note text;
  v_daily_count int;
  v_request_id uuid;
  v_expires_at timestamptz := now() + interval '7 days';
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  -- 1. Verify caller profile active
  select * into v_caller_profile
  from public.profiles
  where id = v_caller_id;

  if not found or v_caller_profile.status <> 'active' then
    raise exception 'Your profile is suspended or inactive';
  end if;

  -- 2. Verify requester account belongs to caller and is active
  select * into v_req_acc
  from public.accounts
  where id = p_requester_account;

  if not found or v_req_acc.user_id <> v_caller_id then
    raise exception 'You do not own the requesting account';
  end if;

  if v_req_acc.status <> 'active' then
    raise exception 'Requesting account is not active';
  end if;

  -- 3. Validate amount
  if p_amount is null or p_amount <= 0 then
    raise exception 'Requested amount must be greater than zero';
  end if;

  if p_amount > 50000000 then -- PHP 500,000 max single request cap
    raise exception 'Requested amount exceeds maximum transfer limit of PHP 500,000.00';
  end if;

  -- 4. Validate and resolve payer account
  v_clean_payer_acc_num := trim(p_payer_account_number);
  if not (v_clean_payer_acc_num ~ '^[0-9]{10}$') then
    raise exception 'Invalid payer account number. Must be a 10-digit Davao Bank account number.';
  end if;

  select * into v_payer_acc
  from public.accounts
  where account_number = v_clean_payer_acc_num;

  if not found then
    raise exception 'Payer account number not found';
  end if;

  if v_payer_acc.status <> 'active' then
    raise exception 'Payer account is not active';
  end if;

  -- 5. Payer cannot be caller
  if v_payer_acc.user_id = v_caller_id then
    raise exception 'Cannot request money from your own account';
  end if;

  -- 6. Validate note (max 60 chars)
  if p_note is not null then
    v_clean_note := trim(p_note);
    if char_length(v_clean_note) > 60 then
      raise exception 'Note exceeds maximum length of 60 characters';
    end if;
    if v_clean_note = '' then
      v_clean_note := null;
    end if;
  end if;

  -- 7. Daily rate limit: at most 10 requests per user per day in Philippine Time
  select count(*) into v_daily_count
  from public.payment_requests
  where requester_id = v_caller_id
    and created_at >= (now() at time zone 'Asia/Manila')::date::timestamptz;

  if v_daily_count >= 10 then
    raise exception 'Daily payment request limit reached (maximum 10 requests per day)';
  end if;

  -- 8. Insert payment request
  insert into public.payment_requests (
    requester_id,
    requester_account,
    payer_account_number,
    payer_user_id,
    amount,
    note,
    status,
    expires_at
  ) values (
    v_caller_id,
    p_requester_account,
    v_clean_payer_acc_num,
    v_payer_acc.user_id,
    p_amount,
    v_clean_note,
    'pending',
    v_expires_at
  )
  returning id into v_request_id;

  -- 9. Audit trail (never logs counterparty names)
  perform public.write_audit(
    'payment_request_created',
    'payment_requests',
    v_request_id::text,
    jsonb_build_object(
      'amount', p_amount,
      'payer_account', v_clean_payer_acc_num,
      'requester_account', v_req_acc.account_number
    )
  );

  -- 10. Notify payer (Account number only, preserving recipient privacy)
  insert into public.notifications (user_id, type, message)
  values (
    v_payer_acc.user_id,
    'payment_request_received',
    '•• ' || right(v_req_acc.account_number, 4) || ' requested ₱' ||
    trim(to_char(p_amount / 100.0, 'FM999,999,990.00')) || ' from you.' ||
    coalesce(' Note: ' || v_clean_note, '')
  );

  return jsonb_build_object(
    'success', true,
    'id', v_request_id,
    'amount', p_amount,
    'payer_account_number', v_clean_payer_acc_num,
    'status', 'pending',
    'expires_at', v_expires_at
  );
end;
$$;

-- Body copied from 20261024090000_phase5_stage_d_qr_requests.sql; only the notification insert changes.
create or replace function public.decline_payment_request(
  p_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_caller_id uuid := auth.uid();
  v_req record;
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_req
  from public.payment_requests
  where id = p_id
  for update;

  if not found then
    raise exception 'Payment request not found';
  end if;

  if v_req.payer_user_id <> v_caller_id then
    raise exception 'Unauthorized to decline this request';
  end if;

  if v_req.status <> 'pending' then
    return jsonb_build_object('success', true, 'id', p_id, 'status', v_req.status);
  end if;

  update public.payment_requests
  set status = 'declined',
      responded_at = now()
  where id = p_id;

  perform public.write_audit(
    'payment_request_declined',
    'payment_requests',
    p_id::text,
    jsonb_build_object('declined_by', v_caller_id)
  );

  insert into public.notifications (user_id, type, message)
  values (
    v_req.requester_id,
    'payment_request_declined',
    '•• ' || right(v_req.payer_account_number, 4) || ' declined your request for ₱' ||
    trim(to_char(v_req.amount / 100.0, 'FM999,999,990.00')) || '.'
  );

  return jsonb_build_object('success', true, 'id', p_id, 'status', 'declined');
end;
$$;

-- Body copied from 20261110000000_phase6_5_step_up.sql; only the notification insert changes.
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
  insert into public.notifications (user_id, type, message, related_transaction_id)
  values (
    v_req.requester_id,
    'payment_request_paid',
    '•• ' || right(v_from_acc.account_number, 4) || ' paid your request for ₱' ||
    trim(to_char(v_req.amount / 100.0, 'FM999,999,990.00')) || '.',
    v_tx_id
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

-- Body copied from 20261023220000_phase5_stage_c_schedules_bills.sql; only the notification insert changes.
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
          'Your scheduled payment of ₱' || trim(to_char(v_sched.amount / 100.0, 'FM999,999,990.00')) ||
          ' on ' || to_char(v_sched.next_run_date, 'Mon FMDD') || ' didn''t go through.' ||
          case when v_err_msg ilike '%insufficient funds%' then ' Your balance was too low.' else '' end
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

-- ------------------------------------------------------------------------------
-- 3. Transaction history with the biller name
-- ------------------------------------------------------------------------------
-- Body copied from 20261023220000_phase5_stage_c_schedules_bills.sql; adds the
-- trailing biller_name column and the two left joins that feed it.
drop function if exists public.get_account_transactions(uuid);

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
  created_at timestamptz,
  biller_name text
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
    t.created_at,
    case when t.type = 'bill_payment' then bl.name else null end as biller_name
  from public.ledger_entries le
  join public.transactions t on t.id = le.transaction_id
  join public.accounts a on a.id = le.account_id
  left join public.transfers tr on tr.transaction_id = t.id
  left join public.accounts to_acc on to_acc.id = tr.to_account
  left join public.accounts from_acc on from_acc.id = tr.from_account
  left join public.bill_payments bp on bp.transaction_id = t.id
  left join public.billers bl on bl.id = bp.biller_id
  where (public.is_admin() or a.user_id = v_caller_id)
    and (p_account_id is null or a.id = p_account_id)
  order by t.created_at desc;
end;
$$;

revoke execute on function public.get_account_transactions(uuid) from public, anon;
grant execute on function public.get_account_transactions(uuid) to authenticated;

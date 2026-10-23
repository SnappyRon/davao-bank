-- ==============================================================================
-- Davao Bank — Phase 4 Follow-Up Fixes Migration
-- ==============================================================================
-- Fix 1: Concurrency-safe reversals with row-locking and structural unique index
-- Fix 2: Enforcement of profile status ('suspended') across money operations and admin checks
-- Fix 3: Audit forgery prevention (revoke write_audit and internal helpers from public/anon/authenticated)
-- Fix 5: No-op account status transition rejection & drop redundant Phase 2 account audit trigger
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Fix 1: Structural Unique Guard for Reversals
-- Prevents double reversal even if race conditions or logic regress
-- ------------------------------------------------------------------------------
alter table public.transactions
  add column if not exists reverses_transaction_id uuid references public.transactions(id);

create unique index if not exists idx_transactions_reverses_tx
  on public.transactions (reverses_transaction_id)
  where reverses_transaction_id is not null;

-- ------------------------------------------------------------------------------
-- Fix 2: Update is_admin() to require status = 'active'
-- Suspended admins lose all admin privileges immediately
-- ------------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public, auth
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and status = 'active'
  );
$$;

grant execute on function public.is_admin() to authenticated;

-- ------------------------------------------------------------------------------
-- Fix 1: Lock Original Transaction First & Use Structural Guard in Reversal
-- ------------------------------------------------------------------------------
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

grant execute on function public.admin_reverse_transaction(uuid, text, text) to authenticated;

-- ------------------------------------------------------------------------------
-- Fix 2: Profile Suspension Enforcement in transfer()
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
    v_tx_id, p_from_account, p_to_account, p_amount
  )
  returning id into v_transfer_id;

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

-- ------------------------------------------------------------------------------
-- Fix 2: Profile Suspension Enforcement in deposit()
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
-- Fix 2: Profile Suspension Enforcement in withdraw()
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

grant execute on function public.withdraw(uuid, bigint, text, text) to authenticated;

-- ------------------------------------------------------------------------------
-- Fix 3: Audit Forgery Prevention
-- Revoke direct execution on write_audit and internal triggers from untrusted callers
-- ------------------------------------------------------------------------------
revoke execute on function public.write_audit(text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.audit_profile_changes() from public, anon, authenticated;
revoke execute on function public.guard_profile_self_update() from public, anon, authenticated;

-- ------------------------------------------------------------------------------
-- Fix 5: Account Status No-Op Rejection & Drop Redundant Phase 2 Trigger
-- ------------------------------------------------------------------------------
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

grant execute on function public.admin_set_account_status(uuid, text, text) to authenticated;

-- Drop redundant Phase 2 trigger to ensure account status transitions are audited exactly once
-- with full admin attribution and reason via admin_set_account_status
drop trigger if exists trigger_audit_account_status on public.accounts;

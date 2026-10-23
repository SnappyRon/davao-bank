-- ==============================================================================
-- Davao Bank — Phase 4: Admin Management System
-- Server-Side SECURITY DEFINER Functions for Privileged Operations
-- Gated by public.is_admin(), Append-Only Audit Logging, and Attribution
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Admin User Management (§3)
-- ------------------------------------------------------------------------------

/**
 * Suspend or activate a customer profile.
 * Requires admin privileges and a mandatory non-empty reason.
 * Emits audit log and notifies the affected user.
 */
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

grant execute on function public.admin_set_user_status(uuid, text, text) to authenticated;

-- ------------------------------------------------------------------------------
-- 2. Admin Account Management (§3)
-- ------------------------------------------------------------------------------

/**
 * Opens a new account for a customer with a generated unique 10-digit account number.
 */
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
  v_profile record;
  v_account_number text;
  v_exists boolean;
  v_account_id uuid;
begin
  -- 1. Authorization
  if not public.is_admin() then
    raise exception 'Admin privilege required';
  end if;

  -- 2. Validation
  if p_user_id is null then
    raise exception 'User ID is required';
  end if;

  select * into v_profile from public.profiles where id = p_user_id;
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

grant execute on function public.admin_open_account(uuid, text, text) to authenticated;

/**
 * Freeze, unfreeze, or close an account.
 * Requires admin privileges and a mandatory non-empty reason.
 */
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
  -- 1. Authorization
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

  -- 4. Audit Log
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
    'success', true,
    'account_id', p_account_id,
    'account_number', v_account.account_number,
    'old_status', v_old_status,
    'new_status', p_status,
    'reason', v_clean_reason
  );
end;
$$;

grant execute on function public.admin_set_account_status(uuid, text, text) to authenticated;

-- ------------------------------------------------------------------------------
-- 3. Manual Balance Adjustment (§3)
-- ------------------------------------------------------------------------------

/**
 * Manually credits or debits an account with a mandatory reason and idempotency key.
 * Enforces: amount > 0, direction in ('credit', 'debit'), no negative balance on debit.
 */
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

grant execute on function public.admin_adjust_balance(uuid, bigint, text, text, text) to authenticated;

-- ------------------------------------------------------------------------------
-- 4. Transaction Reversal (§3)
-- ------------------------------------------------------------------------------

/**
 * Reverses a completed transaction by creating compensating ledger entries with opposite directions.
 * Marks original transaction status = 'reversed'.
 * Guards against negative balances on compensating debits.
 * Keeps books balanced: reversal ledger entries net to zero.
 */
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

  select * into v_orig_tx from public.transactions where id = p_transaction_id;
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
  -- For every original ledger entry that was a credit, reversal will debit that account.
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

  -- 6. Insert Reversal Transaction
  begin
    insert into public.transactions (type, status, initiated_by, idempotency_key, reference)
    values ('reversal', 'completed', v_caller_id, p_idempotency_key, 'Reversal of ' || p_transaction_id || ': ' || v_clean_reason)
    returning id into v_reversal_tx_id;
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
    'created_at', now(),
    'idempotent_replay', false
  );
end;
$$;

grant execute on function public.admin_reverse_transaction(uuid, text, text) to authenticated;

-- ------------------------------------------------------------------------------
-- 5. Admin Reporting & KPI Read-Models (§3)
-- ------------------------------------------------------------------------------

/**
 * Returns complete user list with email verification status from auth.users.
 * Strict SECURITY DEFINER checked by is_admin().
 */
create or replace function public.admin_get_users()
returns table (
  id uuid,
  email text,
  email_confirmed boolean,
  full_name text,
  phone text,
  role text,
  status text,
  created_at timestamptz
)
language sql
security definer
set search_path = public, auth
stable
as $$
  select
    p.id,
    coalesce(u.email::text, 'No Email'),
    (u.email_confirmed_at is not null) as email_confirmed,
    p.full_name,
    p.phone,
    p.role,
    p.status,
    p.created_at
  from public.profiles p
  left join auth.users u on u.id = p.id
  where public.is_admin()
  order by p.created_at desc;
$$;

grant execute on function public.admin_get_users() to authenticated;

/**
 * Real-time Admin Dashboard KPIs calculated authoritative from DB.
 */
create or replace function public.admin_get_dashboard_stats()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
stable
as $$
declare
  v_total_users bigint;
  v_active_users bigint;
  v_suspended_users bigint;
  v_total_accounts bigint;
  v_active_accounts bigint;
  v_frozen_accounts bigint;
  v_total_balance bigint;
  v_total_transactions bigint;
  v_completed_transactions bigint;
  v_reversed_transactions bigint;
  v_total_volume bigint;
  v_recent_30d_transactions bigint;
begin
  if not public.is_admin() then
    raise exception 'Admin privilege required';
  end if;

  select count(*) into v_total_users from public.profiles;
  select count(*) filter (where status = 'active') into v_active_users from public.profiles;
  select count(*) filter (where status = 'suspended') into v_suspended_users from public.profiles;

  select count(*) into v_total_accounts from public.accounts;
  select count(*) filter (where status = 'active') into v_active_accounts from public.accounts;
  select count(*) filter (where status = 'frozen') into v_frozen_accounts from public.accounts;

  select coalesce(sum(balance), 0) into v_total_balance from public.account_balances;

  select count(*) into v_total_transactions from public.transactions;
  select count(*) filter (where status = 'completed') into v_completed_transactions from public.transactions;
  select count(*) filter (where status = 'reversed') into v_reversed_transactions from public.transactions;

  select coalesce(sum(amount), 0) into v_total_volume from public.ledger_entries where direction = 'credit';

  select count(*) into v_recent_30d_transactions
  from public.transactions
  where created_at >= (now() - interval '30 days');

  return jsonb_build_object(
    'total_users', v_total_users,
    'active_users', v_active_users,
    'suspended_users', v_suspended_users,
    'total_accounts', v_total_accounts,
    'active_accounts', v_active_accounts,
    'frozen_accounts', v_frozen_accounts,
    'total_system_balance', v_total_balance,
    'total_transactions', v_total_transactions,
    'completed_transactions', v_completed_transactions,
    'reversed_transactions', v_reversed_transactions,
    'total_volume', v_total_volume,
    'recent_30d_transactions', v_recent_30d_transactions
  );
end;
$$;

grant execute on function public.admin_get_dashboard_stats() to authenticated;

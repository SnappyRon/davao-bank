-- ==============================================================================
-- Davao Bank — Phase 6 Stage B: Security Hardening & Principle of Least Privilege
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Fix Linter Warnings: Clean Up Unused Variables in Stored Functions
-- ------------------------------------------------------------------------------

-- 1.1 admin_open_account: remove unused v_profile variable
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

-- 1.2 pay_payment_request: remove unused v_existing_tx variable
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

-- ------------------------------------------------------------------------------
-- 2. Principle of Least Privilege: Default Function Privileges & Revocation
-- ------------------------------------------------------------------------------

-- Ensure future functions in public schema do not grant execute to public or anon
alter default privileges in schema public revoke execute on functions from public, anon;

-- Revoke all existing function privileges from public and anon
revoke execute on all functions in schema public from public, anon;

-- ------------------------------------------------------------------------------
-- 3. Explicit Function Execution Grants for Authenticated Users
-- ------------------------------------------------------------------------------

grant execute on function public.ensure_my_profile() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.deposit(uuid, bigint, text, text) to authenticated;
grant execute on function public.withdraw(uuid, bigint, text, text) to authenticated;
grant execute on function public.transfer(uuid, uuid, bigint, text, text) to authenticated;
grant execute on function public.transfer_by_account_number(uuid, text, bigint, text, text) to authenticated;
grant execute on function public.get_account_transactions(uuid) to authenticated;
grant execute on function public.get_account_statement(uuid, date, date) to authenticated;
grant execute on function public.add_saved_recipient(text, text) to authenticated;
grant execute on function public.pay_bill(uuid, uuid, text, bigint, text) to authenticated;
grant execute on function public.create_scheduled_payment(uuid, text, uuid, uuid, text, bigint, text, date, date, integer, text) to authenticated;
grant execute on function public.create_scheduled_transfer_to_number(uuid, text, bigint, text, date, date, integer, text) to authenticated;
grant execute on function public.list_my_scheduled_payments() to authenticated;
grant execute on function public.cancel_scheduled_payment(uuid, text) to authenticated;
grant execute on function public.update_scheduled_payment(uuid, bigint, date, date, integer) to authenticated;
grant execute on function public.create_payment_request(uuid, text, bigint, text) to authenticated;
grant execute on function public.pay_payment_request(uuid, uuid, text) to authenticated;
grant execute on function public.decline_payment_request(uuid) to authenticated;
grant execute on function public.cancel_payment_request(uuid) to authenticated;
grant execute on function public.admin_get_dashboard_stats() to authenticated;
grant execute on function public.admin_get_users() to authenticated;
grant execute on function public.admin_open_account(uuid, text, text) to authenticated;
grant execute on function public.admin_set_user_status(uuid, text, text) to authenticated;
grant execute on function public.admin_set_account_status(uuid, text, text) to authenticated;
grant execute on function public.admin_adjust_balance(uuid, bigint, text, text, text) to authenticated;
grant execute on function public.admin_reverse_transaction(uuid, text, text) to authenticated;
grant execute on function public.admin_create_biller(text, text, text, text) to authenticated;
grant execute on function public.admin_set_biller_active(uuid, boolean) to authenticated;
grant execute on function public.admin_run_due_schedules_now() to authenticated;

-- Keep internal engine & trigger functions strictly closed (no client execution)
revoke execute on function public._transfer_core(uuid, uuid, uuid, bigint, text, text, text) from public, anon, authenticated;
revoke execute on function public.write_audit(text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.run_due_scheduled_payments() from public, anon, authenticated;
revoke execute on function public.expire_due_payment_requests() from public, anon, authenticated;
revoke execute on function public.upsert_fx_rates(jsonb) from public, anon, authenticated;
revoke execute on function public.guard_profile_self_update() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.audit_account_changes() from public, anon, authenticated;
revoke execute on function public.audit_profile_changes() from public, anon, authenticated;
revoke execute on function public.register_cron_jobs() from public, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 4. RLS Tightening: Restrict fx_rates and billers to authenticated only
-- ------------------------------------------------------------------------------

-- fx_rates: remove anon access; ensure authenticated only
drop policy if exists "fx_rates_select_anon" on public.fx_rates;
drop policy if exists "fx_rates_select_authenticated" on public.fx_rates;
create policy "fx_rates_select_authenticated"
  on public.fx_rates
  for select
  to authenticated
  using (auth.uid() is not null);

-- billers: restrict reading active billers to authenticated only
drop policy if exists "billers_read_active" on public.billers;
create policy "billers_read_active"
  on public.billers
  for select
  to authenticated
  using (is_active = true);

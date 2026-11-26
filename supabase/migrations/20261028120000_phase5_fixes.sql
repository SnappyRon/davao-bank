-- ==============================================================================
-- Davao Bank — Phase 5: Review Corrections & Hardening
-- Migration: 20261028120000_phase5_fixes.sql
--
-- Fixes addressed:
-- Fix 2: Allow service_role to set user role/status (seed.ts path) while keeping
--        customer self-elevation blocked.
-- Fix 3: Re-register scheduled payment cron job without failing on fresh database;
--        introduce public.register_cron_jobs().
-- Fix 4: Register daily FX sync cron job via pg_net / register_cron_jobs().
-- Fix 5: Link paid payment requests to transaction_id ('id' from _transfer_core)
--        and support idempotent retry on same idempotency key.
-- Fix 7: Restrict saved_recipients UPDATE permission to nickname only.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Fix 2: Service-Role Profile Guard Trigger
-- ------------------------------------------------------------------------------

create or replace function public.guard_profile_self_update()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  -- 1. Clients with an active session must strictly pass is_admin()
  if auth.uid() is not null then
    if not public.is_admin() then
      if new.role is distinct from old.role or new.status is distinct from old.status then
        raise exception 'Only admins may change role or status';
      end if;
    end if;
    return new;
  end if;

  -- 2. When auth.uid() is null, allow ONLY trusted backend execution (service_role, postgres, supabase_admin)
  if (
    current_user in ('service_role', 'postgres', 'supabase_admin') or
    coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
  ) then
    return new;
  end if;

  -- 3. Any other attempt without active session or service role is rejected
  raise exception 'Only admins may change role or status';
end;
$$;

revoke execute on function public.guard_profile_self_update() from public, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 2. Fix 7: Saved-Recipient Account Number Protection
-- ------------------------------------------------------------------------------

-- Ensure authenticated customers cannot rewrite the account_number column,
-- bypassing destination validation and account limits
revoke update on public.saved_recipients from authenticated;
grant update (nickname) on public.saved_recipients to authenticated;

-- ------------------------------------------------------------------------------
-- 3. Fix 5: Payment Request Transaction Link & Idempotent Retry
-- ------------------------------------------------------------------------------

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
  v_existing_tx record;
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
      select id, type, status, reference, created_at into v_existing_tx
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

  -- Fix 5: _transfer_core returns 'id', NOT 'transaction_id'
  v_tx_id := (v_tx_res->>'id')::uuid;
  if v_tx_id is null then
    raise exception 'Failed to retrieve transaction id from transfer engine';
  end if;

  -- 7. Update payment request status and link transaction in the SAME transaction
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

revoke all on function public.pay_payment_request(uuid, uuid, text) from public, anon;
grant execute on function public.pay_payment_request(uuid, uuid, text) to authenticated;

-- ------------------------------------------------------------------------------
-- 4. Fix 3 & Fix 4: Consolidated Cron Job Management (register_cron_jobs)
-- ------------------------------------------------------------------------------

create or replace function public.register_cron_jobs()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_results jsonb := '{}'::jsonb;
  v_cron_available boolean := false;
  v_net_available boolean := false;
  v_edge_url text;
  v_service_key text;
begin
  -- 1. Check if pg_cron namespace exists
  select exists (
    select 1 from pg_namespace where nspname = 'cron'
  ) into v_cron_available;

  if not v_cron_available then
    raise warning 'pg_cron extension is not installed in database. Enable pg_cron via Supabase Dashboard -> Database -> Extensions.';
    return jsonb_build_object('success', false, 'error', 'pg_cron extension not installed');
  end if;

  select exists (
    select 1 from pg_namespace where nspname = 'net'
  ) into v_net_available;

  -- 2. Job: davao-run-schedules (runs hourly: '0 * * * *')
  -- Wrap unschedule in isolated block so fresh databases do not fail
  begin
    perform cron.unschedule('davao-run-schedules');
  exception when others then
    null;
  end;

  perform cron.schedule(
    'davao-run-schedules',
    '0 * * * *',
    'select public.run_due_scheduled_payments();'
  );
  v_results := jsonb_set(v_results, '{davao-run-schedules}', '"registered"');

  -- 3. Job: davao-expire-payment-requests (runs daily at midnight: '0 0 * * *')
  begin
    perform cron.unschedule('davao-expire-payment-requests');
  exception when others then
    null;
  end;

  perform cron.schedule(
    'davao-expire-payment-requests',
    '0 0 * * *',
    'select public.expire_due_payment_requests();'
  );
  v_results := jsonb_set(v_results, '{davao-expire-payment-requests}', '"registered"');

  -- 4. Job: davao-daily-fx-sync (runs daily at 04:00 UTC: '0 4 * * *')
  begin
    perform cron.unschedule('davao-daily-fx-sync');
  exception when others then
    null;
  end;

  v_edge_url := current_setting('app.settings.edge_function_url', true);
  v_service_key := current_setting('app.settings.service_role_key', true);

  if v_net_available and v_edge_url is not null and v_edge_url <> '' then
    perform cron.schedule(
      'davao-daily-fx-sync',
      '0 4 * * *',
      format($cron$
        select net.http_post(
          url := %L || '/fx-sync',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || coalesce(%L, '')
          ),
          body := '{"backfill": false}'::jsonb
        );
      $cron$, v_edge_url, v_service_key)
    );
    v_results := jsonb_set(v_results, '{davao-daily-fx-sync}', '"registered_via_pg_net"');
  else
    perform cron.schedule(
      'davao-daily-fx-sync',
      '0 4 * * *',
      '-- Triggered via Supabase scheduled function or pg_net http_post'
    );
    v_results := jsonb_set(v_results, '{davao-daily-fx-sync}', '"registered_standin"');
  end if;

  return jsonb_build_object('success', true, 'jobs', v_results);
end;
$$;

revoke all on function public.register_cron_jobs() from public, anon, authenticated;
grant execute on function public.register_cron_jobs() to service_role, postgres;

-- ------------------------------------------------------------------------------
-- 5. Safe Activation of Cron Jobs
-- ------------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform public.register_cron_jobs();
  else
    raise warning 'pg_cron extension not active; skipping immediate cron job registration. Run select public.register_cron_jobs() once pg_cron is enabled.';
  end if;
exception when others then
  raise warning 'Notice on cron registration: %', sqlerrm;
end;
$$;

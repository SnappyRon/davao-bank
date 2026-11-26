-- ==============================================================================
-- Davao Bank — Phase 6 Review Fixes Migration
--
-- 1. F3: Recreate billers select policy to allow authenticated users with
--    is_active = true OR public.is_admin() so staff can see and manage inactive billers.
-- 2. F11: Update register_cron_jobs() to set timeout_milliseconds := 30000 in
--    net.http_post for davao-daily-fx-sync, preventing false pg_net timeout errors.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. F3: Billers Select Policy Fix
-- ------------------------------------------------------------------------------

drop policy if exists "billers_read_active" on public.billers;
drop policy if exists "billers_read_active_or_admin" on public.billers;
drop policy if exists "billers_authenticated_read" on public.billers;

create policy "billers_read_active"
  on public.billers
  for select
  to authenticated
  using (is_active = true or public.is_admin());

-- ------------------------------------------------------------------------------
-- 2. F11: Re-register Cron Jobs with 30s HTTP Timeout
-- ------------------------------------------------------------------------------

create or replace function public.register_cron_jobs()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_results jsonb := '{}'::jsonb;
  v_cron_available boolean := false;
  v_net_available boolean := false;
begin
  -- Check if required extensions are installed in the database
  select exists (
    select 1 from pg_namespace where nspname = 'cron'
  ) into v_cron_available;

  select exists (
    select 1 from pg_namespace where nspname = 'net'
  ) into v_net_available;

  if not v_cron_available then
    return jsonb_build_object(
      'success', false,
      'error', 'pg_cron extension is not active in this database'
    );
  end if;

  -- 1. Clear existing jobs to ensure clean, idempotent registration
  begin
    perform cron.unschedule('davao-run-scheduled-payments');
  exception when others then
    null;
  end;

  -- 2. Job: davao-run-schedules (runs every 5 minutes: '*/5 * * * *')
  begin
    perform cron.unschedule('davao-run-schedules');
  exception when others then
    null;
  end;

  perform cron.schedule(
    'davao-run-schedules',
    '*/5 * * * *',
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
  -- Vault lookup at runtime with 30,000ms timeout to prevent pg_net timeouts
  begin
    perform cron.unschedule('davao-daily-fx-sync');
  exception when others then
    null;
  end;

  if v_net_available then
    perform cron.schedule(
      'davao-daily-fx-sync',
      '0 4 * * *',
      $cron$
        select net.http_post(
          url := 'https://qomxlzvrovwsfneqsfej.supabase.co/functions/v1/fx-sync',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-fx-sync-secret', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'FX_SYNC_SECRET' limit 1), '')
          ),
          body := '{"backfill": false}'::jsonb,
          timeout_milliseconds := 30000
        );
      $cron$
    );
    v_results := jsonb_set(v_results, '{davao-daily-fx-sync}', '"registered_via_pg_net"');
  else
    perform cron.schedule(
      'davao-daily-fx-sync',
      '0 4 * * *',
      '-- Stand-in placeholder: pg_net extension not enabled'
    );
    v_results := jsonb_set(v_results, '{davao-daily-fx-sync}', '"registered_standin"');
  end if;

  return jsonb_build_object('success', true, 'jobs', v_results);
end;
$$;

revoke all on function public.register_cron_jobs() from public, anon, authenticated;
grant execute on function public.register_cron_jobs() to service_role, postgres;

-- Re-run job registration if cron is active
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform public.register_cron_jobs();
  end if;
exception when others then
  raise warning 'Notice on cron registration: %', sqlerrm;
end;
$$;


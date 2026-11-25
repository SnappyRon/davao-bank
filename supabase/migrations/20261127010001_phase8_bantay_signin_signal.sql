-- ==============================================================================
-- Davao Bank — Phase 8 Stage E: sign-in failure signal support
-- ==============================================================================
-- Hosted evidence (read-only, 2026-11-25): auth.audit_log_entries has zero rows,
-- so failed password sign-ins are not available for the cron variant. The app
-- therefore calls the `signin-signal` Edge Function. This migration only creates
-- the rate-limit ledger and service-role-only RPCs. It does NOT create the 8D
-- security_events table (that belongs to 20261127000000_phase8_bantay_risk.sql);
-- write_signin_failure_event resolves it at call time.

-- ------------------------------------------------------------------------------
-- 1. Hashed attempt ledger. No raw email or IP is stored anywhere.
-- ------------------------------------------------------------------------------
create table if not exists public.signin_signal_attempts (
  id uuid primary key default gen_random_uuid(),
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_signin_signal_attempts_email
  on public.signin_signal_attempts(email_hash, created_at desc);
create index if not exists idx_signin_signal_attempts_ip
  on public.signin_signal_attempts(ip_hash, created_at desc);

alter table public.signin_signal_attempts enable row level security;

-- No customer policies: every access goes through the service-role RPCs below.
revoke all on public.signin_signal_attempts from public, anon, authenticated;
grant all on public.signin_signal_attempts to service_role;

-- ------------------------------------------------------------------------------
-- 2. Record one hashed failure and return the 15-minute counts.
--    Caller check: EXECUTE is granted only to service_role (Edge Function).
-- ------------------------------------------------------------------------------
create or replace function public.record_signin_failure_signal(
  p_email_hash text,
  p_ip_hash text,
  p_user_id uuid
)
returns table (email_attempts bigint, ip_attempts bigint)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_email_hash is null or p_email_hash !~ '^[0-9a-f]{64}$'
     or p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid sign-in signal';
  end if;

  insert into public.signin_signal_attempts (email_hash, ip_hash, user_id)
  values (p_email_hash, p_ip_hash, p_user_id);

  return query
    select
      count(*) filter (
        where email_hash = p_email_hash
          and created_at > now() - interval '15 minutes'
      )::bigint as email_attempts,
      count(*) filter (
        where ip_hash = p_ip_hash
          and created_at > now() - interval '15 minutes'
      )::bigint as ip_attempts
    from public.signin_signal_attempts;
end;
$$;

revoke all on function public.record_signin_failure_signal(text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.record_signin_failure_signal(text, text, uuid)
  to service_role;

-- ------------------------------------------------------------------------------
-- 3. Write one signin_failures event per hashed email in a 15-minute window.
--    Resolved at call time so this migration can be applied before/after 8D.
--    Caller check: EXECUTE is granted only to service_role (Edge Function).
-- ------------------------------------------------------------------------------
create or replace function public.write_signin_failure_event(
  p_user_id uuid,
  p_email_hash text,
  p_attempt_count bigint
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_written boolean := false;
begin
  if p_user_id is null or p_email_hash is null
     or p_email_hash !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  if not exists (
    select 1
    from public.security_events se
    where se.user_id = p_user_id
      and se.kind = 'signin_failures'
      and se.created_at > now() - interval '15 minutes'
      and se.facts ->> 'email_hash' = p_email_hash
  ) then
    insert into public.security_events (user_id, kind, severity, score, facts)
    values (
      p_user_id,
      'signin_failures',
      'warning',
      25,
      jsonb_build_object(
        'email_hash', p_email_hash,
        'attempt_count', p_attempt_count,
        'window_minutes', 15
      )
    );
    v_written := true;
  end if;

  return v_written;
end;
$$;

revoke all on function public.write_signin_failure_event(uuid, text, bigint)
  from public, anon, authenticated;
grant execute on function public.write_signin_failure_event(uuid, text, bigint)
  to service_role;

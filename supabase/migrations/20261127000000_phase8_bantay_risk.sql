-- ==============================================================================
-- Phase 8 · Stage 8D — Bantay risk engine, events, devices and lock
--
-- Extends 20261126000000_phase8_bantay.sql (Stage 8A). No applied migration is
-- edited. The four protected functions (_transfer_core, withdraw,
-- create_scheduled_payment, create_scheduled_transfer_to_number) are copied from
-- their latest definitions with ONLY the approved guard lines added; see
-- docs/agents/notes/phase-8-bantay-risk.md for the line-by-line diffs.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Extend security_limits with lock / delayed-raise fields
-- ------------------------------------------------------------------------------
alter table public.security_limits add column if not exists locked_at timestamptz null;
alter table public.security_limits add column if not exists unlock_after timestamptz null;
alter table public.security_limits add column if not exists pending_limit_centavos bigint null;
alter table public.security_limits add column if not exists pending_limit_effective_at timestamptz null;

-- A locked customer's schedules must be paused, not deleted (frozen contract).
alter table public.scheduled_payments drop constraint if exists scheduled_payments_status_check;
alter table public.scheduled_payments add constraint scheduled_payments_status_check
  check (status in ('active', 'completed', 'cancelled', 'paused'));

-- ------------------------------------------------------------------------------
-- 2. New tables (RLS on, no client writes)
-- ------------------------------------------------------------------------------
create table public.security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in (
    'risky_payment_challenged', 'risky_payment_warning', 'risky_payment_confirmed',
    'new_device', 'signin_failures', 'code_failures', 'mfa_changed',
    'password_changed', 'limit_changed', 'account_locked', 'account_unlocked'
  )),
  severity text not null default 'info' check (severity in ('info', 'warning', 'high')),
  score int null check (score between 0 and 100),
  facts jsonb not null default '{}'::jsonb,
  explanation text null,
  explanation_source text null check (explanation_source in ('ai', 'template')),
  status text not null default 'open' check (status in ('open', 'confirmed_me', 'reported_not_me', 'dismissed')),
  related_transaction_id uuid null,
  created_at timestamptz not null default now()
);

create table public.user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  install_id text not null,
  label text null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  trusted boolean not null default false,
  unique (user_id, install_id)
);

create table public.device_sessions (
  session_id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_id uuid not null references public.user_devices(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.risk_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  idempotency_key text not null unique,
  score int not null check (score between 0 and 100),
  facts jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  confirmed_at timestamptz null,
  created_at timestamptz not null default now()
);

create table public.trusted_payees (
  user_id uuid not null references public.profiles(id) on delete cascade,
  account_number text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, account_number)
);

create table public.security_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  opened_by text not null check (opened_by in ('customer', 'system', 'staff')),
  event_id uuid null references public.security_events(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'investigating', 'resolved')),
  staff_note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Internal failure counter for the step-up signal; never exposed to clients.
create table public.bantay_step_up_failures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  occurred_at timestamptz not null default now()
);

alter table public.security_events enable row level security;
alter table public.user_devices enable row level security;
alter table public.device_sessions enable row level security;
alter table public.risk_challenges enable row level security;
alter table public.trusted_payees enable row level security;
alter table public.security_cases enable row level security;
alter table public.bantay_step_up_failures enable row level security;

revoke all on public.security_events from public, anon, authenticated;
revoke all on public.user_devices from public, anon, authenticated;
revoke all on public.device_sessions from public, anon, authenticated;
revoke all on public.risk_challenges from public, anon, authenticated;
revoke all on public.trusted_payees from public, anon, authenticated;
revoke all on public.security_cases from public, anon, authenticated;
revoke all on public.bantay_step_up_failures from public, anon, authenticated;

grant select on public.security_events to authenticated;
grant select on public.user_devices to authenticated;
grant select on public.device_sessions to authenticated;
grant select on public.risk_challenges to authenticated;
grant select on public.trusted_payees to authenticated;
grant select on public.security_cases to authenticated;
grant all on public.security_events, public.user_devices, public.device_sessions,
  public.risk_challenges, public.trusted_payees, public.security_cases,
  public.bantay_step_up_failures to service_role;

drop policy if exists "security_events_select_own" on public.security_events;
create policy "security_events_select_own" on public.security_events
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists "user_devices_select_own" on public.user_devices;
create policy "user_devices_select_own" on public.user_devices
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "device_sessions_select_own" on public.device_sessions;
create policy "device_sessions_select_own" on public.device_sessions
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "risk_challenges_select_own" on public.risk_challenges;
create policy "risk_challenges_select_own" on public.risk_challenges
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "trusted_payees_select_own" on public.trusted_payees;
create policy "trusted_payees_select_own" on public.trusted_payees
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "security_cases_select_own_or_admin" on public.security_cases;
create policy "security_cases_select_own_or_admin" on public.security_cases
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

create index if not exists idx_security_events_user_created
  on public.security_events(user_id, created_at desc);
create index if not exists idx_risk_challenges_user
  on public.risk_challenges(user_id, created_at desc);
create index if not exists idx_security_cases_status
  on public.security_cases(status, created_at desc);
create index if not exists idx_bantay_step_up_failures_user_time
  on public.bantay_step_up_failures(user_id, occurred_at);

-- ------------------------------------------------------------------------------
-- 3. Internal helpers
-- ------------------------------------------------------------------------------
create or replace function public._bantay_event(
  p_user_id uuid,
  p_kind text,
  p_severity text default 'info',
  p_score int default null,
  p_facts jsonb default '{}'::jsonb,
  p_related_transaction_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_user_id is null then
    return null;
  end if;

  insert into public.security_events
    (user_id, kind, severity, score, facts, related_transaction_id)
  values
    (p_user_id, p_kind, p_severity, p_score, coalesce(p_facts, '{}'::jsonb), p_related_transaction_id)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public._bantay_event(uuid, text, text, int, jsonb, uuid)
  from public, anon, authenticated;

create or replace function public._bantay_band(p_score int)
returns text
language sql
immutable
as $$
  select case
    when p_score is null then 'allow'
    when p_score >= 70 then 'challenge'
    when p_score >= 40 then 'warning'
    else 'allow'
  end;
$$;

revoke all on function public._bantay_band(int) from public, anon, authenticated;

create or replace function public._schedule_risk_key(
  p_user_id uuid,
  p_kind text,
  p_target uuid,
  p_amount bigint,
  p_start_date date
)
returns text
language sql
immutable
as $$
  select 'plan:' || coalesce(p_user_id::text, '') || ':' || coalesce(p_kind, '') ||
    ':' || coalesce(p_target::text, '') || ':' || coalesce(p_amount::text, '') ||
    ':' || coalesce(p_start_date::text, '');
$$;

revoke all on function public._schedule_risk_key(uuid, text, uuid, bigint, date)
  from public, anon, authenticated;

-- Pure score computation. p_now is an injection point for tests only; clients
-- cannot call this function. No names, account numbers or note text are emitted.
create or replace function public._compute_payment_risk(
  p_user_id uuid,
  p_to_account uuid,
  p_amount bigint,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_signals text[] := '{}'::text[];
  v_score int := 0;
  v_new_payee boolean := false;
  v_amount_band text := 'usual';
  v_usual_multiple int;
  v_median bigint := 0;
  v_payment_count int := 0;
  v_recent_count int := 0;
  v_device_new boolean := false;
  v_device_trusted boolean;
  v_auth_changed boolean := false;
  v_hour int;
  v_to_account_number text;
begin
  if p_user_id is null then
    return jsonb_build_object(
      'score', 0, 'band', 'allow', 'signals', '[]'::jsonb,
      'new_payee', false, 'amount_band', 'unknown', 'hour_manila', null
    );
  end if;

  select account_number into v_to_account_number
  from public.accounts
  where id = p_to_account;

  if v_to_account_number is not null then
    select
      not exists (
        select 1 from public.trusted_payees tp
        where tp.user_id = p_user_id and tp.account_number = v_to_account_number
      )
      and not exists (
        select 1
        from public.transactions t
        join public.transfers tr on tr.transaction_id = t.id
        join public.accounts a on a.id = tr.to_account
        where t.initiated_by = p_user_id
          and a.account_number = v_to_account_number
          and t.status in ('pending', 'completed')
          and t.created_at <= p_now
      )
    into v_new_payee;
  end if;

  if v_new_payee then
    v_score := v_score + 30;
    v_signals := array_append(v_signals, 'new_payee');
  end if;

  select count(*)::int,
         coalesce(percentile_cont(0.5) within group (order by le.amount)::bigint, 0)
  into v_payment_count, v_median
  from public.transactions t
  join public.ledger_entries le on le.transaction_id = t.id and le.direction = 'debit'
  where t.initiated_by = p_user_id
    and t.type in ('transfer', 'bill_payment')
    and t.status in ('pending', 'completed')
    and t.created_at >= p_now - interval '90 days'
    and t.created_at <= p_now;

  if v_payment_count >= 5 and v_median > 0 then
    if p_amount is not null and p_amount > 3 * v_median then
      v_score := v_score + 30;
      v_amount_band := 'over_3x_usual';
      v_usual_multiple := round(p_amount::numeric / v_median::numeric)::int;
      v_signals := array_append(v_signals, 'high_vs_usual');
    end if;
  elsif p_amount is not null and p_amount > 1000000 then
    v_score := v_score + 30;
    v_amount_band := 'over_10000';
    v_signals := array_append(v_signals, 'high_amount');
  end if;

  select count(*)::int
  into v_recent_count
  from public.transactions t
  where t.initiated_by = p_user_id
    and t.type in ('transfer', 'bill_payment')
    and t.status in ('pending', 'completed')
    and t.created_at >= p_now - interval '10 minutes'
    and t.created_at <= p_now;

  if v_recent_count >= 3 then
    v_score := v_score + 20;
    v_signals := array_append(v_signals, 'rapid_payments');
  end if;

  select ud.trusted,
         (ud.first_seen_at > p_now - interval '24 hours')
  into v_device_trusted, v_device_new
  from public.device_sessions ds
  join public.user_devices ud on ud.id = ds.device_id
  where ds.session_id::text = nullif(auth.jwt()->>'session_id', '')
    and ud.user_id = p_user_id
  limit 1;

  if coalesce(v_device_new, false) and not coalesce(v_device_trusted, true) then
    v_score := v_score + 25;
    v_signals := array_append(v_signals, 'new_device');
  end if;

  select exists (
    select 1 from public.security_events e
    where e.user_id = p_user_id
      and e.kind in ('mfa_changed', 'password_changed')
      and e.created_at >= p_now - interval '24 hours'
      and e.created_at <= p_now
  ) into v_auth_changed;

  if v_auth_changed then
    v_score := v_score + 25;
    v_signals := array_append(v_signals, 'recent_auth_change');
  end if;

  v_hour := extract(hour from (p_now at time zone 'Asia/Manila'))::int;
  if v_hour between 0 and 5 then
    v_score := v_score + 10;
    v_signals := array_append(v_signals, 'late_night');
  end if;

  return jsonb_build_object(
    'score', least(v_score, 100),
    'band', public._bantay_band(least(v_score, 100)),
    'signals', to_jsonb(v_signals),
    'new_payee', v_new_payee,
    'amount_band', v_amount_band,
    'usual_multiple', v_usual_multiple,
    'hour_manila', v_hour,
    'rapid_payments', v_recent_count >= 3,
    'new_device', coalesce(v_device_new, false),
    'auth_changed_recently', v_auth_changed
  );
end;
$$;

revoke all on function public._compute_payment_risk(uuid, uuid, bigint, timestamptz)
  from public, anon, authenticated;

create or replace function public._record_step_up_failure()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_count int;
begin
  if v_caller_id is null then
    return;
  end if;

  insert into public.bantay_step_up_failures(user_id) values (v_caller_id);

  select count(*)::int into v_count
  from public.bantay_step_up_failures
  where user_id = v_caller_id and occurred_at >= now() - interval '10 minutes';

  if v_count >= 3 and not exists (
    select 1 from public.security_events
    where user_id = v_caller_id
      and kind = 'code_failures'
      and created_at >= now() - interval '10 minutes'
  ) then
    perform public._bantay_event(
      v_caller_id, 'code_failures', 'high', least(v_count, 100),
      jsonb_build_object('failures', v_count, 'window_minutes', 10)
    );
  end if;
end;
$$;

revoke all on function public._record_step_up_failure() from public, anon, authenticated;

-- PostgreSQL rolls back writes made before RAISE. The app calls this RPC after
-- a failed TOTP verification so the failure counter survives the error; the
-- internal call above is kept for callers that handle the error without an
-- aborted transaction. No guard or security check is bypassed by this RPC.
create or replace function public.record_step_up_failure()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;
  perform public._record_step_up_failure();
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.record_step_up_failure() from public, anon;
grant execute on function public.record_step_up_failure() to authenticated;

create or replace function public._lock_account(p_user_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    return;
  end if;

  insert into public.security_limits (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  update public.security_limits
  set locked_at = now(), unlock_after = null, updated_at = now()
  where user_id = p_user_id;

  update public.scheduled_payments
  set status = 'paused', updated_at = now()
  where owner_id = p_user_id and status = 'active';

  -- Hosted Supabase uses auth.refresh_tokens and auth.sessions. The tables are
  -- absent in the local PGlite stand-in, so use runtime guards and dynamic SQL.
  if to_regclass('auth.refresh_tokens') is not null then
    execute 'delete from auth.refresh_tokens where user_id = $1' using p_user_id;
  end if;
  if to_regclass('auth.sessions') is not null then
    execute 'delete from auth.sessions where user_id = $1' using p_user_id;
  end if;

  perform public._bantay_event(
    p_user_id, 'account_locked', 'high', null,
    jsonb_build_object('reason', coalesce(p_reason, 'customer'))
  );
  perform public.write_audit(
    'account_locked', 'security_limits', p_user_id::text,
    jsonb_build_object('reason', coalesce(p_reason, 'customer'))
  );
end;
$$;

revoke all on function public._lock_account(uuid, text) from public, anon, authenticated;

create or replace function public._bantay_pause_locked_schedules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.failure_reason = 'Account locked' then
    -- The executor may mark a one-off schedule completed after the failed run;
    -- a lock failure must still leave it paused for the customer to resume.
    update public.scheduled_payments
    set status = 'paused', updated_at = now()
    where id = new.schedule_id;
  end if;
  return new;
end;
$$;

revoke all on function public._bantay_pause_locked_schedules()
  from public, anon, authenticated;

drop trigger if exists trg_bantay_pause_locked_schedules on public.scheduled_payment_runs;
-- Deferred so the executor's own status update (completed/failed) runs first;
-- run_due_scheduled_payments stays byte-identical.
create constraint trigger trg_bantay_pause_locked_schedules
  after update on public.scheduled_payment_runs
  deferrable initially deferred
  for each row execute function public._bantay_pause_locked_schedules();

-- ------------------------------------------------------------------------------
-- 4. Guards
-- ------------------------------------------------------------------------------
create or replace function public.assert_not_locked(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_locked_at timestamptz;
begin
  if p_user_id is null then
    return;
  end if;

  select locked_at into v_locked_at
  from public.security_limits
  where user_id = p_user_id;

  if v_locked_at is not null then
    raise exception 'Account locked';
  end if;
end;
$$;

revoke all on function public.assert_not_locked(uuid) from public, anon, authenticated;

create or replace function public.assert_payment_risk(
  p_user_id uuid,
  p_to_account uuid,
  p_amount bigint,
  p_idempotency_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_risk jsonb;
  v_facts jsonb;
  v_score int;
  v_band text;
begin
  -- pg_cron calls _transfer_core with no JWT: risk is scored at schedule creation.
  if auth.uid() is null or p_user_id is null or p_amount is null or p_amount <= 0 then
    return;
  end if;

  v_risk := public._compute_payment_risk(p_user_id, p_to_account, p_amount);
  v_score := (v_risk->>'score')::int;
  v_band := v_risk->>'band';
  v_facts := v_risk || jsonb_build_object(
    'idempotency_key', p_idempotency_key,
    'to_account_id', p_to_account
  );

  if v_band = 'warning' then
    if not exists (
      select 1 from public.security_events
      where user_id = p_user_id
        and kind = 'risky_payment_warning'
        and facts->>'idempotency_key' = p_idempotency_key
    ) then
      perform public._bantay_event(
        p_user_id, 'risky_payment_warning', 'warning', v_score, v_facts
      );
    end if;
    return;
  end if;

  if v_band = 'challenge' then
    if exists (
      select 1 from public.risk_challenges
      where user_id = p_user_id
        and idempotency_key = p_idempotency_key
        and confirmed_at is not null
        and expires_at > now()
    ) then
      return;
    end if;

    if not exists (
      select 1 from public.risk_challenges where idempotency_key = p_idempotency_key
    ) then
      insert into public.risk_challenges
        (user_id, idempotency_key, score, facts, expires_at)
      values
        (p_user_id, p_idempotency_key, v_score, v_facts, now() + interval '30 minutes');

      perform public._bantay_event(
        p_user_id, 'risky_payment_challenged', 'high', v_score, v_facts
      );
    end if;

    raise exception 'Confirmation required';
  end if;
end;
$$;

revoke all on function public.assert_payment_risk(uuid, uuid, bigint, text)
  from public, anon, authenticated;

-- The challenge row must be committed before the money RPC raises. PostgreSQL
-- rolls back writes made before a RAISE in the same transaction, so clients
-- call this idempotent RPC first; the guard then raises the contract error.
create or replace function public.prepare_risk_challenge(
  p_to_account uuid,
  p_amount bigint,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_risk jsonb;
  v_facts jsonb;
  v_score int;
  v_band text;
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;
  if p_idempotency_key is null or trim(p_idempotency_key) = '' then
    raise exception 'Idempotency key is required';
  end if;

  v_risk := public._compute_payment_risk(v_caller_id, p_to_account, p_amount);
  v_score := (v_risk->>'score')::int;
  v_band := v_risk->>'band';
  v_facts := v_risk || jsonb_build_object(
    'idempotency_key', p_idempotency_key,
    'to_account_id', p_to_account
  );

  if exists (
    select 1 from public.risk_challenges
    where user_id = v_caller_id
      and idempotency_key = p_idempotency_key
      and confirmed_at is not null
      and expires_at > now()
  ) then
    return jsonb_build_object(
      'challenge_required', false, 'score', v_score, 'facts', v_facts,
      'idempotency_key', p_idempotency_key
    );
  end if;

  if v_band = 'challenge' then
    if not exists (
      select 1 from public.risk_challenges where idempotency_key = p_idempotency_key
    ) then
      insert into public.risk_challenges
        (user_id, idempotency_key, score, facts, expires_at)
      values
        (v_caller_id, p_idempotency_key, v_score, v_facts, now() + interval '30 minutes');

      perform public._bantay_event(
        v_caller_id, 'risky_payment_challenged', 'high', v_score, v_facts
      );
      perform public.write_audit(
        'risk_challenge_created', 'risk_challenges', p_idempotency_key,
        jsonb_build_object('score', v_score, 'band', v_band)
      );
    end if;

    return jsonb_build_object(
      'challenge_required', true, 'score', v_score, 'facts', v_facts,
      'idempotency_key', p_idempotency_key
    );
  end if;

  return jsonb_build_object(
    'challenge_required', false, 'score', v_score, 'facts', v_facts,
    'idempotency_key', p_idempotency_key
  );
end;
$$;

revoke all on function public.prepare_risk_challenge(uuid, bigint, text) from public, anon;
grant execute on function public.prepare_risk_challenge(uuid, bigint, text) to authenticated;

-- ------------------------------------------------------------------------------
-- 5. Customer RPCs
-- ------------------------------------------------------------------------------
create or replace function public.register_device(
  p_install_id text,
  p_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_session_id text := nullif(auth.jwt()->>'session_id', '');
  v_device_id uuid;
  v_is_new boolean := false;
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;
  if p_install_id is null or trim(p_install_id) = '' then
    raise exception 'Install id is required';
  end if;

  select id into v_device_id
  from public.user_devices
  where user_id = v_caller_id and install_id = trim(p_install_id);

  v_is_new := v_device_id is null;

  insert into public.user_devices (user_id, install_id, label, last_seen_at)
  values (v_caller_id, trim(p_install_id), nullif(trim(coalesce(p_label, '')), ''), now())
  on conflict (user_id, install_id) do update
    set last_seen_at = now(),
        label = coalesce(nullif(trim(coalesce(excluded.label, '')), ''), public.user_devices.label)
  returning id into v_device_id;

  if v_session_id is not null then
    insert into public.device_sessions (session_id, user_id, device_id)
    values (v_session_id::uuid, v_caller_id, v_device_id)
    on conflict (session_id) do update
      set device_id = excluded.device_id, user_id = excluded.user_id;
  end if;

  if v_is_new then
    perform public._bantay_event(
      v_caller_id, 'new_device', 'warning', null,
      jsonb_build_object('device_id', v_device_id)
    );
    perform public.write_audit(
      'device_registered', 'user_devices', v_device_id::text,
      jsonb_build_object('first_seen', true)
    );
  end if;

  return jsonb_build_object(
    'device_id', v_device_id, 'trusted', false, 'new_device', v_is_new
  );
end;
$$;

revoke all on function public.register_device(text, text) from public, anon;
grant execute on function public.register_device(text, text) to authenticated;

create or replace function public.get_security_timeline(p_limit int default 50)
returns table (
  id uuid,
  kind text,
  severity text,
  score int,
  facts jsonb,
  explanation text,
  explanation_source text,
  status text,
  related_transaction_id uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_cap int;
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  v_cap := least(greatest(coalesce(p_limit, 50), 1), 200);

  return query
  select e.id, e.kind, e.severity, e.score, e.facts, e.explanation,
         e.explanation_source, e.status, e.related_transaction_id, e.created_at
  from public.security_events e
  where e.user_id = v_caller_id
  order by e.created_at desc, e.id desc
  limit v_cap;
end;
$$;

revoke all on function public.get_security_timeline(int) from public, anon;
grant execute on function public.get_security_timeline(int) to authenticated;

create or replace function public.confirm_risky_payment(p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_challenge public.risk_challenges%rowtype;
begin
  perform public.assert_money_step_up();

  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_challenge
  from public.risk_challenges
  where user_id = v_caller_id and idempotency_key = p_idempotency_key;

  if not found then
    raise exception 'Challenge not found';
  end if;
  if v_challenge.confirmed_at is not null then
    raise exception 'Challenge already confirmed';
  end if;
  if v_challenge.expires_at <= now() then
    raise exception 'Challenge expired';
  end if;

  update public.risk_challenges
  set confirmed_at = now()
  where id = v_challenge.id;

  perform public._bantay_event(
    v_caller_id, 'risky_payment_confirmed', 'info', v_challenge.score,
    v_challenge.facts
  );
  perform public.write_audit(
    'risk_challenge_confirmed', 'risk_challenges', v_challenge.id::text,
    jsonb_build_object('idempotency_key', p_idempotency_key, 'score', v_challenge.score)
  );

  return jsonb_build_object('ok', true, 'idempotency_key', p_idempotency_key);
end;
$$;

revoke all on function public.confirm_risky_payment(text) from public, anon;
grant execute on function public.confirm_risky_payment(text) to authenticated;

create or replace function public.mark_event(
  p_event_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_event public.security_events%rowtype;
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;
  if p_status not in ('confirmed_me', 'reported_not_me') then
    raise exception 'Invalid event status';
  end if;

  select * into v_event
  from public.security_events
  where id = p_event_id and user_id = v_caller_id;

  if not found then
    raise exception 'Event not found';
  end if;

  update public.security_events set status = p_status where id = v_event.id;

  if p_status = 'confirmed_me' then
    if v_event.kind = 'risky_payment_challenged'
       or v_event.kind = 'risky_payment_confirmed'
       or v_event.kind = 'risky_payment_warning' then
      insert into public.trusted_payees (user_id, account_number)
      select v_caller_id, a.account_number
      from public.accounts a
      where a.id = (v_event.facts->>'to_account_id')::uuid
      on conflict (user_id, account_number) do nothing;
    elsif v_event.kind = 'new_device' then
      update public.user_devices
      set trusted = true
      where id = (v_event.facts->>'device_id')::uuid and user_id = v_caller_id;
    end if;
  else
    perform public._lock_account(v_caller_id, 'reported_not_me');

    insert into public.security_cases (user_id, opened_by, event_id, status)
    values (v_caller_id, 'customer', v_event.id, 'open');
  end if;

  perform public.write_audit(
    'security_event_marked', 'security_events', v_event.id::text,
    jsonb_build_object('status', p_status, 'kind', v_event.kind)
  );

  return jsonb_build_object('ok', true, 'status', p_status, 'event_id', v_event.id);
end;
$$;

revoke all on function public.mark_event(uuid, text) from public, anon;
grant execute on function public.mark_event(uuid, text) to authenticated;

create or replace function public.lock_my_account()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  perform public._lock_account(v_caller_id, 'customer');
  return jsonb_build_object('ok', true, 'locked', true);
end;
$$;

revoke all on function public.lock_my_account() from public, anon;
grant execute on function public.lock_my_account() to authenticated;

create or replace function public.request_unlock()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_locked_at timestamptz;
begin
  perform public.assert_money_step_up();

  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  select locked_at into v_locked_at
  from public.security_limits
  where user_id = v_caller_id;

  if v_locked_at is null then
    raise exception 'Account is not locked';
  end if;

  update public.security_limits
  set unlock_after = now() + interval '1 hour', updated_at = now()
  where user_id = v_caller_id;

  perform public.write_audit(
    'unlock_requested', 'security_limits', v_caller_id::text,
    jsonb_build_object('wait_hours', 1)
  );

  return public.get_security_settings();
end;
$$;

revoke all on function public.request_unlock() from public, anon;
grant execute on function public.request_unlock() to authenticated;

create or replace function public.complete_unlock()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_locked_at timestamptz;
  v_unlock_after timestamptz;
begin
  perform public.assert_money_step_up();

  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  select locked_at, unlock_after into v_locked_at, v_unlock_after
  from public.security_limits
  where user_id = v_caller_id;

  if v_locked_at is null then
    raise exception 'Account is not locked';
  end if;
  if v_unlock_after is null or v_unlock_after > now() then
    raise exception 'Unlock not available yet';
  end if;

  update public.security_limits
  set locked_at = null, unlock_after = null, updated_at = now()
  where user_id = v_caller_id;

  perform public._bantay_event(
    v_caller_id, 'account_unlocked', 'info', null, '{}'::jsonb
  );
  perform public.write_audit(
    'account_unlocked', 'security_limits', v_caller_id::text,
    jsonb_build_object('method', 'customer')
  );

  return public.get_security_settings();
end;
$$;

revoke all on function public.complete_unlock() from public, anon;
grant execute on function public.complete_unlock() to authenticated;

create or replace function public.register_password_change()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_event_id uuid;
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  v_event_id := public._bantay_event(
    v_caller_id, 'password_changed', 'warning', null, '{}'::jsonb
  );
  perform public.write_audit(
    'password_changed', 'security_events', v_event_id::text, '{}'::jsonb
  );

  return jsonb_build_object('ok', true, 'event_id', v_event_id);
end;
$$;

revoke all on function public.register_password_change() from public, anon;
grant execute on function public.register_password_change() to authenticated;

-- ------------------------------------------------------------------------------
-- 6. Admin RPCs
-- ------------------------------------------------------------------------------
create or replace function public.admin_list_security_cases(p_status text default null)
returns table (
  id uuid,
  user_id uuid,
  opened_by text,
  event_id uuid,
  status text,
  staff_note text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin_aal2();
  if not public.is_admin() then
    raise exception 'Admin privilege required';
  end if;
  if p_status is not null and p_status not in ('open', 'investigating', 'resolved') then
    raise exception 'Invalid case status';
  end if;

  return query
  select c.id, c.user_id, c.opened_by, c.event_id, c.status, c.staff_note,
         c.created_at, c.updated_at
  from public.security_cases c
  where p_status is null or c.status = p_status
  order by c.created_at desc;
end;
$$;

revoke all on function public.admin_list_security_cases(text) from public, anon;
grant execute on function public.admin_list_security_cases(text) to authenticated;

create or replace function public.admin_get_security_case(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_case public.security_cases%rowtype;
  v_events jsonb;
begin
  perform public.assert_admin_aal2();
  if not public.is_admin() then
    raise exception 'Admin privilege required';
  end if;

  select * into v_case from public.security_cases where id = p_id;
  if not found then
    raise exception 'Case not found';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', e.id, 'kind', e.kind, 'severity', e.severity, 'score', e.score,
      'facts', e.facts, 'status', e.status, 'created_at', e.created_at
    ) order by e.created_at
  ), '[]'::jsonb) into v_events
  from public.security_events e
  where e.user_id = v_case.user_id
    and (e.id = v_case.event_id or e.created_at >= v_case.created_at - interval '1 hour');

  return jsonb_build_object(
    'case', jsonb_build_object(
      'id', v_case.id, 'user_id', v_case.user_id, 'opened_by', v_case.opened_by,
      'event_id', v_case.event_id, 'status', v_case.status,
      'staff_note', v_case.staff_note, 'created_at', v_case.created_at,
      'updated_at', v_case.updated_at
    ),
    'events', v_events
  );
end;
$$;

revoke all on function public.admin_get_security_case(uuid) from public, anon;
grant execute on function public.admin_get_security_case(uuid) to authenticated;

create or replace function public.admin_update_security_case(
  p_id uuid,
  p_status text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.security_cases%rowtype;
begin
  perform public.assert_admin_aal2();
  if not public.is_admin() then
    raise exception 'Admin privilege required';
  end if;
  if p_status not in ('open', 'investigating', 'resolved') then
    raise exception 'Invalid case status';
  end if;

  select * into v_case from public.security_cases where id = p_id;
  if not found then
    raise exception 'Case not found';
  end if;

  update public.security_cases
  set status = p_status,
      staff_note = coalesce(nullif(trim(coalesce(p_note, '')), ''), v_case.staff_note),
      updated_at = now()
  where id = p_id;

  perform public.write_audit(
    'security_case_updated', 'security_cases', p_id::text,
    jsonb_build_object('old_status', v_case.status, 'new_status', p_status)
  );

  return jsonb_build_object('ok', true, 'id', p_id, 'status', p_status);
end;
$$;

revoke all on function public.admin_update_security_case(uuid, text, text)
  from public, anon;
grant execute on function public.admin_update_security_case(uuid, text, text)
  to authenticated;

create or replace function public.admin_unlock_user(
  p_user_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_locked_at timestamptz;
begin
  perform public.assert_admin_aal2();
  if not public.is_admin() then
    raise exception 'Admin privilege required';
  end if;

  select locked_at into v_locked_at
  from public.security_limits
  where user_id = p_user_id;

  if v_locked_at is null then
    raise exception 'Account is not locked';
  end if;

  update public.security_limits
  set locked_at = null, unlock_after = null, updated_at = now()
  where user_id = p_user_id;

  perform public._bantay_event(
    p_user_id, 'account_unlocked', 'info', null,
    jsonb_build_object('method', 'staff')
  );
  perform public.write_audit(
    'account_unlocked', 'security_limits', p_user_id::text,
    jsonb_build_object('method', 'staff', 'note', p_note)
  );

  return jsonb_build_object('ok', true, 'user_id', p_user_id);
end;
$$;

revoke all on function public.admin_unlock_user(uuid, text) from public, anon;
grant execute on function public.admin_unlock_user(uuid, text) to authenticated;

-- ------------------------------------------------------------------------------
-- 7. Auth change signals
-- ------------------------------------------------------------------------------
create or replace function public._bantay_mfa_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if tg_op = 'DELETE' then
    v_user_id := old.user_id;
  else
    v_user_id := new.user_id;
  end if;

  perform public._bantay_event(
    v_user_id, 'mfa_changed', 'warning', null,
    jsonb_build_object('source', 'auth.mfa_factors')
  );
  return null;
end;
$$;

revoke all on function public._bantay_mfa_changed() from public, anon, authenticated;

-- auth.mfa_factors is managed by Supabase Auth. If the migration role cannot
-- create this trigger, warn loudly rather than fail the whole migration.
do $$
begin
  begin
    drop trigger if exists trg_bantay_mfa_changed on auth.mfa_factors;
    create trigger trg_bantay_mfa_changed
      after insert or update or delete on auth.mfa_factors
      for each row execute function public._bantay_mfa_changed();
  exception when others then
    raise warning 'Bantay mfa_changed trigger not installed: %', sqlerrm;
  end;
end $$;

-- ------------------------------------------------------------------------------
-- 8. Delayed daily-limit raises
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
  v_locked_at timestamptz;
  v_unlock_after timestamptz;
  v_pending_limit bigint;
  v_pending_at timestamptz;
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  if exists (select 1 from public.profiles where id = v_caller_id) then
    insert into public.security_limits (user_id)
    values (v_caller_id)
    on conflict (user_id) do nothing;

    select daily_transfer_limit_centavos, locked_at, unlock_after,
           pending_limit_centavos, pending_limit_effective_at
    into v_limit, v_locked_at, v_unlock_after, v_pending_limit, v_pending_at
    from public.security_limits
    where user_id = v_caller_id;
  end if;

  v_limit := coalesce(v_limit, 5000000);
  v_spent_today := public._spent_today_centavos(v_caller_id);

  return jsonb_build_object(
    'daily_transfer_limit_centavos', v_limit,
    'spent_today_centavos', v_spent_today,
    'remaining_today_centavos', greatest(v_limit - v_spent_today, 0),
    'locked', v_locked_at is not null,
    'unlock_after', v_unlock_after,
    'pending_limit_centavos', v_pending_limit,
    'pending_limit_effective_at', v_pending_at
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
  v_is_raise boolean;
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
  v_is_raise := p_limit_centavos > v_old_limit;

  if v_is_raise then
    -- Raising waits 12 hours; the current limit stays in force until cron applies it.
    insert into public.security_limits
      (user_id, pending_limit_centavos, pending_limit_effective_at, updated_at)
    values
      (v_caller_id, p_limit_centavos, now() + interval '12 hours', now())
    on conflict (user_id) do update
      set pending_limit_centavos = excluded.pending_limit_centavos,
          pending_limit_effective_at = excluded.pending_limit_effective_at,
          updated_at = now();
  else
    -- Lowering is immediate (Stage 8A behaviour).
    insert into public.security_limits
      (user_id, daily_transfer_limit_centavos, pending_limit_centavos,
       pending_limit_effective_at, updated_at)
    values
      (v_caller_id, p_limit_centavos, null, null, now())
    on conflict (user_id) do update
      set daily_transfer_limit_centavos = excluded.daily_transfer_limit_centavos,
          pending_limit_centavos = null,
          pending_limit_effective_at = null,
          updated_at = now();
  end if;

  perform public.write_audit(
    'daily_limit_updated',
    'security_limits',
    v_caller_id::text,
    jsonb_build_object(
      'old_limit_centavos', v_old_limit,
      'new_limit_centavos', p_limit_centavos,
      'delayed_hours', case when v_is_raise then 12 else 0 end
    )
  );

  perform public._bantay_event(
    v_caller_id, 'limit_changed', 'info', null,
    jsonb_build_object(
      'old_limit_centavos', v_old_limit,
      'new_limit_centavos', p_limit_centavos,
      'effective_after_hours', case when v_is_raise then 12 else 0 end
    )
  );

  return public.get_security_settings();
end;
$$;

revoke all on function public.set_daily_limit(bigint) from public, anon;
grant execute on function public.set_daily_limit(bigint) to authenticated;


create or replace function public.apply_due_security_limits()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_applied int := 0;
begin
  for v_row in
    select user_id, pending_limit_centavos
    from public.security_limits
    where pending_limit_effective_at is not null
      and pending_limit_effective_at <= now()
    for update skip locked
  loop
    update public.security_limits
    set daily_transfer_limit_centavos = v_row.pending_limit_centavos,
        pending_limit_centavos = null,
        pending_limit_effective_at = null,
        updated_at = now()
    where user_id = v_row.user_id;

    perform public.write_audit(
      'daily_limit_applied', 'security_limits', v_row.user_id::text,
      jsonb_build_object('effective_limit_centavos', v_row.pending_limit_centavos)
    );
    perform public._bantay_event(
      v_row.user_id, 'limit_changed', 'info', null,
      jsonb_build_object(
        'new_limit_centavos', v_row.pending_limit_centavos,
        'source', 'pending_12h'
      )
    );
    v_applied := v_applied + 1;
  end loop;

  return jsonb_build_object('applied', v_applied);
end;
$$;

revoke all on function public.apply_due_security_limits()
  from public, anon, authenticated;
grant execute on function public.apply_due_security_limits()
  to service_role, postgres;

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

  -- 5. Job: davao-apply-pending-security-limits (hourly; Stage 8D)
  begin
    perform cron.unschedule('davao-apply-pending-security-limits');
  exception when others then
    null;
  end;

  perform cron.schedule(
    'davao-apply-pending-security-limits',
    '0 * * * *',
    'select public.apply_due_security_limits();'
  );
  v_results := jsonb_set(v_results, '{davao-apply-pending-security-limits}', '"registered"');

  return jsonb_build_object('success', true, 'jobs', v_results);
end;
$$;

revoke all on function public.register_cron_jobs() from public, anon, authenticated;
grant execute on function public.register_cron_jobs() to service_role, postgres;


-- ------------------------------------------------------------------------------
-- 9. Modified step-up guard: record failures for the code_failures signal.
--    The original body is byte-identical apart from the exception wrapper.
-- ------------------------------------------------------------------------------
create or replace function public.assert_money_step_up()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_enabled boolean;
  v_window int;
  v_jwt jsonb := auth.jwt();
  v_timestamp numeric;
begin

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
  exception when others then
    perform public._record_step_up_failure();
    raise;
  end;

end;
$$;

revoke all on function public.assert_money_step_up() from public, anon, authenticated;


-- ------------------------------------------------------------------------------
-- 10. Protected money functions — original bodies with only guard lines added
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

  -- 5c. Bantay lock and payment-risk guards (Phase 8 D)
  perform public.assert_not_locked(p_actor);
  perform public.assert_payment_risk(p_actor, p_to, p_amount, p_idempotency_key);

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

  -- Bantay lock guard (Phase 8 D); idempotent replay returns above.
  perform public.assert_not_locked(v_caller_id);

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
    'You cashed out ₱' || trim(to_char(p_amount / 100.0, 'FM999,999,999,990.00')) ||
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

grant execute on function public.withdraw(uuid, bigint, text, text) to authenticated;


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

  -- Bantay lock guard (Phase 8 D)
  perform public.assert_not_locked(v_caller_id);

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

  -- Bantay risk score at schedule creation (Phase 8 D)
  perform public.assert_payment_risk(
    v_caller_id,
    coalesce(p_to_account, (select account_id from public.billers where id = p_biller_id)),
    p_amount,
    public._schedule_risk_key(v_caller_id, p_kind, coalesce(p_to_account, p_biller_id), p_amount, p_start_date)
  );

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

grant execute on function public.create_scheduled_payment(uuid, text, uuid, uuid, text, bigint, text, date, date, integer, text) to authenticated;


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

  -- Bantay lock guard (Phase 8 D)
  perform public.assert_not_locked(auth.uid());
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

grant execute on function public.create_scheduled_transfer_to_number(uuid, text, bigint, text, date, date, integer, text) to authenticated;


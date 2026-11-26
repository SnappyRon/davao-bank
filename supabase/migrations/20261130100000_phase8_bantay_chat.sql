-- Phase 8 · Stage 8N — Bantay AI chat backend
-- Tables, RLS, RPCs for the Bantay AI chat feature.
-- Kill switch default OFF (fail closed); per-user 30/day, 4/min, 500 global/day.
-- Lazy prune: no new cron jobs.

-- ============================================================================
-- 1. bantay_chat_config (singleton, service role only)
-- ============================================================================
create table if not exists public.bantay_chat_config (
  id boolean primary key default true check (id = true),
  enabled boolean not null default false,
  per_user_daily_cap int not null default 30,
  per_minute_cap int not null default 4,
  daily_global_cap int not null default 500,
  context_version text not null default '1'
);
alter table public.bantay_chat_config enable row level security;
revoke all on public.bantay_chat_config from public, anon, authenticated;
grant select on public.bantay_chat_config to service_role;
grant update on public.bantay_chat_config to service_role;
grant insert on public.bantay_chat_config to service_role;

-- Seed the singleton row
insert into public.bantay_chat_config (id) values (true) on conflict do nothing;

-- ============================================================================
-- 2. bantay_chat_sessions
-- ============================================================================
create table if not exists public.bantay_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);
create index if not exists idx_bantay_chat_sessions_user
  on public.bantay_chat_sessions (user_id, last_active_at desc);
alter table public.bantay_chat_sessions enable row level security;
revoke all on public.bantay_chat_sessions from public, anon, authenticated;
-- Customers can select and delete their own sessions
grant select, delete on public.bantay_chat_sessions to authenticated;
create policy bantay_chat_sessions_own on public.bantay_chat_sessions
  for all to authenticated using (user_id = auth.uid());

-- ============================================================================
-- 3. bantay_chat_messages
-- ============================================================================
create table if not exists public.bantay_chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.bantay_chat_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 600),
  source text check (source is null or source in ('ai', 'article', 'fallback', 'refusal')),
  actions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_bantay_chat_messages_session
  on public.bantay_chat_messages (session_id, created_at);
alter table public.bantay_chat_messages enable row level security;
revoke all on public.bantay_chat_messages from public, anon, authenticated;
-- Customers can select and delete their own messages
grant select, delete on public.bantay_chat_messages to authenticated;
create policy bantay_chat_messages_own on public.bantay_chat_messages
  for all to authenticated using (user_id = auth.uid());

-- ============================================================================
-- 4. bantay_chat_requests (rolling minute window, service role only)
-- ============================================================================
create table if not exists public.bantay_chat_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists idx_bantay_chat_requests_user
  on public.bantay_chat_requests (user_id, created_at desc);
alter table public.bantay_chat_requests enable row level security;
revoke all on public.bantay_chat_requests from public, anon, authenticated;
-- No grants to authenticated; service role only via RPCs

-- ============================================================================
-- 5. bantay_chat_usage (per-user daily, service role only)
-- ============================================================================
create table if not exists public.bantay_chat_usage (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  message_count int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.bantay_chat_usage enable row level security;
revoke all on public.bantay_chat_usage from public, anon, authenticated;
-- No grants to authenticated; service role only via RPCs

-- ============================================================================
-- 6. bantay_chat_global_usage (global daily model calls, service role only)
-- ============================================================================
create table if not exists public.bantay_chat_global_usage (
  day date primary key,
  model_calls int not null default 0
);
alter table public.bantay_chat_global_usage enable row level security;
revoke all on public.bantay_chat_global_usage from public, anon, authenticated;
-- No grants to authenticated; service role only via RPCs

-- ============================================================================
-- 7. RPCs
-- ============================================================================

-- 7a. bantay_chat_check_quota
-- One transaction: config/kill switch → per-minute → per-day → response.
-- Lazy prune included. Fails closed on missing config.
create or replace function public.bantay_chat_check_quota(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enabled boolean;
  v_per_user_daily_cap int;
  v_per_minute_cap int;
  v_minute_count int;
  v_day_count int;
  v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  -- Fail closed: no config row means disabled
  select enabled, per_user_daily_cap, per_minute_cap
    into v_enabled, v_per_user_daily_cap, v_per_minute_cap
    from public.bantay_chat_config
    where id = true;

  if not found or v_enabled is not true then
    return jsonb_build_object('allowed', false, 'reason', 'chat_disabled', 'quota_remaining', 0);
  end if;

  -- Lazy prune: remove old requests (> 2 min old to keep some buffer) and old usage
  delete from public.bantay_chat_requests
    where user_id = p_user_id and created_at < now() - interval '2 minutes';

  -- Per-minute check
  select count(*)::int into v_minute_count
    from public.bantay_chat_requests
    where user_id = p_user_id and created_at > now() - interval '1 minute';

  if v_minute_count >= v_per_minute_cap then
    return jsonb_build_object('allowed', false, 'reason', 'rate_limited', 'quota_remaining', 0);
  end if;

  -- Per-day check + increment (upsert)
  insert into public.bantay_chat_usage (user_id, day, message_count, updated_at)
    values (p_user_id, v_today, 1, now())
    on conflict (user_id, day)
    do update set message_count = public.bantay_chat_usage.message_count + 1,
                 updated_at = now()
    returning message_count into v_day_count;

  if v_day_count > v_per_user_daily_cap then
    -- Roll back the increment since we're rejecting
    update public.bantay_chat_usage
      set message_count = message_count - 1, updated_at = now()
      where user_id = p_user_id and day = v_today;
    return jsonb_build_object('allowed', false, 'reason', 'daily_limit', 'quota_remaining', 0);
  end if;

  -- Insert the per-minute request row
  insert into public.bantay_chat_requests (user_id) values (p_user_id);

  return jsonb_build_object(
    'allowed', true,
    'reason', null,
    'quota_remaining', v_per_user_daily_cap - v_day_count
  );
end;
$$;
revoke all on function public.bantay_chat_check_quota(uuid) from public, anon, authenticated;
grant execute on function public.bantay_chat_check_quota(uuid) to service_role;

-- 7b. bantay_chat_reserve_model_call
-- Atomic check-and-reserve: increment global daily counter BEFORE provider fetch.
-- Returns allowed=false at/over cap or if config/row missing (fail closed).
create or replace function public.bantay_chat_reserve_model_call(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enabled boolean;
  v_daily_global_cap int;
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_model_calls int;
begin
  select enabled, daily_global_cap
    into v_enabled, v_daily_global_cap
    from public.bantay_chat_config
    where id = true;

  if not found or v_enabled is not true then
    return jsonb_build_object('allowed', false, 'model_calls', 0, 'limit_reached', true);
  end if;

  -- Atomic upsert + check
  insert into public.bantay_chat_global_usage (day, model_calls)
    values (v_today, 1)
    on conflict (day)
    do update set model_calls = public.bantay_chat_global_usage.model_calls + 1
    returning model_calls into v_model_calls;

  if v_model_calls > v_daily_global_cap then
    -- Roll back
    update public.bantay_chat_global_usage
      set model_calls = model_calls - 1
      where day = v_today;
    return jsonb_build_object('allowed', false, 'model_calls', v_model_calls - 1, 'limit_reached', true);
  end if;

  return jsonb_build_object('allowed', true, 'model_calls', v_model_calls, 'limit_reached', false);
end;
$$;
revoke all on function public.bantay_chat_reserve_model_call(uuid) from public, anon, authenticated;
grant execute on function public.bantay_chat_reserve_model_call(uuid) to service_role;

-- 7c. bantay_chat_open_session
-- Validates ownership of existing session, prunes expired, creates/returns session.
create or replace function public.bantay_chat_open_session(p_user_id uuid, p_existing uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
begin
  -- Lazy prune expired sessions and messages older than the 24 h retention window.
  delete from public.bantay_chat_sessions
    where user_id = p_user_id and expires_at < now();

  delete from public.bantay_chat_messages
    where user_id = p_user_id and created_at < now() - interval '24 hours';

  -- Try to reuse existing session if valid
  if p_existing is not null then
    select id into v_session_id
      from public.bantay_chat_sessions
      where id = p_existing
        and user_id = p_user_id
        and expires_at >= now();

    if found then
      -- Extend expiry and update activity
      update public.bantay_chat_sessions
        set last_active_at = now(),
            expires_at = now() + interval '24 hours'
        where id = v_session_id;
      return v_session_id;
    end if;
  end if;

  -- Create a new session
  insert into public.bantay_chat_sessions (user_id)
    values (p_user_id)
    returning id into v_session_id;

  return v_session_id;
end;
$$;
revoke all on function public.bantay_chat_open_session(uuid, uuid) from public, anon, authenticated;
grant execute on function public.bantay_chat_open_session(uuid, uuid) to service_role;

-- 7d. bantay_chat_load_history
-- Loads the last N messages for a session, explicitly scoped to user.
create or replace function public.bantay_chat_load_history(
  p_session_id uuid,
  p_user_id uuid,
  p_limit int default 8
)
returns table(role text, content text, actions jsonb, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Clamp limit
  if p_limit < 1 then p_limit := 1; end if;
  if p_limit > 40 then p_limit := 40; end if;

  return query
    select m.role, m.content, m.actions, m.created_at
      from public.bantay_chat_messages m
      where m.session_id = p_session_id
        and m.user_id = p_user_id
      order by m.created_at desc
      limit p_limit;
end;
$$;
revoke all on function public.bantay_chat_load_history(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.bantay_chat_load_history(uuid, uuid, int) to service_role;

-- 7e. bantay_chat_save_messages
-- Saves the user message and assistant reply, trims to 40 per session.
create or replace function public.bantay_chat_save_messages(
  p_user_id uuid,
  p_session_id uuid,
  p_user_message text,
  p_reply text,
  p_actions jsonb default '[]'::jsonb,
  p_source text default 'ai'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_msg_count int;
begin
  -- Verify session ownership
  if not exists (
    select 1 from public.bantay_chat_sessions
      where id = p_session_id and user_id = p_user_id
  ) then
    raise exception 'Session not found';
  end if;

  -- Insert user message
  insert into public.bantay_chat_messages (session_id, user_id, role, content)
    values (p_session_id, p_user_id, 'user', left(p_user_message, 500));

  -- Insert assistant reply
  insert into public.bantay_chat_messages (session_id, user_id, role, content, source, actions)
    values (p_session_id, p_user_id, 'assistant', left(p_reply, 600), p_source, coalesce(p_actions, '[]'::jsonb));

  -- Update session activity
  update public.bantay_chat_sessions
    set last_active_at = now(),
        expires_at = now() + interval '24 hours'
    where id = p_session_id;

  -- Trim to 40 messages per session (keep newest)
  select count(*)::int into v_msg_count
    from public.bantay_chat_messages
    where session_id = p_session_id;

  if v_msg_count > 40 then
    delete from public.bantay_chat_messages
      where id in (
        select id from public.bantay_chat_messages
          where session_id = p_session_id
          order by created_at asc
          limit (v_msg_count - 40)
      );
  end if;
end;
$$;
revoke all on function public.bantay_chat_save_messages(uuid, uuid, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.bantay_chat_save_messages(uuid, uuid, text, text, jsonb, text) to service_role;

-- 7f. bantay_chat_clear (granted to authenticated, scoped to auth.uid())
create or replace function public.bantay_chat_clear(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Delete messages for this session owned by the caller
  delete from public.bantay_chat_messages
    where session_id = p_session_id
      and user_id = auth.uid();

  -- Delete the session itself
  delete from public.bantay_chat_sessions
    where id = p_session_id
      and user_id = auth.uid();
end;
$$;
revoke all on function public.bantay_chat_clear(uuid) from public, anon, authenticated;
grant execute on function public.bantay_chat_clear(uuid) to authenticated;

-- 7g. bantay_chat_clear_all (granted to authenticated, scoped to auth.uid())
create or replace function public.bantay_chat_clear_all()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Delete all messages for caller
  delete from public.bantay_chat_messages
    where user_id = auth.uid();

  -- Delete all sessions for caller
  delete from public.bantay_chat_sessions
    where user_id = auth.uid();
end;
$$;
revoke all on function public.bantay_chat_clear_all() from public, anon, authenticated;
grant execute on function public.bantay_chat_clear_all() to authenticated;

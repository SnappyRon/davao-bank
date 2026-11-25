-- ==============================================================================
-- Phase 9 · Service Requests Backend
-- ==============================================================================
--
-- Table: service_requests
--   id                    uuid pk default gen_random_uuid()
--   user_id               uuid not null references profiles(id) on delete cascade
--   type                  text check (type in ('statement','certificate','card_replacement','account_update','remit_status'))
--   details               jsonb not null default '{}' validated per type
--   status                text check (status in ('submitted','in_review','completed','rejected','cancelled'))
--   staff_note            text
--   reference             text (format DB-XXXX-XXXX, generated server-side)
--   created_at            timestamptz not null default now()
--   updated_at            timestamptz not null default now()
--
-- RLS: customer selects/creates own rows only through RPCs; no direct client writes
-- RPCs: create_service_request, get_my_service_requests, cancel_service_request,
--       admin_list_service_requests, admin_update_service_request (aal2 + is_admin, audit_logs row)
-- Notifications: on status change using existing notifications pattern
-- No money movement

-- ------------------------------------------------------------------------------
-- 1. service_requests table
-- ------------------------------------------------------------------------------
create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in (
    'statement',
    'certificate',
    'card_replacement',
    'account_update',
    'remit_status'
  )),
  details jsonb not null default '{}'::jsonb,
  status text not null default 'submitted' check (status in (
    'submitted',
    'in_review',
    'completed',
    'rejected',
    'cancelled'
  )),
  staff_note text null,
  reference text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_service_requests_user_created
  on public.service_requests(user_id, created_at desc);

-- ------------------------------------------------------------------------------
-- 2. RLS: customer selects own rows; no direct client inserts/updates/deletes
-- ------------------------------------------------------------------------------
alter table public.service_requests enable row level security;

revoke all on public.service_requests from public, anon, authenticated;
grant select on public.service_requests to authenticated;
grant all on public.service_requests to service_role;

drop policy if exists "service_requests_select_own" on public.service_requests;
create policy "service_requests_select_own"
  on public.service_requests
  for select
  to authenticated
  using (user_id = auth.uid());

-- ------------------------------------------------------------------------------
-- 3. Helper: validate details per request type
-- ------------------------------------------------------------------------------
create or replace function public._validate_service_request_details(
  p_type text,
  p_details jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_keys text[];
  v_allowed_keys text[] := '{}';
begin
  -- Define allowed keys per type
  case p_type
    when 'statement' then
      v_allowed_keys := array['account_id', 'start_date', 'end_date'];
    when 'certificate' then
      v_allowed_keys := array['purpose'];
    when 'card_replacement' then
      v_allowed_keys := array['reason', 'last4'];
    when 'account_update' then
      v_allowed_keys := array['field', 'new_value'];
    when 'remit_status' then
      v_allowed_keys := array['reference'];
    else
      raise exception 'Invalid service request type: %', p_type;
  end case;

  -- Check that only allowed keys are present
  select array_agg(key) into v_keys from jsonb_object_keys(p_details) as t(key);
  if v_keys is not null then
    for i in 1..array_length(v_keys, 1) loop
      if v_keys[i] <> all(v_allowed_keys) then
        raise exception 'Invalid key "%" for request type "%"', v_keys[i], p_type;
      end if;
    end loop;
  end if;

  -- Type-specific validation
  if p_type = 'statement' then
    if not (p_details ? 'account_id') then
      raise exception 'statement request requires account_id';
    end if;
    if not (p_details ? 'start_date') or not (p_details ? 'end_date') then
      raise exception 'statement request requires start_date and end_date';
    end if;
  elsif p_type = 'certificate' then
    if not (p_details ? 'purpose') or trim(p_details->>'purpose') = '' then
      raise exception 'certificate request requires non-empty purpose';
    end if;
  elsif p_type = 'card_replacement' then
    if not (p_details ? 'reason') or trim(p_details->>'reason') = '' then
      raise exception 'card_replacement request requires non-empty reason';
    end if;
    if p_details ? 'last4' then
      if not (p_details->>'last4' ~ '^[0-9]{4}$') then
        raise exception 'last4 must be exactly 4 digits';
      end if;
    end if;
  elsif p_type = 'account_update' then
    if not (p_details ? 'field') or trim(p_details->>'field') = '' then
      raise exception 'account_update request requires non-empty field';
    end if;
    if not (p_details ? 'new_value') or trim(p_details->>'new_value') = '' then
      raise exception 'account_update request requires non-empty new_value';
    end if;
    -- Whitelist allowed fields for demo
    if (p_details->>'field') not in ('email', 'phone_number') then
      raise exception 'account_update: field must be email or phone_number';
    end if;
    -- Basic format checks (demo only; no real change is made)
    if (p_details->>'field') = 'email' and not (p_details->>'new_value' ~* '^[^@]+@[^@]+\.[^@]+$') then
      raise exception 'account_update: new_value must be a valid email format';
    end if;
    if (p_details->>'field') = 'phone_number' and not (p_details->>'new_value' ~ '^\+?[0-9\s\-]{7,20}$') then
      raise exception 'account_update: new_value must be a valid phone number format';
    end if;
  elsif p_type = 'remit_status' then
    if not (p_details ? 'reference') or trim(p_details->>'reference') = '' then
      raise exception 'remit_status request requires non-empty reference';
    end if;
    if not (p_details->>'reference' ~ '^DB-[0-9A-Z]{4}-[0-9A-Z]{4}$') then
      raise exception 'remit_status: reference must match format DB-XXXX-XXXX';
    end if;
  end if;
end;
$$;

revoke all on function public._validate_service_request_details(text, jsonb)
  from public, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 4. Helper: generate reference ID (format DB-XXXX-XXXX)
-- ------------------------------------------------------------------------------
create or replace function public._generate_service_reference()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'DB-' ||
    upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 4)) || '-' ||
    upper(substring(md5(random()::text || clock_timestamp()::text) from 5 for 4));
$$;

revoke all on function public._generate_service_reference()
  from public, anon, authenticated;

-- Unique constraint on reference to prevent duplicates
alter table public.service_requests
  add constraint service_requests_reference_key
  unique (reference);

-- ------------------------------------------------------------------------------
-- 5. Helper: send notification on status change
-- ------------------------------------------------------------------------------
create or replace function public._notify_service_request_status(
  p_user_id uuid,
  p_request_id uuid,
  p_type text,
  p_old_status text,
  p_new_status text,
  p_reference text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message text;
begin
  case p_new_status
    when 'in_review' then
      v_message := 'Your ' || p_type || ' request (' || p_reference || ') is now under review.';
    when 'completed' then
      v_message := 'Your ' || p_type || ' request (' || p_reference || ') is ready.';
    when 'rejected' then
      v_message := 'Your ' || p_type || ' request (' || p_reference || ') was declined.';
    when 'cancelled' then
      v_message := 'Your ' || p_type || ' request (' || p_reference || ') has been cancelled.';
    else
      return;
  end case;

  insert into public.notifications (user_id, type, message)
  values (p_user_id, 'service_request', v_message);
end;
$$;

revoke all on function public._notify_service_request_status(uuid, uuid, text, text, text, text)
  from public, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 6. Customer RPC: create_service_request
--    Authenticated, input validation, rate limit per user (max 10/day)
-- ------------------------------------------------------------------------------
create or replace function public.create_service_request(
  p_type text,
  p_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_profile_status text;
  v_daily_count int;
  v_reference text;
  v_request_id uuid;
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  -- Verify profile is active
  select status into v_profile_status
  from public.profiles
  where id = v_caller_id;

  if not found or v_profile_status <> 'active' then
    raise exception 'Your profile is suspended or inactive';
  end if;

  -- Validate type
  if p_type not in ('statement','certificate','card_replacement','account_update','remit_status') then
    raise exception 'Invalid request type';
  end if;

  -- Validate details per type
  perform public._validate_service_request_details(p_type, p_details);

  -- Rate limit: max 10 requests per user per day (Philippine Time)
  -- Compute day window in Asia/Manila to avoid UTC shift
  select count(*)::int into v_daily_count
  from public.service_requests
  where user_id = v_caller_id
    and created_at >= (
      (now() at time zone 'Asia/Manila')::date
      at time zone 'Asia/Manila'
    );

  if v_daily_count >= 10 then
    raise exception 'Daily service request limit reached (maximum 10 requests per day)';
  end if;

  -- Generate reference with retry on collision (unique constraint)
  for i in 1..5 loop
    v_reference := public._generate_service_reference();
    begin
      insert into public.service_requests (user_id, type, details, reference)
      values (v_caller_id, p_type, p_details, v_reference)
      returning id into v_request_id;
      exit;
    exception when unique_violation then
      -- Retry with new reference
      continue;
    end;
  end loop;

  if v_request_id is null then
    raise exception 'Failed to generate unique reference after retries';
  end if;

  -- Audit log
  perform public.write_audit(
    'service_request_created',
    'service_requests',
    v_request_id::text,
    jsonb_build_object('type', p_type, 'reference', v_reference)
  );

  -- Notification
  insert into public.notifications (user_id, type, message)
  values (
    v_caller_id,
    'service_request',
    'Your ' || p_type || ' request (' || v_reference || ') has been submitted.'
  );

  return jsonb_build_object(
    'id', v_request_id,
    'type', p_type,
    'status', 'submitted',
    'reference', v_reference,
    'created_at', now()
  );
end;
$$;

revoke all on function public.create_service_request(text, jsonb) from public, anon;
grant execute on function public.create_service_request(text, jsonb) to authenticated;

-- ------------------------------------------------------------------------------
-- 7. Customer RPC: get_my_service_requests
-- ------------------------------------------------------------------------------
create or replace function public.get_my_service_requests()
returns table (
  id uuid,
  type text,
  details jsonb,
  status text,
  staff_note text,
  reference text,
  created_at timestamptz,
  updated_at timestamptz
)
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

  return query
  select sr.id, sr.type, sr.details, sr.status, sr.staff_note, sr.reference,
         sr.created_at, sr.updated_at
  from public.service_requests sr
  where sr.user_id = v_caller_id
  order by sr.created_at desc, sr.id desc;
end;
$$;

revoke all on function public.get_my_service_requests() from public, anon;
grant execute on function public.get_my_service_requests() to authenticated;

-- ------------------------------------------------------------------------------
-- 8. Customer RPC: cancel_service_request
--    Own requests only, only while submitted
-- ------------------------------------------------------------------------------
create or replace function public.cancel_service_request(
  p_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_request public.service_requests%rowtype;
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_request
  from public.service_requests
  where id = p_id and user_id = v_caller_id;

  if not found then
    raise exception 'Service request not found';
  end if;

  if v_request.status <> 'submitted' then
    raise exception 'Only submitted requests can be cancelled';
  end if;

  update public.service_requests
  set status = 'cancelled',
      updated_at = now()
  where id = p_id;

  perform public.write_audit(
    'service_request_cancelled',
    'service_requests',
    p_id::text,
    jsonb_build_object('type', v_request.type, 'reference', v_request.reference)
  );

  perform public._notify_service_request_status(
    v_caller_id, p_id, v_request.type, 'submitted', 'cancelled', v_request.reference
  );

  return jsonb_build_object('success', true, 'id', p_id, 'status', 'cancelled');
end;
$$;

revoke all on function public.cancel_service_request(uuid) from public, anon;
grant execute on function public.cancel_service_request(uuid) to authenticated;

-- ------------------------------------------------------------------------------
-- 9. Admin RPC: admin_list_service_requests
--    aal2 + is_admin required (read-only, no audit)
-- ------------------------------------------------------------------------------
create or replace function public.admin_list_service_requests(
  p_status text default null
)
returns table (
  id uuid,
  user_id uuid,
  type text,
  details jsonb,
  status text,
  staff_note text,
  reference text,
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

  if p_status is not null and p_status not in ('submitted','in_review','completed','rejected','cancelled') then
    raise exception 'Invalid status filter';
  end if;

  return query
  select sr.id, sr.user_id, sr.type, sr.details, sr.status, sr.staff_note,
         sr.reference, sr.created_at, sr.updated_at
  from public.service_requests sr
  where p_status is null or sr.status = p_status
  order by sr.created_at desc;
end;
$$;

revoke all on function public.admin_list_service_requests(text) from public, anon;
grant execute on function public.admin_list_service_requests(text) to authenticated;

-- ------------------------------------------------------------------------------
-- 10. Admin RPC: admin_update_service_request
--     aal2 + is_admin required, audit_logs row, notification on status change
-- ------------------------------------------------------------------------------
create or replace function public.admin_update_service_request(
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
  v_request public.service_requests%rowtype;
  v_old_status text;
begin
  perform public.assert_admin_aal2();
  if not public.is_admin() then
    raise exception 'Admin privilege required';
  end if;

  if p_status not in ('in_review','completed','rejected','cancelled') then
    raise exception 'Invalid status: must be in_review, completed, rejected, or cancelled';
  end if;

  select * into v_request
  from public.service_requests
  where id = p_id;

  if not found then
    raise exception 'Service request not found';
  end if;

  v_old_status := v_request.status;

  if v_old_status = p_status then
    raise exception 'Request is already %', p_status;
  end if;

  update public.service_requests
  set status = p_status,
      staff_note = coalesce(nullif(trim(coalesce(p_note, '')), ''), v_request.staff_note),
      updated_at = now()
  where id = p_id;

  perform public.write_audit(
    'service_request_updated',
    'service_requests',
    p_id::text,
    jsonb_build_object(
      'old_status', v_old_status,
      'new_status', p_status,
      'type', v_request.type,
      'reference', v_request.reference
    )
  );

  perform public._notify_service_request_status(
    v_request.user_id, p_id, v_request.type, v_old_status, p_status, v_request.reference
  );

  return jsonb_build_object('success', true, 'id', p_id, 'status', p_status);
end;
$$;

revoke all on function public.admin_update_service_request(uuid, text, text) from public, anon;
grant execute on function public.admin_update_service_request(uuid, text, text) to authenticated;
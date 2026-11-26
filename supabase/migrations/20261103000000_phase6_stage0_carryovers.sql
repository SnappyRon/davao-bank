-- ==============================================================================
-- Davao Bank — Phase 6 Stage 0: Carry-overs, Scheduler, Self-Heal & Vault
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Fix 0.6: Explicit Caller Verification in guard_profile_self_update
-- Recreated as SECURITY INVOKER so current_user reflects the actual caller
-- ------------------------------------------------------------------------------

create or replace function public.guard_profile_self_update()
returns trigger
language plpgsql
security invoker
set search_path = public, auth
as $$
begin
  -- 1. Trusted backend caller directly in database roles or service_role JWT
  if current_user in ('service_role', 'postgres', 'supabase_admin') or
     coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' then
    return new;
  end if;

  -- 2. Otherwise require is_admin() for role or status changes
  if new.role is distinct from old.role or new.status is distinct from old.status then
    if not public.is_admin() then
      raise exception 'Only admins may change role or status';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_profile_self_update() from public, anon, authenticated;

-- Ensure trigger exists
drop trigger if exists trg_guard_profile_self_update on public.profiles;
create trigger trg_guard_profile_self_update
  before update on public.profiles
  for each row execute function public.guard_profile_self_update();

-- ------------------------------------------------------------------------------
-- 2. Fix 0.7: Idempotent Backfill for Missing Profiles
-- Provisions profile and default savings account for any existing auth.users
-- ------------------------------------------------------------------------------

do $$
declare
  r record;
  v_full_name text;
  v_phone text;
  v_account_number text;
  v_exists boolean;
begin
  for r in
    select u.id, u.email, u.raw_user_meta_data
    from auth.users u
    left join public.profiles p on p.id = u.id
    where p.id is null
  loop
    v_full_name := coalesce(
      nullif(trim(r.raw_user_meta_data->>'full_name'), ''),
      nullif(split_part(r.email, '@', 1), ''),
      'Customer'
    );
    v_phone := r.raw_user_meta_data->>'phone';

    insert into public.profiles (id, full_name, phone, role, status)
    values (r.id, v_full_name, v_phone, 'customer', 'active')
    on conflict (id) do nothing;

    if not exists (select 1 from public.accounts where user_id = r.id) then
      loop
        v_account_number := '10' || lpad(floor(random() * 100000000)::text, 8, '0');
        select exists (
          select 1 from public.accounts where account_number = v_account_number
        ) into v_exists;
        exit when not v_exists;
      end loop;

      insert into public.accounts (account_number, user_id, type, currency, status)
      values (v_account_number, r.id, 'savings', 'PHP', 'active');
    end if;
  end loop;
end;
$$;

-- ------------------------------------------------------------------------------
-- 3. Fix 0.7: Self-Healing Profile Provisioning (ensure_my_profile)
-- ------------------------------------------------------------------------------

create or replace function public.ensure_my_profile()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_caller_id uuid := auth.uid();
  v_user record;
  v_profile record;
  v_account record;
  v_full_name text;
  v_phone text;
  v_account_number text;
  v_exists boolean;
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_user from auth.users where id = v_caller_id;
  if not found then
    raise exception 'User not found';
  end if;

  select * into v_profile from public.profiles where id = v_caller_id;
  if not found then
    v_full_name := coalesce(
      nullif(trim(v_user.raw_user_meta_data->>'full_name'), ''),
      nullif(split_part(v_user.email, '@', 1), ''),
      'Customer'
    );
    v_phone := v_user.raw_user_meta_data->>'phone';

    insert into public.profiles (id, full_name, phone, role, status)
    values (v_caller_id, v_full_name, v_phone, 'customer', 'active')
    returning * into v_profile;
  end if;

  select * into v_account from public.accounts where user_id = v_caller_id order by created_at limit 1;
  if not found then
    loop
      v_account_number := '10' || lpad(floor(random() * 100000000)::text, 8, '0');
      select exists (
        select 1 from public.accounts where account_number = v_account_number
      ) into v_exists;
      exit when not v_exists;
    end loop;

    insert into public.accounts (account_number, user_id, type, currency, status)
    values (v_account_number, v_caller_id, 'savings', 'PHP', 'active')
    returning * into v_account;
  end if;

  return jsonb_build_object(
    'profile', row_to_json(v_profile),
    'account', row_to_json(v_account)
  );
end;
$$;

revoke all on function public.ensure_my_profile() from public, anon;
grant execute on function public.ensure_my_profile() to authenticated;

-- Admin query surfacing logins without a profile for "Needs Attention" filter (§0.7)
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
    u.id,
    coalesce(u.email::text, 'No Email'),
    (u.email_confirmed_at is not null) as email_confirmed,
    p.full_name,
    p.phone,
    coalesce(p.role, 'none'),
    case when p.id is null then 'needs_attention' else p.status end as status,
    coalesce(p.created_at, u.created_at) as created_at
  from auth.users u
  left join public.profiles p on p.id = u.id
  where public.is_admin()
  order by coalesce(p.created_at, u.created_at) desc;
$$;

revoke all on function public.admin_get_users() from public, anon;
grant execute on function public.admin_get_users() to authenticated;

-- ------------------------------------------------------------------------------
-- 4. Fix 0.9 Item 10: Scheduled Transfer by Account Number
-- ------------------------------------------------------------------------------

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

revoke all on function public.create_scheduled_transfer_to_number(uuid, text, bigint, text, date, date, int, text) from public, anon;
grant execute on function public.create_scheduled_transfer_to_number(uuid, text, bigint, text, date, date, int, text) to authenticated;

-- ------------------------------------------------------------------------------
-- 5. Fix 0.9 Item 10: List Scheduled Payments with Counterparty Metadata
-- ------------------------------------------------------------------------------

create or replace function public.list_my_scheduled_payments()
returns table (
  id uuid,
  owner_id uuid,
  from_account uuid,
  from_account_number text,
  kind text,
  to_account uuid,
  to_account_number text,
  to_account_last4 text,
  biller_id uuid,
  biller_name text,
  biller_reference text,
  amount bigint,
  note text,
  frequency text,
  start_date date,
  end_date date,
  max_runs int,
  runs_done int,
  next_run_date date,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public, auth, pg_temp
as $$
  select
    sp.id,
    sp.owner_id,
    sp.from_account,
    fa.account_number as from_account_number,
    sp.kind,
    sp.to_account,
    ta.account_number as to_account_number,
    right(ta.account_number, 4) as to_account_last4,
    sp.biller_id,
    b.name as biller_name,
    sp.biller_reference,
    sp.amount,
    sp.note,
    sp.frequency,
    sp.start_date,
    sp.end_date,
    sp.max_runs,
    sp.runs_done,
    sp.next_run_date,
    sp.status,
    sp.created_at,
    sp.updated_at
  from public.scheduled_payments sp
  left join public.accounts fa on fa.id = sp.from_account
  left join public.accounts ta on ta.id = sp.to_account
  left join public.billers b on b.id = sp.biller_id
  where sp.owner_id = auth.uid()
  order by sp.created_at desc;
$$;

revoke all on function public.list_my_scheduled_payments() from public, anon;
grant execute on function public.list_my_scheduled_payments() to authenticated;

-- ------------------------------------------------------------------------------
-- 6. Fix 0.4 & 0.5: Register Cron Jobs (5-minute schedule & Vault FX sync)
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
  -- Secure Vault lookup: does NOT write any secrets into cron.job.command
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
          body := '{"backfill": false}'::jsonb
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

-- ------------------------------------------------------------------------------
-- 7. Execute Job Registration if cron is active
-- ------------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform public.register_cron_jobs();
  else
    raise warning 'pg_cron extension not active; skipping immediate cron job registration.';
  end if;
exception when others then
  raise warning 'Notice on cron registration: %', sqlerrm;
end;
$$;


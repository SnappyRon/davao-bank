-- ==============================================================================
-- Phase 9 · Stage 9E: Savings Goals & Time Deposit Planner Backend (§4.7–§4.8)
-- ==============================================================================
-- Projection and planning only: NO fund lock, NO money movement, NO ledger writes.
-- Every function uses security definer + set search_path = '' and is revoked
-- from public and anon.

-- ------------------------------------------------------------------------------
-- 1. Table: public.savings_goals (§4.7)
-- ------------------------------------------------------------------------------
create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null check (
    char_length(name) between 1 and 60
    and char_length(btrim(name)) between 1 and 60
  ),
  target_amount_cents bigint not null check (
    target_amount_cents > 0
    and target_amount_cents <= 100000000000
  ),
  target_date date not null,
  monthly_deposit_cents bigint not null default 0 check (
    monthly_deposit_cents >= 0
    and monthly_deposit_cents <= 100000000000
  ),
  annual_rate_bps integer not null default 250 check (
    annual_rate_bps between 0 and 2000
  ),
  linked_account_id uuid null references public.accounts(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create index if not exists idx_savings_goals_user_status
  on public.savings_goals(user_id, status);

-- ------------------------------------------------------------------------------
-- 2. Row-Level Security & Privileges (own rows only; linked account must be own)
-- ------------------------------------------------------------------------------
alter table public.savings_goals enable row level security;

revoke all on public.savings_goals from public, anon;
grant select, insert, update, delete on public.savings_goals to authenticated;
grant all on public.savings_goals to service_role;

drop policy if exists "savings_goals_select_own" on public.savings_goals;
create policy "savings_goals_select_own"
  on public.savings_goals
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "savings_goals_insert_own" on public.savings_goals;
create policy "savings_goals_insert_own"
  on public.savings_goals
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and (
      linked_account_id is null
      or exists (
        select 1
        from public.accounts a
        where a.id = linked_account_id
          and a.user_id = auth.uid()
          and a.status = 'active'
      )
    )
  );

drop policy if exists "savings_goals_update_own" on public.savings_goals;
create policy "savings_goals_update_own"
  on public.savings_goals
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (
      linked_account_id is null
      or exists (
        select 1
        from public.accounts a
        where a.id = linked_account_id
          and a.user_id = auth.uid()
          and a.status = 'active'
      )
    )
  );

drop policy if exists "savings_goals_delete_own" on public.savings_goals;
create policy "savings_goals_delete_own"
  on public.savings_goals
  for delete
  to authenticated
  using (user_id = auth.uid());

-- ------------------------------------------------------------------------------
-- 3. Internal Helper: Simple-Interest Projection Engine (server-side, pure)
-- ------------------------------------------------------------------------------
-- Simple interest (no compounding of interest onto principal):
--   In month m (1..n), principal in account during the month is P0 + (m - 1) * M,
--   earning (P0 + (m - 1) * M) * (annual_rate_bps / 10000 / 12), and deposit M
--   is added at month end.
--   Closed form after n months:
--     total_deposits_cents     = n * M
--     projected_interest_cents = round(((n * P0 + (n * (n - 1) / 2.0) * M) * annual_rate_bps) / 120000.0)
--     projected_amount_cents   = P0 + total_deposits_cents + projected_interest_cents
create or replace function public._compute_savings_projection(
  p_current_cents bigint,
  p_target_amount_cents bigint,
  p_target_date date,
  p_monthly_deposit_cents bigint,
  p_annual_rate_bps integer,
  p_as_of_date date
)
returns jsonb
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_current bigint := greatest(coalesce(p_current_cents, 0), 0);
  v_monthly bigint := greatest(coalesce(p_monthly_deposit_cents, 0), 0);
  v_rate_bps integer := coalesce(p_annual_rate_bps, 250);
  v_age interval;
  v_months_to_target integer := 0;
  v_total_deposits_cents bigint := 0;
  v_projected_interest_cents bigint := 0;
  v_projected_amount_cents bigint := 0;
  v_shortfall_cents bigint := 0;
  v_progress_bps integer := 0;
  v_on_track boolean := false;
  v_estimated_months integer := null;
  v_projected_completion_date date := null;
  v_schedule jsonb := '[]'::jsonb;
  v_schedule_cap integer := 0;
  v_m integer;
  v_m_deposits bigint;
  v_m_interest bigint;
  v_m_balance bigint;
begin
  if p_target_date > p_as_of_date then
    v_age := pg_catalog.age(p_target_date, p_as_of_date);
    v_months_to_target :=
      (extract(year from v_age)::int * 12)
      + extract(month from v_age)::int
      + case when extract(day from v_age)::int > 0 then 1 else 0 end;
  else
    v_months_to_target := 0;
  end if;

  v_total_deposits_cents := v_months_to_target::bigint * v_monthly;
  v_projected_interest_cents := pg_catalog.round(
    (
      (
        (v_months_to_target::numeric * v_current::numeric)
        + (((v_months_to_target::numeric * (v_months_to_target - 1)::numeric) / 2.0) * v_monthly::numeric)
      )
      * v_rate_bps::numeric
    ) / 120000.0
  )::bigint;
  v_projected_amount_cents := v_current + v_total_deposits_cents + v_projected_interest_cents;
  v_shortfall_cents := greatest(p_target_amount_cents - v_projected_amount_cents, 0);

  if p_target_amount_cents > 0 then
    v_progress_bps := least(
      10000,
      pg_catalog.floor((v_current::numeric * 10000.0) / p_target_amount_cents::numeric)::int
    );
  end if;

  v_on_track := (v_projected_amount_cents >= p_target_amount_cents);

  -- Compute estimated months to reach target (capped at 600 months = 50 years)
  if v_current >= p_target_amount_cents then
    v_estimated_months := 0;
    v_projected_completion_date := p_as_of_date;
  elsif v_monthly > 0 or (v_current > 0 and v_rate_bps > 0) then
    for v_m in 1..600 loop
      v_m_deposits := v_m::bigint * v_monthly;
      v_m_interest := pg_catalog.round(
        (
          (
            (v_m::numeric * v_current::numeric)
            + (((v_m::numeric * (v_m - 1)::numeric) / 2.0) * v_monthly::numeric)
          )
          * v_rate_bps::numeric
        ) / 120000.0
      )::bigint;
      v_m_balance := v_current + v_m_deposits + v_m_interest;
      if v_m_balance >= p_target_amount_cents then
        v_estimated_months := v_m;
        v_projected_completion_date := (p_as_of_date + pg_catalog.make_interval(months => v_m))::date;
        exit;
      end if;
    end loop;
  end if;

  -- Build month-by-month projection schedule up to target_date (capped at 120 rows)
  v_schedule_cap := least(v_months_to_target, 120);
  if v_schedule_cap > 0 then
    select coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'month_index', gs.m,
          'date', (p_as_of_date + pg_catalog.make_interval(months => gs.m))::date,
          'principal_cents', v_current + (gs.m::bigint * v_monthly),
          'cumulative_deposits_cents', gs.m::bigint * v_monthly,
          'cumulative_interest_cents', pg_catalog.round(
            (
              (
                (gs.m::numeric * v_current::numeric)
                + (((gs.m::numeric * (gs.m - 1)::numeric) / 2.0) * v_monthly::numeric)
              )
              * v_rate_bps::numeric
            ) / 120000.0
          )::bigint,
          'projected_balance_cents',
            v_current
            + (gs.m::bigint * v_monthly)
            + pg_catalog.round(
              (
                (
                  (gs.m::numeric * v_current::numeric)
                  + (((gs.m::numeric * (gs.m - 1)::numeric) / 2.0) * v_monthly::numeric)
                )
                * v_rate_bps::numeric
              ) / 120000.0
            )::bigint
        )
        order by gs.m
      ),
      '[]'::jsonb
    )
    into v_schedule
    from pg_catalog.generate_series(1, v_schedule_cap) as gs(m);
  end if;

  return pg_catalog.jsonb_build_object(
    'as_of_date', p_as_of_date,
    'interest_model', 'simple',
    'annual_rate_bps', v_rate_bps,
    'annual_rate_percent', pg_catalog.round((v_rate_bps::numeric / 100.0), 2),
    'current_amount_cents', v_current,
    'target_amount_cents', p_target_amount_cents,
    'monthly_deposit_cents', v_monthly,
    'months_to_target', v_months_to_target,
    'total_deposits_cents', v_total_deposits_cents,
    'projected_interest_cents', v_projected_interest_cents,
    'projected_amount_cents', v_projected_amount_cents,
    'shortfall_cents', v_shortfall_cents,
    'progress_bps', v_progress_bps,
    'progress_percent', pg_catalog.round((v_progress_bps::numeric / 100.0), 2),
    'on_track', v_on_track,
    'estimated_months_to_goal', v_estimated_months,
    'projected_completion_date', v_projected_completion_date,
    'schedule', v_schedule,
    'simulation_only', true,
    'simulation_notice', 'Simulation — goals are projections only. No funds are reserved or moved.'
  );
end;
$$;

revoke all on function public._compute_savings_projection(bigint, bigint, date, bigint, integer, date)
  from public, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 4. Internal Helper: Build Goal JSON Response with Linked Balance & Projection
-- ------------------------------------------------------------------------------
create or replace function public._build_savings_goal_response(
  p_goal public.savings_goals
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (pg_catalog.now() at time zone 'Asia/Manila')::date;
  v_acc_last4 text := null;
  v_acc_type text := null;
  v_current_cents bigint := 0;
  v_proj jsonb;
begin
  if p_goal.linked_account_id is not null then
    select
      pg_catalog.right(a.account_number, 4),
      a.type,
      greatest(
        coalesce(
          (
            select sum(case when le.direction = 'credit' then le.amount else -le.amount end)
            from public.ledger_entries le
            where le.account_id = a.id
          ),
          0
        ),
        0
      )::bigint
    into v_acc_last4, v_acc_type, v_current_cents
    from public.accounts a
    where a.id = p_goal.linked_account_id
      and a.user_id = p_goal.user_id;

    if not found then
      v_current_cents := 0;
    end if;
  end if;

  v_proj := public._compute_savings_projection(
    v_current_cents,
    p_goal.target_amount_cents,
    p_goal.target_date,
    p_goal.monthly_deposit_cents,
    p_goal.annual_rate_bps,
    v_today
  );

  return pg_catalog.jsonb_build_object(
    'id', p_goal.id,
    'user_id', p_goal.user_id,
    'name', p_goal.name,
    'target_amount_cents', p_goal.target_amount_cents,
    'target_date', p_goal.target_date,
    'monthly_deposit_cents', p_goal.monthly_deposit_cents,
    'annual_rate_bps', p_goal.annual_rate_bps,
    'annual_rate_percent', pg_catalog.round((p_goal.annual_rate_bps::numeric / 100.0), 2),
    'linked_account_id', p_goal.linked_account_id,
    'linked_account_last4', v_acc_last4,
    'linked_account_type', v_acc_type,
    'current_amount_cents', v_current_cents,
    'months_to_target', (v_proj->>'months_to_target')::int,
    'projected_interest_cents', (v_proj->>'projected_interest_cents')::bigint,
    'projected_amount_cents', (v_proj->>'projected_amount_cents')::bigint,
    'shortfall_cents', (v_proj->>'shortfall_cents')::bigint,
    'progress_bps', (v_proj->>'progress_bps')::int,
    'progress_percent', (v_proj->>'progress_percent')::numeric(5,2),
    'on_track', (v_proj->>'on_track')::boolean,
    'estimated_months_to_goal', (v_proj->>'estimated_months_to_goal')::int,
    'projected_completion_date', (v_proj->>'projected_completion_date')::date,
    'projection', v_proj,
    'status', p_goal.status,
    'simulation_notice', 'Simulation — goals are projections only. No funds are reserved or moved.',
    'created_at', p_goal.created_at,
    'updated_at', p_goal.updated_at
  );
end;
$$;

revoke all on function public._build_savings_goal_response(public.savings_goals)
  from public, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 5. Pure Savings Projection RPC: public.project_savings_goal
-- ------------------------------------------------------------------------------
create or replace function public.project_savings_goal(
  p_current_cents bigint,
  p_target_amount_cents bigint,
  p_target_date date,
  p_monthly_deposit_cents bigint default 0,
  p_annual_rate_bps integer default 250
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_profile_status text;
  v_today date := (pg_catalog.now() at time zone 'Asia/Manila')::date;
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  select status into v_profile_status
  from public.profiles
  where id = v_caller_id;

  if not found or v_profile_status <> 'active' then
    raise exception 'Your profile is suspended';
  end if;

  if p_current_cents is null or p_current_cents < 0 or p_current_cents > 100000000000 then
    raise exception 'Current balance must be zero or greater';
  end if;

  if p_target_amount_cents is null or p_target_amount_cents <= 0 or p_target_amount_cents > 100000000000 then
    raise exception 'Target amount must be greater than zero';
  end if;

  if p_target_date is null or p_target_date > (v_today + interval '30 years')::date then
    raise exception 'Target date must be within 30 years';
  end if;

  if p_monthly_deposit_cents is null or p_monthly_deposit_cents < 0 or p_monthly_deposit_cents > 100000000000 then
    raise exception 'Monthly deposit cannot be negative';
  end if;

  if coalesce(p_annual_rate_bps, 250) < 0 or coalesce(p_annual_rate_bps, 250) > 2000 then
    raise exception 'Annual rate must be between 0 and 2000 basis points';
  end if;

  return public._compute_savings_projection(
    p_current_cents,
    p_target_amount_cents,
    p_target_date,
    p_monthly_deposit_cents,
    coalesce(p_annual_rate_bps, 250),
    v_today
  );
end;
$$;

revoke all on function public.project_savings_goal(bigint, bigint, date, bigint, integer)
  from public, anon, authenticated;
grant execute on function public.project_savings_goal(bigint, bigint, date, bigint, integer)
  to authenticated;

-- ------------------------------------------------------------------------------
-- 6. Customer RPC: public.create_savings_goal (§4.7)
-- ------------------------------------------------------------------------------
create or replace function public.create_savings_goal(
  p_name text,
  p_target_amount_cents bigint,
  p_target_date date,
  p_monthly_deposit_cents bigint default 0,
  p_linked_account_id uuid default null,
  p_annual_rate_bps integer default 250
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_profile_status text;
  v_today date := (pg_catalog.now() at time zone 'Asia/Manila')::date;
  v_clean_name text := pg_catalog.btrim(coalesce(p_name, ''));
  v_monthly bigint := coalesce(p_monthly_deposit_cents, 0);
  v_rate_bps integer := coalesce(p_annual_rate_bps, 250);
  v_acc_status text;
  v_active_count integer;
  v_goal public.savings_goals%rowtype;
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  select status into v_profile_status
  from public.profiles
  where id = v_caller_id;

  if not found or v_profile_status <> 'active' then
    raise exception 'Your profile is suspended';
  end if;

  if pg_catalog.char_length(v_clean_name) < 1 or pg_catalog.char_length(v_clean_name) > 60 then
    raise exception 'Goal name must be between 1 and 60 characters';
  end if;

  if p_target_amount_cents is null or p_target_amount_cents <= 0 or p_target_amount_cents > 100000000000 then
    raise exception 'Target amount must be greater than zero';
  end if;

  if p_target_date is null or p_target_date < v_today then
    raise exception 'Target date must be today or in the future';
  end if;

  if p_target_date > (v_today + interval '30 years')::date then
    raise exception 'Target date cannot be more than 30 years ahead';
  end if;

  if v_monthly < 0 or v_monthly > 100000000000 then
    raise exception 'Monthly deposit cannot be negative';
  end if;

  if v_rate_bps < 0 or v_rate_bps > 2000 then
    raise exception 'Annual rate must be between 0 and 2000 basis points';
  end if;

  select count(*)::int into v_active_count
  from public.savings_goals
  where user_id = v_caller_id
    and status = 'active';

  if v_active_count >= 50 then
    raise exception 'Maximum of 50 active savings goals reached';
  end if;

  if p_linked_account_id is not null then
    select status into v_acc_status
    from public.accounts
    where id = p_linked_account_id
      and user_id = v_caller_id;

    if not found then
      raise exception 'Unauthorized: linked account does not belong to caller';
    end if;

    if v_acc_status <> 'active' then
      raise exception 'Linked account is not active';
    end if;
  end if;

  insert into public.savings_goals (
    user_id,
    name,
    target_amount_cents,
    target_date,
    monthly_deposit_cents,
    annual_rate_bps,
    linked_account_id,
    status
  )
  values (
    v_caller_id,
    v_clean_name,
    p_target_amount_cents,
    p_target_date,
    v_monthly,
    v_rate_bps,
    p_linked_account_id,
    'active'
  )
  returning * into v_goal;

  perform public.write_audit(
    'savings_goal_created',
    'savings_goals',
    v_goal.id::text,
    pg_catalog.jsonb_build_object(
      'target_amount_cents', v_goal.target_amount_cents,
      'target_date', v_goal.target_date,
      'monthly_deposit_cents', v_goal.monthly_deposit_cents,
      'annual_rate_bps', v_goal.annual_rate_bps,
      'linked_account_id', v_goal.linked_account_id
    )
  );

  return public._build_savings_goal_response(v_goal);
end;
$$;

revoke all on function public.create_savings_goal(text, bigint, date, bigint, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.create_savings_goal(text, bigint, date, bigint, uuid, integer)
  to authenticated;

-- ------------------------------------------------------------------------------
-- 7. Customer RPC: public.list_my_savings_goals (§4.7)
-- ------------------------------------------------------------------------------
create or replace function public.list_my_savings_goals(
  p_status text default null
)
returns table (
  id uuid,
  user_id uuid,
  name text,
  target_amount_cents bigint,
  target_date date,
  monthly_deposit_cents bigint,
  annual_rate_bps integer,
  annual_rate_percent numeric(5,2),
  linked_account_id uuid,
  linked_account_last4 text,
  linked_account_type text,
  current_amount_cents bigint,
  months_to_target integer,
  projected_interest_cents bigint,
  projected_amount_cents bigint,
  shortfall_cents bigint,
  progress_bps integer,
  progress_percent numeric(5,2),
  on_track boolean,
  estimated_months_to_goal integer,
  projected_completion_date date,
  projection jsonb,
  status text,
  simulation_notice text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_today date := (pg_catalog.now() at time zone 'Asia/Manila')::date;
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  if p_status is not null and p_status not in ('active', 'archived') then
    raise exception 'Invalid goal status filter';
  end if;

  return query
  with goal_balances as (
    select
      sg.*,
      pg_catalog.right(a.account_number, 4) as acc_last4,
      a.type as acc_type,
      case
        when a.id is not null then
          greatest(
            coalesce(
              (
                select sum(case when le.direction = 'credit' then le.amount else -le.amount end)
                from public.ledger_entries le
                where le.account_id = a.id
              ),
              0
            ),
            0
          )::bigint
        else 0::bigint
      end as cur_cents
    from public.savings_goals sg
    left join public.accounts a
      on a.id = sg.linked_account_id
      and a.user_id = v_caller_id
    where sg.user_id = v_caller_id
      and (p_status is null or sg.status = p_status)
  ),
  computed as (
    select
      gb.*,
      public._compute_savings_projection(
        gb.cur_cents,
        gb.target_amount_cents,
        gb.target_date,
        gb.monthly_deposit_cents,
        gb.annual_rate_bps,
        v_today
      ) as proj
    from goal_balances gb
  )
  select
    c.id,
    c.user_id,
    c.name,
    c.target_amount_cents,
    c.target_date,
    c.monthly_deposit_cents,
    c.annual_rate_bps,
    pg_catalog.round((c.annual_rate_bps::numeric / 100.0), 2)::numeric(5,2),
    c.linked_account_id,
    c.acc_last4,
    c.acc_type,
    c.cur_cents,
    (c.proj->>'months_to_target')::int,
    (c.proj->>'projected_interest_cents')::bigint,
    (c.proj->>'projected_amount_cents')::bigint,
    (c.proj->>'shortfall_cents')::bigint,
    (c.proj->>'progress_bps')::int,
    (c.proj->>'progress_percent')::numeric(5,2),
    (c.proj->>'on_track')::boolean,
    (c.proj->>'estimated_months_to_goal')::int,
    (c.proj->>'projected_completion_date')::date,
    c.proj,
    c.status,
    'Simulation — goals are projections only. No funds are reserved or moved.'::text,
    c.created_at,
    c.updated_at
  from computed c
  order by
    case when c.status = 'active' then 0 else 1 end,
    c.target_date asc,
    c.created_at desc;
end;
$$;

revoke all on function public.list_my_savings_goals(text)
  from public, anon, authenticated;
grant execute on function public.list_my_savings_goals(text)
  to authenticated;

-- ------------------------------------------------------------------------------
-- 8. Customer RPC: public.update_savings_goal (§4.7)
-- ------------------------------------------------------------------------------
create or replace function public.update_savings_goal(
  p_id uuid,
  p_name text default null,
  p_target_amount_cents bigint default null,
  p_target_date date default null,
  p_monthly_deposit_cents bigint default null,
  p_linked_account_id uuid default null,
  p_clear_linked_account boolean default false,
  p_annual_rate_bps integer default null,
  p_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_profile_status text;
  v_today date := (pg_catalog.now() at time zone 'Asia/Manila')::date;
  v_goal public.savings_goals%rowtype;
  v_new_name text;
  v_new_target_cents bigint;
  v_new_target_date date;
  v_new_monthly_cents bigint;
  v_new_linked_id uuid;
  v_new_rate_bps integer;
  v_new_status text;
  v_acc_status text;
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  select status into v_profile_status
  from public.profiles
  where id = v_caller_id;

  if not found or v_profile_status <> 'active' then
    raise exception 'Your profile is suspended';
  end if;

  select * into v_goal
  from public.savings_goals
  where id = p_id
    and user_id = v_caller_id
  for update;

  if not found then
    raise exception 'Savings goal not found';
  end if;

  v_new_name := case
    when p_name is null then v_goal.name
    else pg_catalog.btrim(p_name)
  end;

  if pg_catalog.char_length(v_new_name) < 1 or pg_catalog.char_length(v_new_name) > 60 then
    raise exception 'Goal name must be between 1 and 60 characters';
  end if;

  v_new_target_cents := coalesce(p_target_amount_cents, v_goal.target_amount_cents);
  if v_new_target_cents <= 0 or v_new_target_cents > 100000000000 then
    raise exception 'Target amount must be greater than zero';
  end if;

  v_new_target_date := coalesce(p_target_date, v_goal.target_date);
  if p_target_date is not null and p_target_date is distinct from v_goal.target_date then
    if p_target_date < v_today then
      raise exception 'Target date must be today or in the future';
    end if;
    if p_target_date > (v_today + interval '30 years')::date then
      raise exception 'Target date cannot be more than 30 years ahead';
    end if;
  end if;

  v_new_monthly_cents := coalesce(p_monthly_deposit_cents, v_goal.monthly_deposit_cents);
  if v_new_monthly_cents < 0 or v_new_monthly_cents > 100000000000 then
    raise exception 'Monthly deposit cannot be negative';
  end if;

  v_new_rate_bps := coalesce(p_annual_rate_bps, v_goal.annual_rate_bps);
  if v_new_rate_bps < 0 or v_new_rate_bps > 2000 then
    raise exception 'Annual rate must be between 0 and 2000 basis points';
  end if;

  v_new_status := coalesce(p_status, v_goal.status);
  if v_new_status not in ('active', 'archived') then
    raise exception 'Invalid goal status';
  end if;

  if coalesce(p_clear_linked_account, false) then
    v_new_linked_id := null;
  elsif p_linked_account_id is not null then
    v_new_linked_id := p_linked_account_id;
  else
    v_new_linked_id := v_goal.linked_account_id;
  end if;

  if v_new_linked_id is not null and v_new_linked_id is distinct from v_goal.linked_account_id then
    select status into v_acc_status
    from public.accounts
    where id = v_new_linked_id
      and user_id = v_caller_id;

    if not found then
      raise exception 'Unauthorized: linked account does not belong to caller';
    end if;

    if v_acc_status <> 'active' then
      raise exception 'Linked account is not active';
    end if;
  end if;

  update public.savings_goals
  set name = v_new_name,
      target_amount_cents = v_new_target_cents,
      target_date = v_new_target_date,
      monthly_deposit_cents = v_new_monthly_cents,
      linked_account_id = v_new_linked_id,
      annual_rate_bps = v_new_rate_bps,
      status = v_new_status,
      updated_at = pg_catalog.now()
  where id = p_id
    and user_id = v_caller_id
  returning * into v_goal;

  perform public.write_audit(
    'savings_goal_updated',
    'savings_goals',
    p_id::text,
    pg_catalog.jsonb_build_object(
      'target_amount_cents', v_goal.target_amount_cents,
      'target_date', v_goal.target_date,
      'monthly_deposit_cents', v_goal.monthly_deposit_cents,
      'annual_rate_bps', v_goal.annual_rate_bps,
      'linked_account_id', v_goal.linked_account_id,
      'status', v_goal.status
    )
  );

  return public._build_savings_goal_response(v_goal);
end;
$$;

revoke all on function public.update_savings_goal(uuid, text, bigint, date, bigint, uuid, boolean, integer, text)
  from public, anon, authenticated;
grant execute on function public.update_savings_goal(uuid, text, bigint, date, bigint, uuid, boolean, integer, text)
  to authenticated;

-- ------------------------------------------------------------------------------
-- 9. Customer RPC: public.archive_savings_goal (§4.7)
-- ------------------------------------------------------------------------------
create or replace function public.archive_savings_goal(
  p_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_profile_status text;
  v_goal public.savings_goals%rowtype;
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  select status into v_profile_status
  from public.profiles
  where id = v_caller_id;

  if not found or v_profile_status <> 'active' then
    raise exception 'Your profile is suspended';
  end if;

  update public.savings_goals
  set status = 'archived',
      updated_at = pg_catalog.now()
  where id = p_id
    and user_id = v_caller_id
  returning * into v_goal;

  if not found then
    raise exception 'Savings goal not found';
  end if;

  perform public.write_audit(
    'savings_goal_archived',
    'savings_goals',
    p_id::text,
    pg_catalog.jsonb_build_object('status', 'archived')
  );

  return pg_catalog.jsonb_build_object(
    'success', true,
    'id', v_goal.id,
    'status', v_goal.status
  );
end;
$$;

revoke all on function public.archive_savings_goal(uuid)
  from public, anon, authenticated;
grant execute on function public.archive_savings_goal(uuid)
  to authenticated;

-- ------------------------------------------------------------------------------
-- 10. Customer RPC: public.delete_savings_goal (Stage 9E brief)
-- ------------------------------------------------------------------------------
create or replace function public.delete_savings_goal(
  p_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_profile_status text;
  v_deleted_id uuid;
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  select status into v_profile_status
  from public.profiles
  where id = v_caller_id;

  if not found or v_profile_status <> 'active' then
    raise exception 'Your profile is suspended';
  end if;

  delete from public.savings_goals
  where id = p_id
    and user_id = v_caller_id
  returning id into v_deleted_id;

  if not found then
    raise exception 'Savings goal not found';
  end if;

  perform public.write_audit(
    'savings_goal_deleted',
    'savings_goals',
    p_id::text,
    pg_catalog.jsonb_build_object('deleted', true)
  );

  return pg_catalog.jsonb_build_object(
    'success', true,
    'id', v_deleted_id,
    'deleted', true
  );
end;
$$;

revoke all on function public.delete_savings_goal(uuid)
  from public, anon, authenticated;
grant execute on function public.delete_savings_goal(uuid)
  to authenticated;

-- ------------------------------------------------------------------------------
-- 11. Pure Time-Deposit Quote Function: public.quote_time_deposit (§4.8)
--     Pure calculation — NO storage, NO account opened, NO money movement.
--     Supports quoting a single term (30/60/90/180/360 days) or comparing all
--     five demo terms when p_term_days is null.
-- ------------------------------------------------------------------------------
create or replace function public.quote_time_deposit(
  p_principal_cents bigint,
  p_term_days integer default null
)
returns table (
  principal_cents bigint,
  term_days integer,
  annual_rate_bps integer,
  annual_rate_percent numeric(5,2),
  projected_interest_cents bigint,
  maturity_amount_cents bigint,
  as_of_date date,
  maturity_date date,
  day_count_basis integer,
  simulation_only boolean,
  simulation_notice text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_profile_status text;
  v_today date := (pg_catalog.now() at time zone 'Asia/Manila')::date;
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  select status into v_profile_status
  from public.profiles
  where id = v_caller_id;

  if not found or v_profile_status <> 'active' then
    raise exception 'Your profile is suspended';
  end if;

  if p_principal_cents is null or p_principal_cents < 100000 or p_principal_cents > 10000000000 then
    raise exception 'Principal must be between ₱1,000.00 and ₱100,000,000.00';
  end if;

  if p_term_days is not null and p_term_days not in (30, 60, 90, 180, 360) then
    raise exception 'Invalid term: choose 30, 60, 90, 180, or 360 days';
  end if;

  return query
  with demo_rates(term, rate_bps) as (
    values
      (30, 325),
      (60, 350),
      (90, 375),
      (180, 400),
      (360, 450)
  ),
  filtered as (
    select
      dr.term,
      dr.rate_bps,
      pg_catalog.round(
        (p_principal_cents::numeric * dr.rate_bps::numeric * dr.term::numeric) / 3600000.0
      )::bigint as interest_cents
    from demo_rates dr
    where p_term_days is null or dr.term = p_term_days
  )
  select
    p_principal_cents,
    f.term,
    f.rate_bps,
    pg_catalog.round((f.rate_bps::numeric / 100.0), 2)::numeric(5,2),
    f.interest_cents,
    (p_principal_cents + f.interest_cents)::bigint,
    v_today,
    (v_today + f.term)::date,
    360::int,
    true,
    'Simulation — sample rates only. No time deposit is opened and no funds move.'::text
  from filtered f
  order by f.term asc;
end;
$$;

revoke all on function public.quote_time_deposit(bigint, integer)
  from public, anon, authenticated;
grant execute on function public.quote_time_deposit(bigint, integer)
  to authenticated;

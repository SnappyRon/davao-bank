-- ==============================================================================
-- Davao Bank — Phase 8 Stage B: Saved Billers, Bill Reminders, Monthly Summary & Push Tokens
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Saved Billers Table & RLS
-- ------------------------------------------------------------------------------
create table if not exists public.saved_billers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  biller_id uuid not null references public.billers(id),
  reference text not null check (char_length(trim(reference)) > 0),
  nickname text not null check (
    char_length(nickname) between 1 and 40
    and char_length(trim(nickname)) > 0
  ),
  due_day smallint null check (due_day is null or due_day between 1 and 28),
  remind boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_saved_billers_user_id
  on public.saved_billers(user_id);

alter table public.saved_billers enable row level security;

drop policy if exists "saved_billers_select_own" on public.saved_billers;
create policy "saved_billers_select_own"
  on public.saved_billers
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "saved_billers_insert_own" on public.saved_billers;
create policy "saved_billers_insert_own"
  on public.saved_billers
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "saved_billers_update_own" on public.saved_billers;
create policy "saved_billers_update_own"
  on public.saved_billers
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "saved_billers_delete_own" on public.saved_billers;
create policy "saved_billers_delete_own"
  on public.saved_billers
  for delete
  to authenticated
  using (user_id = auth.uid());

revoke all on public.saved_billers from public, anon;
grant select, insert, update, delete on public.saved_billers to authenticated;
grant all on public.saved_billers to service_role;

-- ------------------------------------------------------------------------------
-- 2. Bill Reminders RPC: get_bill_reminders()
-- Returns saved billers whose due_day falls within the next 7 days (Asia/Manila).
-- ------------------------------------------------------------------------------
create or replace function public._get_bill_reminders_for_date(
  p_user_id uuid,
  p_today date
)
returns table (
  id uuid,
  user_id uuid,
  biller_id uuid,
  biller_name text,
  reference text,
  nickname text,
  due_day smallint,
  remind boolean,
  days_until_due int,
  created_at timestamptz
)
language sql
security definer
set search_path = public, auth, pg_temp
stable
as $$
  with candidates as (
    select
      sb.id,
      sb.user_id,
      sb.biller_id,
      b.name as biller_name,
      sb.reference,
      sb.nickname,
      sb.due_day,
      sb.remind,
      (
        case
          when sb.due_day >= extract(day from p_today)::int
            then (date_trunc('month', p_today)::date + (sb.due_day - 1))
          else
            ((date_trunc('month', p_today)::date + interval '1 month')::date + (sb.due_day - 1))
        end - p_today
      )::int as days_until_due,
      sb.created_at
    from public.saved_billers sb
    join public.billers b on b.id = sb.biller_id
    where sb.user_id = p_user_id
      and sb.remind = true
      and sb.due_day is not null
      and b.is_active = true
  )
  select
    c.id,
    c.user_id,
    c.biller_id,
    c.biller_name,
    c.reference,
    c.nickname,
    c.due_day,
    c.remind,
    c.days_until_due,
    c.created_at
  from candidates c
  where c.days_until_due between 0 and 7
  order by c.days_until_due asc, c.created_at asc;
$$;

revoke all on function public._get_bill_reminders_for_date(uuid, date) from public, anon, authenticated;

create or replace function public.get_bill_reminders()
returns table (
  id uuid,
  user_id uuid,
  biller_id uuid,
  biller_name text,
  reference text,
  nickname text,
  due_day smallint,
  remind boolean,
  days_until_due int,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
stable
as $$
declare
  v_caller_id uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  return query
  select *
  from public._get_bill_reminders_for_date(v_caller_id, v_today);
end;
$$;

revoke all on function public.get_bill_reminders() from public, anon;
grant execute on function public.get_bill_reminders() to authenticated;

-- ------------------------------------------------------------------------------
-- 3. Monthly Summary RPC: get_monthly_summary(p_month date)
-- Returns category totals and counts for the caller's accounts in that month.
-- ------------------------------------------------------------------------------
create or replace function public.get_monthly_summary(
  p_month date default null
)
returns table (
  category text,
  total_centavos bigint,
  count int
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
stable
as $$
declare
  v_caller_id uuid := auth.uid();
  v_month_start date;
  v_from_ts timestamptz;
  v_to_ts timestamptz;
begin
  if v_caller_id is null then
    raise exception 'Authentication required';
  end if;

  v_month_start := date_trunc(
    'month',
    coalesce(p_month, (now() at time zone 'Asia/Manila')::date)
  )::date;

  -- Asia/Manila (+08:00) bounds
  v_from_ts := (v_month_start::text || ' 00:00:00+08')::timestamptz;
  v_to_ts := (((v_month_start + interval '1 month')::date)::text || ' 00:00:00+08')::timestamptz;

  return query
  with categories(category, sort_order) as (
    values
      ('money_in'::text, 1),
      ('transfers_out'::text, 2),
      ('bills'::text, 3),
      ('cash_out'::text, 4),
      ('adjustments'::text, 5)
  ),
  entries as (
    select
      case
        when t.type in ('deposit', 'transfer') and le.direction = 'credit' then 'money_in'
        when t.type = 'transfer' and le.direction = 'debit' then 'transfers_out'
        when t.type = 'bill_payment' and le.direction = 'debit' then 'bills'
        when t.type = 'withdrawal' and le.direction = 'debit' then 'cash_out'
        else 'adjustments'
      end as category,
      case
        when t.type in ('deposit', 'transfer') and le.direction = 'credit' then le.amount
        when t.type = 'transfer' and le.direction = 'debit' then le.amount
        when t.type = 'bill_payment' and le.direction = 'debit' then le.amount
        when t.type = 'withdrawal' and le.direction = 'debit' then le.amount
        else case when le.direction = 'credit' then le.amount else -le.amount end
      end as effective_amount
    from public.ledger_entries le
    join public.transactions t on t.id = le.transaction_id
    join public.accounts a on a.id = le.account_id
    where a.user_id = v_caller_id
      and t.status in ('completed', 'reversed')
      and t.created_at >= v_from_ts
      and t.created_at < v_to_ts
  )
  select
    c.category,
    coalesce(sum(e.effective_amount), 0)::bigint as total_centavos,
    count(e.category)::int as count
  from categories c
  left join entries e on e.category = c.category
  group by c.category, c.sort_order
  order by c.sort_order asc;
end;
$$;

revoke all on function public.get_monthly_summary(date) from public, anon;
grant execute on function public.get_monthly_summary(date) to authenticated;

-- ------------------------------------------------------------------------------
-- 4. Push Tokens Table & RLS
-- ------------------------------------------------------------------------------
create table if not exists public.push_tokens (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  token text not null check (char_length(trim(token)) > 0),
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  primary key (user_id, token)
);

alter table public.push_tokens enable row level security;

drop policy if exists "push_tokens_select_own" on public.push_tokens;
create policy "push_tokens_select_own"
  on public.push_tokens
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "push_tokens_insert_own" on public.push_tokens;
create policy "push_tokens_insert_own"
  on public.push_tokens
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "push_tokens_update_own" on public.push_tokens;
create policy "push_tokens_update_own"
  on public.push_tokens
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "push_tokens_delete_own" on public.push_tokens;
create policy "push_tokens_delete_own"
  on public.push_tokens
  for delete
  to authenticated
  using (user_id = auth.uid());

revoke all on public.push_tokens from public, anon;
grant select, insert, update, delete on public.push_tokens to authenticated;
grant all on public.push_tokens to service_role;

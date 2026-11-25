-- ==============================================================================
-- Davao Bank — Phase 8.5A: Operations dashboard backend
-- Staff-only aggregate RPCs + a sanitized, append-only Realtime event table.
-- No money-engine changes: _transfer_core, idempotency keys, ledger rows,
-- balances and run_due_scheduled_payments are untouched. The triggers below
-- only append a small row to a side table.
-- Applied by the owner after review, as with every migration.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Read indexes (idempotent; no ledger DDL)
-- ------------------------------------------------------------------------------
create index if not exists idx_transactions_created_at
  on public.transactions (created_at desc);
create index if not exists idx_accounts_created_at
  on public.accounts (created_at desc);
create index if not exists idx_profiles_created_at
  on public.profiles (created_at desc) where role = 'customer';
create index if not exists idx_scheduled_payment_runs_status_created
  on public.scheduled_payment_runs (status, created_at desc);
create index if not exists idx_audit_logs_created_at
  on public.audit_logs (created_at desc);
create index if not exists idx_security_events_created_at
  on public.security_events (created_at desc);
create index if not exists idx_security_limits_locked_at
  on public.security_limits (locked_at) where locked_at is not null;

-- ------------------------------------------------------------------------------
-- 2. Staff-only analytics functions
--    Every function re-checks auth + is_admin() inside the security definer so a
--    direct RPC cannot bypass it. No PII columns are ever selected.
-- ------------------------------------------------------------------------------
create or replace function public.admin_ops_timeseries(
  p_from timestamptz,
  p_to timestamptz,
  p_bucket text default 'day'
)
returns table (
  bucket timestamptz,
  category text,
  incoming_centavos bigint,
  outgoing_centavos bigint,
  transaction_count bigint,
  status_mix jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.is_admin() then raise exception 'Admin privilege required'; end if;
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'Invalid date range';
  end if;
  if p_bucket is null or p_bucket not in ('day', 'week', 'month') then
    raise exception 'Invalid bucket';
  end if;

  return query
  with categories(category) as (
    values ('transfer'), ('bill'), ('deposit'), ('withdrawal'), ('adjustment'), ('reversal')
  ),
  buckets as (
    select generate_series(
      date_trunc(p_bucket, p_from at time zone 'Asia/Manila') at time zone 'Asia/Manila',
      p_to,
      case p_bucket
        when 'day' then interval '1 day'
        when 'week' then interval '1 week'
        else interval '1 month'
      end
    ) as bucket
  ),
  per_tx as (
    select
      t.id,
      date_trunc(p_bucket, t.created_at at time zone 'Asia/Manila') at time zone 'Asia/Manila' as b,
      case when t.type = 'bill_payment' then 'bill' else t.type end as category,
      t.status,
      coalesce(sum(
        case when le.direction = 'credit' and pr.role = 'customer' then le.amount else 0 end
      ), 0)::bigint as incoming,
      coalesce(sum(
        case when le.direction = 'debit' and pr.role = 'customer' then le.amount else 0 end
      ), 0)::bigint as outgoing
    from public.transactions t
    left join public.ledger_entries le on le.transaction_id = t.id
    left join public.accounts a on a.id = le.account_id
    left join public.profiles pr on pr.id = a.user_id
    where t.created_at >= p_from and t.created_at < p_to
    group by t.id, b,
      (case when t.type = 'bill_payment' then 'bill' else t.type end), t.status
  ),
  agg as (
    select
      ptx.b,
      ptx.category,
      sum(ptx.incoming)::bigint as incoming,
      sum(ptx.outgoing)::bigint as outgoing,
      count(*)::bigint as tx_count,
      jsonb_build_object(
        'completed', count(*) filter (where ptx.status = 'completed'),
        'pending', count(*) filter (where ptx.status = 'pending'),
        'failed', count(*) filter (where ptx.status = 'failed'),
        'reversed', count(*) filter (where ptx.status = 'reversed')
      ) as status_mix
    from per_tx ptx
    group by ptx.b, ptx.category
  )
  select
    bk.bucket,
    c.category,
    coalesce(a.incoming, 0) as incoming_centavos,
    coalesce(a.outgoing, 0) as outgoing_centavos,
    coalesce(a.tx_count, 0) as transaction_count,
    coalesce(a.status_mix, '{"completed":0,"pending":0,"failed":0,"reversed":0}'::jsonb)
  from buckets bk
  cross join categories c
  left join agg a on a.b = bk.bucket and a.category = c.category
  order by bk.bucket, c.category;
end;
$$;

revoke all on function public.admin_ops_timeseries(timestamptz, timestamptz, text)
  from public, anon;
grant execute on function public.admin_ops_timeseries(timestamptz, timestamptz, text)
  to authenticated;

create or replace function public.admin_ops_balance_distribution()
returns table (band text, account_count bigint, total_balance_centavos bigint)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.is_admin() then raise exception 'Admin privilege required'; end if;

  return query
  select
    case
      when v.balance < 100000 then 'under_1000'
      when v.balance < 1000000 then '1000_to_9999'
      when v.balance < 10000000 then '10000_to_99999'
      else '100000_plus'
    end as band,
    count(*)::bigint,
    coalesce(sum(v.balance), 0)::bigint
  from public.account_balances v
  join public.accounts a on a.id = v.account_id
  join public.profiles p on p.id = a.user_id
  where p.role = 'customer' and a.status <> 'closed'
  group by 1
  order by 1;
end;
$$;

revoke all on function public.admin_ops_balance_distribution() from public, anon;
grant execute on function public.admin_ops_balance_distribution() to authenticated;

create or replace function public.admin_ops_summary(
  p_from timestamptz,
  p_to timestamptz,
  p_bucket text default 'day'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.is_admin() then raise exception 'Admin privilege required'; end if;
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'Invalid date range';
  end if;
  if p_bucket is null or p_bucket not in ('day', 'week', 'month') then
    raise exception 'Invalid bucket';
  end if;

  with buckets as (
    select generate_series(
      date_trunc(p_bucket, p_from at time zone 'Asia/Manila') at time zone 'Asia/Manila',
      p_to,
      case p_bucket
        when 'day' then interval '1 day'
        when 'week' then interval '1 week'
        else interval '1 month'
      end
    ) as bucket
  ),
  growth as (
    select
      b.bucket,
      (select count(*) from public.profiles p
        where p.role = 'customer'
          and p.created_at >= b.bucket
          and p.created_at < b.bucket + case p_bucket
            when 'day' then interval '1 day'
            when 'week' then interval '1 week'
            else interval '1 month' end) as new_customers,
      (select count(*) from public.accounts a
        join public.profiles p on p.id = a.user_id
        where p.role = 'customer'
          and a.created_at >= b.bucket
          and a.created_at < b.bucket + case p_bucket
            when 'day' then interval '1 day'
            when 'week' then interval '1 week'
            else interval '1 month' end) as new_accounts
    from buckets b
  ),
  schedules as (
    select
      count(*) filter (where r.status = 'failed') as failed_runs,
      count(*) filter (where r.status = 'completed') as succeeded_runs,
      jsonb_build_object(
        'Account locked', count(*) filter (where r.status = 'failed' and r.failure_reason = 'Account locked'),
        'Insufficient funds', count(*) filter (where r.status = 'failed' and r.failure_reason = 'Insufficient funds'),
        'other', count(*) filter (where r.status = 'failed'
          and coalesce(r.failure_reason, '') not in ('Account locked', 'Insufficient funds'))
      ) as failure_codes
    from public.scheduled_payment_runs r
    where r.created_at >= p_from and r.created_at < p_to
  ),
  security as (
    select
      (select count(*) from public.security_cases where status in ('open', 'investigating')) as open_cases,
      (select count(*) from public.security_limits where locked_at is not null) as locked_accounts,
      (select count(*) from public.accounts where status = 'frozen') as frozen_accounts,
      (select count(*) from public.security_events
        where kind = 'new_device' and created_at >= p_from and created_at < p_to) as new_devices
  )
  select jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to, 'bucket', p_bucket),
    'growth', coalesce((select jsonb_agg(to_jsonb(g) order by g.bucket) from growth g), '[]'::jsonb),
    'schedules', (select to_jsonb(s) from schedules s),
    'security', (select to_jsonb(s) || jsonb_build_object(
      'signin_failures', null,
      'signin_failures_note', 'no reliable source'
    ) from security s)
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_ops_summary(timestamptz, timestamptz, text)
  from public, anon;
grant execute on function public.admin_ops_summary(timestamptz, timestamptz, text)
  to authenticated;

create or replace function public.admin_ops_live_feed(
  p_after_id bigint default 0,
  p_limit int default 100
)
returns table (
  id bigint,
  kind text,
  occurred_at timestamptz,
  label text,
  amount_centavos bigint,
  payload jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.is_admin() then raise exception 'Admin privilege required'; end if;
  if p_after_id is null then p_after_id := 0; end if;
  if p_limit is null then p_limit := 100; end if;

  return query
  select e.id, e.kind, e.occurred_at, e.label, e.amount_centavos, e.payload
  from public.staff_activity_events e
  where e.id > p_after_id
  order by e.id
  limit least(greatest(p_limit, 1), 200);
end;
$$;

revoke all on function public.admin_ops_live_feed(bigint, int) from public, anon;
grant execute on function public.admin_ops_live_feed(bigint, int) to authenticated;

-- ------------------------------------------------------------------------------
-- 3. Sanitized live feed (A3 amendment): publish ONLY this table, never raw
--    transactions / security_events / audit_logs (their payloads contain
--    reference, facts, metadata, idempotency_key and account numbers).
-- ------------------------------------------------------------------------------
create table if not exists public.staff_activity_events (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('transaction', 'security_event', 'audit_action', 'schedule_failure')),
  occurred_at timestamptz not null default now(),
  label text not null,
  amount_centavos bigint null,
  payload jsonb not null default '{}'::jsonb
);

alter table public.staff_activity_events enable row level security;
revoke all on public.staff_activity_events from public, anon, authenticated;
grant select on public.staff_activity_events to authenticated;

drop policy if exists "staff_activity_events_select_staff" on public.staff_activity_events;
create policy "staff_activity_events_select_staff"
  on public.staff_activity_events
  for select to authenticated
  using (public.is_admin());

create or replace function public._emit_staff_activity_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_label text;
  v_amount bigint;
  v_payload jsonb := '{}'::jsonb;
begin
  if tg_op = 'UPDATE' then
    if old.status is not distinct from new.status then
      return null;
    end if;
  end if;

  if tg_table_name = 'transactions' then
    v_kind := 'transaction';
    v_label := case when new.type = 'bill_payment' then 'bill' else new.type end;
    v_payload := jsonb_build_object('status', new.status, 'category', v_label);
    select coalesce(sum(le.amount) filter (
      where le.direction = 'debit' and pr.role = 'customer'
    ), 0)::bigint into v_amount
    from public.ledger_entries le
    join public.accounts a on a.id = le.account_id
    join public.profiles pr on pr.id = a.user_id
    where le.transaction_id = new.id;

  elsif tg_table_name = 'security_events' then
    v_kind := 'security_event';
    v_label := new.kind;
    v_payload := jsonb_build_object(
      'severity', new.severity,
      'band', new.facts->>'band',
      'status', new.status
    );

  elsif tg_table_name = 'audit_logs' then
    if new.action not in (
      'funds_transferred', 'bill_payment_completed', 'deposit_completed',
      'withdrawal_completed', 'account_locked', 'account_unlocked',
      'risk_challenge_created', 'risk_challenge_confirmed', 'device_registered'
    ) then
      return null;
    end if;
    v_kind := 'audit_action';
    v_label := new.action;

  elsif tg_table_name = 'scheduled_payment_runs' then
    if new.status <> 'failed' then return null; end if;
    v_kind := 'schedule_failure';
    v_label := 'scheduled_payment_failed';
    v_payload := jsonb_build_object(
      'reason_code', case
        when new.failure_reason in ('Account locked', 'Insufficient funds')
          then new.failure_reason
        else 'other'
      end
    );
  else
    return null;
  end if;

  insert into public.staff_activity_events (kind, occurred_at, label, amount_centavos, payload)
  values (v_kind, coalesce(new.created_at, now()), v_label, v_amount, v_payload);
  return null;
end;
$$;

revoke all on function public._emit_staff_activity_event() from public, anon, authenticated;

drop trigger if exists trg_ops_transactions on public.transactions;
create trigger trg_ops_transactions
  after insert or update of status on public.transactions
  for each row execute function public._emit_staff_activity_event();

drop trigger if exists trg_ops_security_events on public.security_events;
create trigger trg_ops_security_events
  after insert on public.security_events
  for each row execute function public._emit_staff_activity_event();

drop trigger if exists trg_ops_audit_logs on public.audit_logs;
create trigger trg_ops_audit_logs
  after insert on public.audit_logs
  for each row execute function public._emit_staff_activity_event();

drop trigger if exists trg_ops_schedule_runs on public.scheduled_payment_runs;
create trigger trg_ops_schedule_runs
  after insert or update of status on public.scheduled_payment_runs
  for each row execute function public._emit_staff_activity_event();

-- Only the sanitized table joins the publication. INSERT-only events need no
-- REPLICA IDENTITY FULL. Dynamic SQL keeps this idempotent across environments.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime'
  ) then
    execute 'create publication supabase_realtime';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'staff_activity_events'
  ) then
    execute 'alter publication supabase_realtime add table public.staff_activity_events';
  end if;
end $$;

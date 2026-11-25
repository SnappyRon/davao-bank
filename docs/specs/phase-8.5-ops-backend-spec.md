# Phase 8.5 — Operations dashboard backend spec (SPEC ONLY)

Status: **specification only**. No migration, no app code, no hosted access, no changes to `_transfer_core`, the ledger, or any applied migration. Written against the schema at `182505a` (Phase 8D).

Sources read: `docs/agents/ROADMAP.md` §9 (track 8.5, decision A3) and `docs/agents/roles/security-reviewer.md`, plus the applied migrations for `profiles`, `accounts`, `transactions`, `ledger_entries`, `transfers`, `bill_payments`, `billers`, `audit_logs`, `scheduled_payments`, `scheduled_payment_runs` and the new 8D tables (`security_events`, `security_cases`, `user_devices`, `security_limits`).

## 0. Real schema facts this design depends on

| Table / object                              | Columns used here (verified)                                                                                                                                                                                     | Consequence for the spec                                                                                                           |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `public.profiles`                           | `id`, `role` (`customer`/`admin`/`system`), `status`, `created_at`, `full_name`, `phone`                                                                                                                         | "Customer" means `role = 'customer'`. Never select `full_name`, `phone` or `id` into a dashboard payload.                          |
| `public.accounts`                           | `id`, `account_number`, `user_id`, `type`, `currency`, `status` (`active`/`frozen`/`closed`), `created_at`                                                                                                       | Frozen accounts come from this table; never return `account_number`.                                                               |
| `public.transactions`                       | `id`, `type` (`transfer`, `deposit`, `withdrawal`, `adjustment`, `reversal`, `bill_payment`), `status` (`pending`/`completed`/`failed`/`reversed`), `initiated_by`, `idempotency_key`, `reference`, `created_at` | `bill_payment` is a real `type` since `20261023220000`. `reference` may contain bill references/notes → not published raw.         |
| `public.ledger_entries`                     | `id`, `account_id`, `transaction_id`, `direction` (`debit`/`credit`), `amount` (centavos), `created_at`                                                                                                          | Transfers/bills have two legs (customer ↔ biller settlement account); deposits/withdrawals have one leg.                           |
| `public.transfers` / `public.bill_payments` | `transaction_id`, from/to account or `biller_id`/`payer_account`                                                                                                                                                 | Category can be derived from `transactions.type` alone; no join needed.                                                            |
| `public.audit_logs`                         | `id`, `actor_id`, `actor_role`, `action`, `entity`, `entity_id`, `metadata jsonb`, `created_at`; RLS: admins only                                                                                                | `metadata` already contains raw `account_number` for some actions → do **not** publish this table to Realtime.                     |
| `public.scheduled_payment_runs`             | `id`, `schedule_id`, `run_date`, `status` (`completed`/`failed`), `transaction_id`, `failure_reason`, `created_at`                                                                                               | Failed schedules have a reliable local source. `failure_reason` is free text → whitelist to reason codes.                          |
| `public.account_balances`                   | View (`security_invoker = true`) exposing `account_id`, `user_id`, `account_number`, `type`, `currency`, `status`, `balance`, …                                                                                  | Use it only inside a staff `security definer` aggregate and select `balance` alone.                                                |
| `public.security_events`                    | `id`, `user_id`, `kind` (includes `signin_failures`, `code_failures`, `new_device`, `account_locked`, …), `severity`, `score`, `facts jsonb`, `status`, `created_at`; RLS: own or admin                          | 8D permits the `signin_failures` kind but **nothing writes it** (see decision D-A3.1). `facts` can contain account ids → sanitize. |
| `public.security_cases`                     | `id`, `user_id`, `opened_by`, `event_id`, `status` (`open`/`investigating`/`resolved`), `staff_note`, `created_at`, `updated_at`; RLS: own or admin                                                              | Open-case count has a reliable local source.                                                                                       |
| `public.user_devices`                       | `id`, `user_id`, `install_id`, `label`, `first_seen_at`, `last_seen_at`, `trusted`; RLS: own only                                                                                                                | Only new-device counts are safe; do not expose `install_id`/`label` to a general staff feed.                                       |
| `public.security_limits`                    | 8D adds `locked_at`, `unlock_after`, `pending_limit_centavos`, `pending_limit_effective_at`                                                                                                                      | Locked accounts = `locked_at is not null`; frozen accounts = `accounts.status = 'frozen'`.                                         |
| `public.is_admin()`                         | Existing `security definer`, `stable`, `set search_path = public, auth`; checks active `role = 'admin'`                                                                                                          | Reuse this for every analytics function and for the live-feed RLS policy.                                                          |
| `public.assert_admin_aal2()`                | 6.5 step-up helper used by 8D admin case RPCs                                                                                                                                                                    | **Not** used for read-only charts (see decision D-A3.2).                                                                           |

Amounts are integer centavos everywhere. Buckets are calculated in `Asia/Manila`, matching the rest of the app.

## 1. Analytics functions

All functions below follow one security pattern (shown once; repeat verbatim in each):

```sql
create or replace function public.<name>(...)
returns <type>
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.is_admin() then raise exception 'Admin privilege required'; end if;
  -- plus range/bucket validation where applicable
  ...
end;
$$;

revoke all on function public.<name>(...) from public, anon;
grant execute on function public.<name>(...) to authenticated;
```

Notes: `set search_path = ''` forces schema-qualified names; `is_admin()` is checked **inside** the definer function, so a client cannot bypass it by calling the RPC directly. No function returns `profiles.id`, `full_name`, `phone`, `account_number`, `idempotency_key`, `reference` or `entity_id`. Raw database errors are mapped by the existing `packages/shared/src/utils/errors.ts` in the client.

### 1.1 `public.admin_ops_timeseries(p_from timestamptz, p_to timestamptz, p_bucket text default 'day')`

Returns `table (bucket timestamptz, category text, incoming_centavos bigint, outgoing_centavos bigint, transaction_count bigint, status_mix jsonb)`. `p_bucket` is validated to `day`/`week`/`month`; `p_to > p_from` is required. Categories are exactly `transfer`, `bill`, `deposit`, `withdrawal`, `adjustment`, `reversal` (bill is mapped from `transactions.type = 'bill_payment'`). Incoming/outgoing are summed **only from ledger legs belonging to customer-owned accounts**, so biller settlement accounts and internal accounts cannot inflate the chart.

```sql
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
  if p_bucket not in ('day', 'week', 'month') then
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
    group by t.id, b, category, t.status
  ),
  agg as (
    select
      b,
      category,
      sum(incoming)::bigint as incoming,
      sum(outgoing)::bigint as outgoing,
      count(*)::bigint as tx_count,
      jsonb_build_object(
        'completed', count(*) filter (where status = 'completed'),
        'pending', count(*) filter (where status = 'pending'),
        'failed', count(*) filter (where status = 'failed'),
        'reversed', count(*) filter (where status = 'reversed')
      ) as status_mix
    from per_tx
    group by b, category
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

revoke all on function public.admin_ops_timeseries(timestamptz, timestamptz, text) from public, anon;
grant execute on function public.admin_ops_timeseries(timestamptz, timestamptz, text) to authenticated;
```

`status_mix` is also available as a compact matrix for a stacked chart; it is derived from the same `per_tx` CTE, so a transfer with two ledger legs is counted once.

### 1.2 `public.admin_ops_balance_distribution()`

Returns `table (band text, account_count bigint, total_balance_centavos bigint)`. Bands are centavo ranges: `under_1000`, `1000_to_9999`, `10000_to_99999`, `100000_plus` (₱1,000 / ₱10,000 / ₱100,000 boundaries). Only active/frozen customer accounts are counted; closed accounts and biller settlement accounts are excluded. The view's `account_number` column is never selected.

```sql
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
```

### 1.3 `public.admin_ops_summary(p_from timestamptz, p_to timestamptz, p_bucket text default 'day')`

Returns `jsonb` with one call for the remaining dashboard cards. Shape (all keys always present so the UI never guesses):

```json
{
  "period": { "from": "…", "to": "…", "bucket": "day" },
  "growth": [{ "bucket": "…", "new_customers": 0, "new_accounts": 0 }],
  "schedules": {
    "failed_runs": 0,
    "succeeded_runs": 0,
    "failure_codes": { "Account locked": 0, "Insufficient funds": 0, "other": 0 }
  },
  "security": {
    "open_cases": 0,
    "locked_accounts": 0,
    "frozen_accounts": 0,
    "new_devices": 0,
    "signin_failures": null,
    "signin_failures_note": "no reliable source"
  }
}
```

`signin_failures` is deliberately `null` (see §5). SQL sketch (guards identical to §1.1):

```sql
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
  -- guards: auth.uid(), public.is_admin(), date range, bucket (as in §1.1)

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

revoke all on function public.admin_ops_summary(timestamptz, timestamptz, text) from public, anon;
grant execute on function public.admin_ops_summary(timestamptz, timestamptz, text) to authenticated;
```

### 1.4 `public.admin_ops_live_feed(p_after_id bigint default 0, p_limit int default 100)`

Returns `table (id bigint, kind text, occurred_at timestamptz, label text, amount_centavos bigint, payload jsonb)`. Used for the initial snapshot and for reconnection/missed-event refresh (§2). Reads only the sanitized `staff_activity_events` table; `p_limit` is clamped to `1..200`.

```sql
return query
select e.id, e.kind, e.occurred_at, e.label, e.amount_centavos, e.payload
from public.staff_activity_events e
where e.id > p_after_id
order by e.id
limit least(greatest(p_limit, 1), 200);
```

### 1.5 Indexes needed and cost at prototype scale

New indexes (all `if not exists`; none alter money-engine code or ledger rows):

```sql
create index if not exists idx_transactions_created_at on public.transactions (created_at desc);
create index if not exists idx_accounts_created_at on public.accounts (created_at desc);
create index if not exists idx_profiles_created_at on public.profiles (created_at desc) where role = 'customer';
create index if not exists idx_scheduled_payment_runs_status_created
  on public.scheduled_payment_runs (status, created_at desc);
create index if not exists idx_audit_logs_created_at on public.audit_logs (created_at desc);
create index if not exists idx_security_events_created_at on public.security_events (created_at desc);
create index if not exists idx_security_limits_locked_at
  on public.security_limits (locked_at) where locked_at is not null;
-- Optional, only if EXPLAIN shows a sequential scan on the ledger at larger scale:
-- create index if not exists idx_ledger_entries_created_at on public.ledger_entries (created_at desc);
```

Already present: `ledger_entries(account_id)`, `ledger_entries(transaction_id)`, `security_cases(status, created_at desc)`, `security_events(user_id, created_at desc)`. The optional ledger index is the only DDL that names the ledger table; it adds no rows, trigger or function change. If the captain wants zero ledger DDL, omit it.

Cost: the seed creates tens of accounts and at most a few thousand transactions/ledger rows, so each RPC aggregates a small filtered range in single-digit milliseconds; zero-filled buckets are bounded by the selected range (e.g. 31 day rows × 6 categories). Realtime emits one small row per real mutation, not per chart refresh. Index writes add negligible overhead to existing inserts. This design is adequate for the capstone prototype; it is not intended for production-scale telemetry.

## 2. Live updates

### 2.1 Why raw table publication is not recommended

A3 as written suggests publishing `transactions`, `security_events` and `audit_logs`. That would stream raw rows to every subscribed client: `transactions.reference` (bill references/free text), `audit_logs.metadata` (already contains raw account numbers), `security_events.facts` (account ids) and `idempotency_key`. Client-side channel filters are **not** access control; RLS on the base tables permits admins, but the payload itself is sensitive even in an admin browser, and adding those tables to the publication affects all clients. `REPLICA IDENTITY FULL` would also be needed for UPDATE/DELETE. This spec therefore recommends the safer alternative explicitly allowed in A3: a staff-only sanitized event table.

### 2.2 `public.staff_activity_events` (new, append-only)

```sql
create table public.staff_activity_events (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('transaction', 'security_event', 'audit_action', 'schedule_failure')),
  occurred_at timestamptz not null default now(),
  label text not null,                 -- category / event kind / whitelisted action; never a name or account number
  amount_centavos bigint null,
  payload jsonb not null default '{}'::jsonb  -- allowlisted scalars only
);

alter table public.staff_activity_events enable row level security;
revoke all on public.staff_activity_events from public, anon, authenticated;
grant select on public.staff_activity_events to authenticated;

drop policy if exists "staff_activity_events_select_staff" on public.staff_activity_events;
create policy "staff_activity_events_select_staff"
  on public.staff_activity_events
  for select to authenticated
  using (public.is_admin());
```

No `insert`/`update`/`delete` policy for `authenticated`; only the `security definer` trigger function writes. RLS is the actual security boundary: a customer JWT cannot read feed rows even if it subscribes to the channel.

Producer (sketch; allowlists, no raw metadata, no actor ids, no account numbers):

```sql
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
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return null;
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

create trigger trg_ops_transactions
  after insert or update of status on public.transactions
  for each row execute function public._emit_staff_activity_event();
create trigger trg_ops_security_events
  after insert on public.security_events
  for each row execute function public._emit_staff_activity_event();
create trigger trg_ops_audit_logs
  after insert on public.audit_logs
  for each row execute function public._emit_staff_activity_event();
create trigger trg_ops_schedule_runs
  after insert or update of status on public.scheduled_payment_runs
  for each row execute function public._emit_staff_activity_event();
```

The triggers only append to the side table; they do not modify `transactions`, ledger rows, balances, `_transfer_core` or `run_due_scheduled_payments`.

Publication (idempotent; Supabase already has `supabase_realtime`, PGlite does not):

```sql
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'staff_activity_events'
  ) then
    alter publication supabase_realtime add table public.staff_activity_events;
  end if;
end $$;
```

No other table is added to the publication in 8.5. INSERT-only events mean default replica identity is sufficient (no `REPLICA IDENTITY FULL`).

### 2.3 Client subscription, reconnection and missed events

```ts
const channel = supabase
  .channel('admin-ops-feed')
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'staff_activity_events' },
    (payload) => ingest(payload.new as StaffActivityEvent)
  )
  .subscribe((status) => {
    // SUBSCRIBED | CHANNEL_ERROR | TIMED_OUT | CLOSED
    void refreshMissedEvents();
  });
```

- On every status change (including the first `SUBSCRIBED` and every automatic reconnect), call `admin_ops_live_feed(lastId, 200)` in a loop until fewer than 200 rows return, then update `lastId`. This is the reconnect/missed-event refresh; dedupe by `id`.
- Also run a 60-second refresh while the dashboard is open, so a dropped socket cannot leave stale cards indefinitely.
- Cards (volume, status mix, cases, locks) are re-fetched with the analytics RPCs on the same refresh; the feed only drives "something happened" indicators and the activity list.
- Subscribe only after the client confirms the signed-in user is staff; RLS still enforces it server-side.
- **No fake events:** every feed row is produced by a database trigger on a real insert/status change. No seeded demo rows, no random/timer-generated inserts, no client-side synthetic events. An idle bank produces an empty feed.

## 3. Tests

### 3.1 PGlite (`npm run test:db`)

Add `scripts/review/pglite-phase8-5-ops.mjs`, imported and called from `scripts/review/pglite-behavior.mjs` using the existing `as / su / cust / ok / U / A / B` helpers. Cases:

1. Customer and `anon` cannot execute any of the four analytics RPCs (`Admin privilege required` / permission denied); admin can.
2. Invalid bucket (`'year'`), inverted range and `null` range are rejected.
3. Timeseries: create transfers, a bill payment, a deposit and a withdrawal with distinct centavos; assert per-day buckets, `bill_payment → bill`, `incoming`/`outgoing` equal the customer-leg ledger sums, biller settlement legs excluded, and a two-leg transfer counted once.
4. `day`/`week`/`month` bucketing around a Manila midnight (e.g. `2026-11-25T16:30:00Z` = next day in Manila) lands in the expected bucket.
5. Zero-filled buckets and status mix: a day with no activity returns all six categories with zero counts; `failed`/`reversed` envelopes appear in `status_mix` only.
6. Balance distribution: known balances land in the expected band; closed accounts and biller settlement accounts are absent; no `account_number` in any returned JSON.
7. Summary: growth counts, failed schedule runs with reason-code mapping (raw `failure_reason` text never returned), open cases, `locked_at` accounts and `accounts.status='frozen'`; `signin_failures` is `null` with the note.
8. Feed: a real transfer, a real `security_events` insert and a failed schedule each append exactly one sanitized row; replaying an idempotency key appends none; `audit_logs.metadata` / `actor_id` / `entity_id` / `facts` raw values never appear in `payload`.
9. RLS: a customer cannot `select` from `staff_activity_events`, cannot insert directly, and `public.is_admin()` is false for them; admin can select.
10. Reconciliation checks still pass unchanged.

Publication/Realtime behaviour is **not testable in PGlite** (no `pg_publication` support in the harness) — mark as NOT VERIFIED locally and cover in the live outline.

### 3.2 Live suite outline (spec only; to be written after A3 approval)

`scripts/test-phase8-5-ops.ts`, run from repo root with `.env` sourced, using an admin login (with TOTP step-up if required by the deployed policy) and a customer login:

1. Call all four RPCs as admin; assert HTTP 200, key shape, no PII keys in any response, and that results match a read-only SQL aggregate over the same range.
2. Call them as customer; assert permission denied. Confirm no `service_role` key is used client-side.
3. Subscribe to `staff_activity_events`; confirm `SUBSCRIBED`. Produce one real event (prefer an existing seeded test account with a tiny amount and a unique idempotency key; money movement needs captain approval in the live suite), assert one feed row with sanitized payload, then stop/restart the channel and assert the missed-event refresh returns it once (no duplicates by `id`).
4. Confirm a customer JWT subscribed to the same channel receives zero rows.
5. Record real outputs in `docs/agents/notes/phase-8-5-ops.md`; no row is marked passed in the UAT checklist by this agent.

No hosted queries or writes were performed while writing this spec.

### 3.3 Migration proposal

After `20261127000000_phase8_bantay_risk.sql`: **`supabase/migrations/20261128000000_phase8_5_ops_backend.sql`** — one migration containing the analytics functions, indexes, sanitized feed table, trigger function/triggers, grants/RLS and the idempotent publication block. Applied by the owner after review, as with every migration.

## 4. Risks and owner decisions (A3) — with recommendations

| #      | Decision needed                                                                                                                                                                     | Recommendation                                                                                                                                                                                                                                                                                                                                    |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A3     | Approve the 8.5 backend migration (staff-only analytics functions + Realtime publication + admin read policies).                                                                    | **Approve with amendment:** publish only `staff_activity_events`, **not** raw `transactions`, `security_events` or `audit_logs`. Route through Security review before the owner applies it. The amendment still satisfies the roadmap's "staff-only live metrics" goal and avoids leaking `metadata`, `facts`, `reference` and `idempotency_key`. |
| D-A3.1 | Failed sign-ins: the 8D `security_events` kind is allowed but there is no auth failure hook/writer, and `auth.audit_log_entries` is hosted-only and absent from the PGlite harness. | **Omit from 8.5.** Return `null` + `"no reliable source"` and show "Not available" in the UI. Adding an auth hook or reading auth internals is a separate migration/decision; never show a fake `0`.                                                                                                                                              |
| D-A3.2 | Should read-only dashboard RPCs require `assert_admin_aal2()` like 8D's case-management RPCs?                                                                                       | **No step-up for GET-only charts.** `is_admin()` inside each definer function is sufficient; requiring TOTP on every refresh would break live polling. Keep step-up for case actions.                                                                                                                                                             |
| D-A3.3 | Feed retention: append-only `staff_activity_events` grows with real activity.                                                                                                       | **No pruning in the prototype**; revisit with a retention job when the demo dataset grows. Do not reuse/truncate the table from the client.                                                                                                                                                                                                       |
| A2     | Chart library (separate roadmap decision, listed for sequencing only).                                                                                                              | Not needed to approve this backend spec; frontend chooses Recharts with an exact pin and CI/CD compatibility check before any code starts.                                                                                                                                                                                                        |

Additional risks recorded for the reviewer:

- **RLS + Realtime:** staff-only RLS is the enforcement point; if a future migration grants broader select on the feed, customers could subscribe. Any grant change must be reviewed.
- **Trigger expansion:** the new triggers run inside existing money RPC transactions. They only append a small row; if a trigger ever fails, the money RPC would roll back. Keep the function defensive (allowlists, no external calls, no raw JSON) and test that a malformed `metadata` value cannot break it.
- **Series range:** an unbounded date filter could generate many buckets. The client sends a bounded range; a future hardening step can clamp `p_to - p_from` server-side (not needed at prototype scale).
- **Money safety:** no change to `_transfer_core`, idempotency keys, the ledger, balances or `run_due_scheduled_payments` is proposed. The live suite's optional money event needs captain approval before it runs.

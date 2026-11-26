# Phase 9 · Stage 9E — Savings goals + time deposit planner backend (`phase-9-savings-goals`)

- **Branch:** `phase-9-savings-goals` (from `phase-8-integration` at `43c6bc4`)
- **Worktree:** `/Users/ronalbert/Personal Projects/davao-bank-savings-goals`
- **Spec:** `phase-9-services-spec:docs/specs/phase-9-more-services-spec.md` §4.7–§4.8
- **Migration:** `supabase/migrations/20261129200000_phase9_savings_goals.sql`
- **PGlite suite:** `scripts/review/pglite-phase9-savings-goals.mjs` (wired into `scripts/review/pglite-behavior.mjs`)

## What was built

1. **Table `public.savings_goals` (§4.7 — projection only, no fund lock, no money movement)**
   - Columns:
     - `id uuid primary key default gen_random_uuid()`
     - `user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade`
     - `name text not null` (trimmed length 1–60)
     - `target_amount_cents bigint not null` (`1..100000000000`)
     - `target_date date not null`
     - `monthly_deposit_cents bigint not null default 0` (`0..100000000000`)
     - `annual_rate_bps integer not null default 250` (`0..2000`, default `2.50%` p.a. illustrative simple interest)
     - `linked_account_id uuid null references public.accounts(id) on delete set null` _(note: spec prose wrote `references account_balances(account_id)`, which is a read-model view; FK references underlying `public.accounts(id)`)_
     - `status text not null default 'active' check (status in ('active', 'archived'))`
     - `created_at timestamptz`, `updated_at timestamptz`
   - Index: `idx_savings_goals_user_status` on `(user_id, status)`.
   - RLS enabled (`savings_goals_select_own`, `savings_goals_insert_own`, `savings_goals_update_own`, `savings_goals_delete_own` for `authenticated`; `revoke all` from `public, anon`). Insert and update `with check` policies also require `linked_account_id` (when non-null) to belong to `auth.uid()` and be `active`, preventing cross-account balance probing even if a client writes directly to the table.

2. **Savings goal RPCs (`security definer` + `set search_path = ''`, revoked from `public, anon`)**
   - `public.create_savings_goal(p_name, p_target_amount_cents, p_target_date, p_monthly_deposit_cents default 0, p_linked_account_id default null, p_annual_rate_bps default 250) returns jsonb`
   - `public.list_my_savings_goals(p_status text default null) returns table (...)`
   - `public.update_savings_goal(p_id, p_name default null, p_target_amount_cents default null, p_target_date default null, p_monthly_deposit_cents default null, p_linked_account_id default null, p_clear_linked_account default false, p_annual_rate_bps default null, p_status default null) returns jsonb`
   - `public.archive_savings_goal(p_id uuid) returns jsonb`
   - `public.delete_savings_goal(p_id uuid) returns jsonb`
   - `public.project_savings_goal(p_current_cents, p_target_amount_cents, p_target_date, p_monthly_deposit_cents default 0, p_annual_rate_bps default 250) returns jsonb`
   - Server-side simple-interest projection (`public._compute_savings_projection`, internal only):
     - No compounding of interest onto principal: in month $m \in \{1,\dots,n\}$, principal during the month is $P_0 + (m - 1)M$, so closed-form simple interest after $n$ months is $\text{round}\!\left(\left(n P_0 + \frac{n(n - 1)}{2} M\right) \cdot \frac{\text{annual\_rate\_bps}}{120000}\right)$.
     - Returns `current_amount_cents` (from caller's linked active account ledger balance, or `0`), `months_to_target`, `total_deposits_cents`, `projected_interest_cents`, `projected_amount_cents`, `shortfall_cents`, `progress_bps`, `progress_percent`, `on_track`, `estimated_months_to_goal`, `projected_completion_date`, bounded month-by-month `schedule` (up to 120 rows), and `'Simulation — goals are projections only. No funds are reserved or moved.'`.

3. **Pure time-deposit quote RPC (`public.quote_time_deposit`, §4.8 — pure, no storage)**
   - `public.quote_time_deposit(p_principal_cents bigint, p_term_days integer default null) returns table (...)`
   - Validates `p_principal_cents` between `₱1,000.00` (`100000`) and `₱100,000,000.00` (`10000000000`) and `p_term_days` in `(30, 60, 90, 180, 360)` (or `null` to compare all 5 demo terms in one call).
   - Illustrative demo rates: 30d `3.25%` (`325` bps), 60d `3.50%` (`350` bps), 90d `3.75%` (`375` bps), 180d `4.00%` (`400` bps), 360d `4.50%` (`450` bps), actual/360 simple interest: `round(principal_cents * rate_bps * term_days / 3600000)`.
   - Returns `simulation_only = true` and `'Simulation — sample rates only. No time deposit is opened and no funds move.'`. No `time_deposit_quotes` table is created.

## Shared-file touch notice

- `scripts/review/pglite-behavior.mjs`: added 1 import line and 2 invocation lines for `runPhase9SavingsGoalsTests` (same pattern as 9C and 9D). No money handlers, shared packages, or frontend/admin files were touched.

## Real check output

```text
$ npm run typecheck
> admin@0.1.0 typecheck · tsc --noEmit
> mobile@1.0.0 typecheck · tsc --noEmit
> @davao-bank/shared@0.1.0 typecheck · tsc --noEmit
(exit 0)

$ npm run lint
✖ 63 problems (0 errors, 63 warnings)
(exit 0 — 0 errors, 0 warnings in Stage 9E files)

$ npm run format:check
All matched files use Prettier code style!
(exit 0)

$ npm run test:unit
Test Suites: 63 passed, 63 total
Tests:       524 passed, 524 total
(exit 0)

$ npm run check:copy
PASS Copy audit clean across 170 files (17 justified allowlist match(es)).
(exit 0)

$ npm run test:db
✓ Reconciliation: every transfer/reversal/bill nets to zero — {"net":"2037176576","unbalanced":0,"mismatched":0}
✓ Reconciliation: account_balances == ledger sum for every account — {"net":"2037176576","unbalanced":0,"mismatched":0}
470 passed, 0 failed
(exit 0)
```

## NOT VERIFIED

- **Hosted Supabase migration apply & live RPC queries:** NOT VERIFIED — no hosted access per project rules; verified locally in PGlite (`npm run test:db`: `470 passed, 0 failed`).
- **Mobile UI screens (`SavingsGoals`, `TimeDepositPlanner`) & simulator rendering:** NOT VERIFIED — Stage 9E backend scope only.

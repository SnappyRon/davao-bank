# Phase 8 · Stage A — Bantay security center (backend)

- **Branch:** `phase-8-bantay-backend`
- **Worktree:** `/Users/ronalbert/Personal Projects/davao-bank-bantay`
- **Base commit:** `af8b3aa`
- **Migration:** `supabase/migrations/20261126000000_phase8_bantay.sql`
- **Tests:** `scripts/review/pglite-phase8-bantay.mjs` (invoked by `scripts/review/pglite-behavior.mjs`)

## What was built

1. **Table `public.security_limits`**
   - Columns: `user_id uuid primary key references public.profiles(id) on delete cascade`, `daily_transfer_limit_centavos bigint not null default 5000000 check (daily_transfer_limit_centavos between 100000 and 50000000)`, `updated_at timestamptz not null default now()`.
   - RLS enabled (`security_limits_select_own` scoped to `user_id = auth.uid()`). Client `insert`/`update`/`delete` revoked and denied (all limit updates go through `set_daily_limit`).
   - Existing profiles backfilled on migration; new profiles automatically receive a default row via `after insert` trigger `trg_ensure_profile_security_limit` (`public.ensure_profile_security_limit()`, `security definer set search_path = ''`, revoked from clients).
   - Added index `idx_transactions_created_at` on `public.transactions(created_at)`.

2. **RPCs**
   - `public.get_security_settings()` (`security definer set search_path = ''`, `authenticated` only): ensures default limit row on demand for existing profile, computes `spent_today_centavos` via internal `public._spent_today_centavos(auth.uid())`, and returns `jsonb` `{daily_transfer_limit_centavos, spent_today_centavos, remaining_today_centavos}` with `remaining_today_centavos` clamped at `>= 0`.
   - `public.set_daily_limit(p_limit_centavos bigint)` (`security definer set search_path = ''`, `authenticated` only): calls `public.assert_money_step_up()` first (`aal2` + fresh TOTP required), checks caller auth and active profile status, validates `100000..50000000` centavos (₱1,000.00–₱500,000.00), upserts `public.security_limits`, writes `audit_logs` (`action = 'daily_limit_updated'`, `entity = 'security_limits'`, `metadata = {old_limit_centavos, new_limit_centavos}`), and returns `public.get_security_settings()`.
   - `public.lookup_payee(p_account_number text)` (`security definer set search_path = ''`, `authenticated` only): returns `table (masked_name text, account_type text)` for an active account (`a.status = 'active'`), masking each whitespace-separated name part as `left(part, 1) || '***'` joined by `' '` (e.g. `'Juan dela Cruz'` → `'J*** d*** C***'`), or 0 rows when not found/inactive/blank. Never exposes `full_name` or `user_id`.

3. **Daily limit enforcement (`public.assert_daily_transfer_limit`)**
   - Internal guard `public.assert_daily_transfer_limit(p_user_id uuid, p_amount bigint, p_idempotency_key text default null)` (`security definer set search_path = ''`, revoked from `public, anon, authenticated`).
   - Locks the caller's `security_limits` row `for update` to serialize concurrent outgoing limit checks for that user, sums today's `Asia/Manila` outgoing `transfer` and `bill_payment` debits (`t.status in ('pending', 'completed')`, `t.created_at >= day_start and t.created_at < day_end`), and raises `'Daily limit reached'` if `(spent_today + p_amount) > limit`.
   - Called from `public._transfer_core` right after the `Insufficient funds` check (Step 5b), covering `transfer`, `transfer_by_account_number`, `pay_bill`, `pay_payment_request`, and `run_due_scheduled_payments` (both transfer and bill schedules) without touching `transfer`, `pay_bill`, `pay_payment_request`, or `run_due_scheduled_payments`.

## Decisions for unspecified details

- **Guard placement in `_transfer_core` vs start of public RPCs:** Calling `assert_daily_transfer_limit` at the very start of public RPCs caused an unfunded ₱999,999.99 scheduled transfer (`pglite-behavior.mjs` line 117 / line 267) to fail with `'Daily limit reached'` instead of `'Insufficient funds'` (`"Your balance was too low."`). Placing the single guard call inside `public._transfer_core` immediately after Step 5 (`v_source_balance < p_amount`) preserves idempotent replays, input/ownership validation, and insufficient-funds errors while uniformly enforcing the daily limit across all five outgoing transfer and bill-payment entry points (`transfer`, `transfer_by_account_number`, `pay_bill`, `pay_payment_request`, and `run_due_scheduled_payments`).
- **Remaining clamp:** When a user lowers their daily limit below what they already spent earlier that Manila day, `remaining_today_centavos` returns `0` (`greatest(limit - spent_today, 0)`) and further outgoing transfers/bills are blocked.
- **Masking fallback:** If a profile has a null or blank `full_name`, `lookup_payee` falls back to `'Customer'` → `'C***'` so `masked_name` is never null for an active account.
- **Validation copy:** Out-of-range `set_daily_limit` raises `'Daily limit must be between ₱1,000.00 and ₱500,000.00'`.

## Line-by-line comparison of `_transfer_core`

Compared against the latest prior definition in `supabase/migrations/20261111000000_phase7_notifications.sql` (lines 32–282). No other existing function (`transfer`, `pay_bill`, `pay_payment_request`, `run_due_scheduled_payments`, ledger, or idempotency logic) was modified.

```diff
--- 20261111000000_phase7_notifications.sql (public._transfer_core)
+++ 20261126000000_phase8_bantay.sql (public._transfer_core)
@@ -148,6 +148,9 @@
     raise exception 'Insufficient funds';
   end if;

+  -- 5b. Daily outgoing transfer / bill payment limit guard (Phase 8 Bantay)
+  perform public.assert_daily_transfer_limit(p_actor, p_amount, p_idempotency_key);
+
   v_clean_ref := coalesce(
     nullif(trim(p_reference), ''),
     case when v_effective_type = 'bill_payment' then 'Bill Payment' else 'Funds Transfer' end
```

## Check results

- `npm run typecheck`: exit 0 (`admin`, `mobile`, `@davao-bank/shared` `tsc --noEmit`)
- `npm run lint`: `✖ 63 problems (0 errors, 63 warnings)` (0 errors)
- `npm run format:check`: `All matched files use Prettier code style!`
- `npm run test:unit`: `Test Suites: 38 passed, 38 total` / `Tests: 334 passed, 334 total`
- `npm run test:db`: `166 passed, 0 failed` (118 existing checks + 48 Phase 8 Bantay checks, plus final double-entry ledger reconciliation)

## NOT VERIFIED

- Hosted Supabase database push / live RPC execution (`test:rls`, `test:money`, `test:schedules`, `test:qr`): **NOT VERIFIED** — hosted writes are forbidden by project rules until captain review and migration apply.
- True multi-connection concurrency on `assert_daily_transfer_limit` (`FOR UPDATE` row lock on `security_limits`): **NOT VERIFIED** — PGlite runs single-connection in-process Postgres.

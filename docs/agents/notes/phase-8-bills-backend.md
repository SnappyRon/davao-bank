# Phase 8 · Stage B — Saved billers, reminders, monthly summary, push tokens (backend-3)

- **Branch:** `phase-8-bills-backend` (from `af8b3aa`)
- **Worktree:** `/Users/ronalbert/Personal Projects/davao-bank-bills`
- **Commit title:** `Phase 8 · Stage B — Saved billers, reminders, monthly summary (backend)`

## What was built

### 1. Migration: `supabase/migrations/20261126010000_phase8_bills_summary.sql`

- **`public.saved_billers`**:
  - Columns: `id` (PK), `user_id` (default `auth.uid()`, FK to `public.profiles(id)` on delete cascade), `biller_id` (FK to `public.billers(id)`), `reference` (non-empty trimmed text), `nickname` (`1..40` chars, non-blank), `due_day` (`smallint null`, `1..28`), `remind` (`boolean not null default true`), `created_at`.
  - RLS enabled with own-row `select`, `insert`, `update`, and `delete` policies (`user_id = auth.uid()`) for `authenticated` only; revoked from `public` and `anon`.
- **`public.get_bill_reminders()`** (backed by internal `public._get_bill_reminders_for_date(p_user_id, p_today)`):
  - `security definer`, `set search_path = public, auth, pg_temp`, checks `auth.uid()` is non-null, revoked from `public` and `anon`, granted to `authenticated` (internal helper revoked from `public, anon, authenticated`).
  - Returns saved billers belonging to `auth.uid()` where `remind = true`, `due_day is not null`, and `billers.is_active = true`, whose next occurrence of `due_day` in `Asia/Manila` falls within `0..7` days inclusive, returning `biller_name` and `days_until_due`, ordered by `days_until_due asc, created_at asc`.
- **`public.get_monthly_summary(p_month date default null)`**:
  - `security definer`, `set search_path = public, auth, pg_temp`, checks `auth.uid()` is non-null, revoked from `public` and `anon`, granted to `authenticated`.
  - Defaults `p_month` to the current `Asia/Manila` date when `null`, computes month boundaries in `Asia/Manila` (`+08:00`), and returns all 5 categories (`money_in`, `transfers_out`, `bills`, `cash_out`, `adjustments`) with `total_centavos` and `count` scoped strictly to `accounts.user_id = auth.uid()` and transactions with `status in ('completed', 'reversed')`.
- **`public.push_tokens`**:
  - Columns: `user_id` (default `auth.uid()`, FK to `public.profiles(id)` on delete cascade), `token` (non-empty), `platform` (`'ios'` or `'android'`), `created_at`, primary key `(user_id, token)`.
  - RLS enabled with own-row `select`, `insert`, `update`, and `delete` policies (`user_id = auth.uid()`) for `authenticated` (including `update` so `.upsert()` works idempotently); revoked from `public` and `anon`.

No existing money functions (`_transfer_core`, `transfer`, `pay_bill`, `deposit`, `withdraw`, or schedule functions) were modified.

### 2. Design choices for unspecified details

- **Inclusive 0..7 day reminder window**: `days_until_due between 0 and 7` includes bills due today (`0`) through 7 days ahead (`7`) across month and year boundaries; muted (`remind = false`), unset (`due_day is null`), and inactive billers are excluded.
- **No extra unique constraint on `saved_billers`**: Kept the contract columns without adding an unrequested unique constraint on `(user_id, biller_id, reference)` so users or tests can store distinct nicknames/reminders if desired.
- **5 fixed summary rows & signed `adjustments`**: `get_monthly_summary` always returns all 5 categories (with `0` total and `0` count when empty) and sums `adjustment`/`reversal` entries signed (`+credit`, `-debit`) so `money_in - transfers_out - bills - cash_out + adjustments` reconciles exactly with the caller's ledger net for the month.
- **Null-default `p_month`**: `get_monthly_summary(p_month date default null)` defaults to the current `Asia/Manila` month when `null` is passed.
- **Helper `_get_bill_reminders_for_date` for rollover testing**: `get_bill_reminders()` stays zero-argument per the contract while delegating to a revoked helper so PGlite can deterministically test Jan->Feb, non-leap/leap Feb->Mar, and Dec->Jan rollovers regardless of the host clock date.
- **`saveBiller` update vs insert**: Supports both insert (when `id` is omitted, resolving `user_id` from `auth.getUser()`) and update (when `id` is provided).

### 3. Shared types, client wrappers & unit tests (`packages/shared`)

- `packages/shared/src/types/index.ts`: `SavedBiller`, `SaveBillerParams`, `BillReminder`, `MonthlySummaryCategory`, `MonthlySummaryItem`, `PushPlatform`, `PushToken`.
- `packages/shared/src/supabase/client.ts`: `fetchSavedBillers`, `saveBiller`, `deleteSavedBiller`, `fetchBillReminders`, `fetchMonthlySummary`, `registerPushToken`.
- `packages/shared/src/__tests__/bills_summary.test.ts`: 12 unit tests covering all 6 wrappers, input validation, auth requirements, date/month formatting, and error handling.

### 4. PGlite checks (`scripts/review/pglite-behavior.mjs`)

Added 27 PGlite assertions covering:

- `saved_billers` own-row RLS (insert, spoofed `user_id` rejection, cross-user select/update/delete denial, `user_id` reassignment denial, `anon` denial, `due_day > 28` and blank `nickname` constraint checks).
- `push_tokens` own-row RLS (upsert, spoofed `user_id` rejection, cross-user select/delete denial, `anon` denial, invalid `platform` check).
- `get_bill_reminders()` caller scoping, `anon` rejection, `permission denied` on internal helper, and month/year rollover windows (`2026-01-29`, `2026-02-25`, `2024-02-25`, `2026-12-28`) excluding out-of-window, `remind = false`, `due_day is null`, and other users' rows.
- `get_monthly_summary()` exact reconciliation against `ledger_entries` for User A and User B separately, 5 zeroed rows for an empty month, and `anon` rejection.

## Verification

- `npm run typecheck`: exit 0 (`admin`, `mobile`, `@davao-bank/shared` all clean)
- `npm run lint`: exit 0 (`✖ 63 problems (0 errors, 63 warnings)`)
- `npm run format:check`: exit 0 (`All matched files use Prettier code style!`)
- `npm run test:unit`: exit 0 (`Test Suites: 39 passed, 39 total`, `Tests: 347 passed, 347 total`)
- `npm run test:db`: exit 0 (`145 passed, 0 failed`)

### NOT VERIFIED

- Hosted Supabase project (`qomxlzvrovwsfneqsfej`): NOT VERIFIED — migration not applied per project rules (captain applies after review).
- Live suites against hosted Supabase (`test:rls`, `test:money`, etc.) and mobile UI integration: NOT VERIFIED — out of scope for this backend worktree.

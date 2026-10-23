# Davao Bank — Phase 4 Implementation Prompt

**Hand this entire file to your coding agent.** Phase: **4 of 7 — Admin Management System.** Phases 1–3 are in place (setup, database & auth, core banking). Build on them without regressing anything.

This phase builds the **staff-facing admin tools** in the Next.js app (`apps/admin`). Like customer money movement, **all admin writes to data go through server-side `SECURITY DEFINER` functions that check `is_admin()` and write an audit log** — the admin UI never writes money tables directly, and every privileged action is attributable and auditable.

---

## 0. Carry-forward verification (must be satisfied for sign-off)

- The **Phase 3 money tests must pass on a live database**: `supabase db reset && npm run test:rls && npm run test:money` (concurrency + reconciliation). If not yet run, run them and include the output. Phase 4 adds reversals/adjustments, so reconciliation must continue to hold afterward.
- (Optional Phase 3 hardening, not required): in `transfer`/`withdraw`, re-check the idempotency key on the insufficient-funds branch so a rare simultaneous duplicate returns the replay instead of an "insufficient funds" error.

## 1. What to review before starting

- Proposal **§4.1 (admin features)**, **§5.2 (roles & permissions)**, **§6.1 (principles)**, **§7.3 (RLS & access control)**.
- Existing code: Phase 2 migration (schema, RLS, `is_admin()`, `write_audit`, `account_balances`), Phase 3 migration (money functions, `get_account_transactions`), the admin app auth (`middleware.ts` already enforces admin-only server-side; `supabase-cookies.ts`; `supabase-server.ts`), and `packages/shared`.
- If anything conflicts with the proposal or existing code, **stop and flag it**.

## 2. Scope boundary

**In scope (Phase 4):**

- Admin **dashboard** with KPIs.
- **User management** (list/search, detail, suspend/activate, verification flag).
- **Account management** (view, open, freeze, close).
- **Transaction monitoring** (list/filter all transactions) and **reversal** (within rules).
- **Manual balance adjustment** (credit/debit with mandatory reason).
- **Audit log viewer** and a basic **report export** (CSV).

**NOT in scope:**

- Changes to the customer mobile flows (Phase 3) beyond what admin actions naturally affect.
- Phase 5 integration/notifications polish, Phase 6 hardening, Phase 7 deployment.
- Do not weaken any Phase 2/3 RLS; do not let the admin UI write money tables directly.

## 3. Server-side admin functions (new migration, all `SECURITY DEFINER`, all gated by `is_admin()`)

Every function: fixed `search_path = public, auth`; first line checks `if not public.is_admin() then raise exception 'Admin privilege required'; end if;`; calls `write_audit(...)`; granted `execute` to `authenticated`. **Call these with the admin's session (cookie client) so `auth.uid()` is the admin and the audit log records the real actor** — do not call them with the service-role client.

- **`admin_set_user_status(p_user_id uuid, p_status text, p_reason text)`** — suspend/activate a customer; validates status value; audits old→new with reason.
- **`admin_open_account(p_user_id uuid, p_type text, p_currency text)`** — creates a new account (generates a unique account number) for a user; audits.
- **`admin_set_account_status(p_account_id uuid, p_status text, p_reason text)`** — freeze/unfreeze/close an account; audits.
- **`admin_adjust_balance(p_account_id uuid, p_amount bigint, p_direction text, p_reason text, p_idempotency_key text)`** — manual credit/debit: requires a non-empty `p_reason`; `p_amount > 0`; creates an `adjustment` transaction + one ledger entry (credit or debit); idempotent; audits; notifies the account owner. A debit must not drive the balance negative (check under `FOR UPDATE`) unless explicitly allowed — default: block with a clear error.
- **`admin_reverse_transaction(p_transaction_id uuid, p_reason text, p_idempotency_key text)`** — creates a compensating `reversal` transaction with **opposite** ledger entries of the original; requires a reason; idempotent; only for `completed` transactions **not already reversed**; marks the original `status = 'reversed'`; audits; notifies affected owners. If the compensating debit would drive an account negative, **block** with a clear error (admin must adjust first). Keep the books balanced (reversal entries net to zero).

Reads (dashboard, lists, audit) can use the admin's cookie session directly, since Phase 2 RLS already lets admins `select` all rows.

## 4. Admin UI (`apps/admin`, App Router) — styled with `@davao-bank/shared` palette (no hardcoded hex)

All pages are under the middleware-protected (admin-only) area. Use the cookie **server** client for reads in Server Components; call the admin functions via the admin session (route handlers / server actions) for writes.

- **Dashboard (`/`)**: KPIs — total users, total accounts, **total system balance** (sum of `account_balances`), transaction count/volume (optionally last 30 days), recent activity. Numbers must come from the DB, not be faked.
- **Users (`/users`)**: searchable/filterable list from `profiles`; detail view; **suspend/activate** (calls `admin_set_user_status`); show the user's accounts.
- **Accounts (`/accounts`)**: list with balances; **open** (`admin_open_account`), **freeze/close** (`admin_set_account_status`).
- **Transactions (`/transactions`)**: list/filter all transactions (by type/status/date/account); detail view; **reverse** (`admin_reverse_transaction`) with a required reason and a confirmation step.
- **Adjustments**: UI to **credit/debit** an account (`admin_adjust_balance`) with a mandatory reason and confirmation.
- **Audit log (`/audit`)**: view/filter `audit_logs` (actor, action, entity, time).
- **Export**: a basic CSV export for transactions (and/or users).
- Every destructive/financial action needs a **confirmation step** and surfaces server errors clearly.

## 5. Technical standards & security

- **Admin writes only via `is_admin()` `SECURITY DEFINER` functions**; the admin UI never writes money tables directly; RLS stays deny-by-default.
- **Attribution:** admin functions run under the admin's session so `auth.uid()` and the audit log capture the real actor. Reserve the service-role client for operations that genuinely require it (avoid it for routine admin actions).
- **Append-only audit:** every admin action writes an `audit_log` row (never update/delete).
- **Integrity preserved:** reversals/adjustments keep the ledger balanced; money stays integer centavos; no operation may silently drive a balance negative.
- **Idempotency** on adjustment and reversal (unique key), consistent with Phase 3.
- **Mandatory reasons** on suspensions, status changes, adjustments, and reversals.
- Server-side admin gating (middleware) stays intact; non-admins cannot reach or invoke any admin capability.
- Migrations additive; apply cleanly with `supabase db reset`; do not edit earlier migrations. Secrets: service-role key stays server-only; anon key only in clients.

## 6. Completion criteria (verified against a live database)

1. `supabase db reset` applies all migrations (incl. new admin functions) cleanly + seed.
2. Dashboard KPIs match direct DB queries (users, accounts, total balance, transaction counts).
3. User **suspend/activate** works, is audited, and a suspended user is handled per policy; verification flag works.
4. Account **open/freeze/close** works and is audited.
5. **Manual adjustment** (credit/debit) works, requires a reason, is audited, notifies the owner, and refuses to drive a balance negative.
6. **Reversal** creates correct compensating entries, marks the original `reversed`, is idempotent, refuses double-reversal, blocks when it would overdraw, and is audited.
7. **Non-admin cannot** reach admin pages or invoke any `admin_*` function (function-level `is_admin()` check verified, not just UI gating).
8. **Reconciliation still holds** after adjustments/reversals: per-account balance = ledger sum; global credits = debits (run `npm run test:money` + any new admin tests).
9. RLS integrity preserved; customers still see only their own data; mobile flows unaffected.
10. Repo-wide `typecheck`, `lint`, `format:check` pass; `build:admin` and `expo export` succeed; secret-leak check clean.

## 7. Tests & verification (run against a live DB and report output)

- **Admin function gate:** a customer session calling each `admin_*` function is **rejected**; an admin session succeeds.
- **User/account management:** suspend/activate, open/freeze/close — show state changes + audit rows.
- **Adjustment:** credit and debit; debit-to-negative is blocked; reason enforced; audit + notification created.
- **Reversal:** reverse a transfer → compensating entries correct, original `reversed`, balances consistent; second reversal attempt rejected; overdrawing reversal blocked.
- **Reconciliation:** `npm run test:money` (and new admin tests) green after admin operations.
- **Access control:** non-admin blocked at middleware and at function level.
- **Quality:** typecheck, lint, format:check, admin build, expo export, secret-leak grep — all shown passing.

## 8. What to preserve / avoid changing

- Don't change Phase 3 customer money functions or mobile flows (except the optional idempotency hardening in §0 if you choose to do it).
- Don't weaken/remove any RLS policy; don't edit earlier migrations.
- Keep money as integer centavos, audit append-only, palette/shared structure intact, service-role boundary intact.
- Stay in scope: no Phase 5–7 work.

## 9. Report back for review

Provide: the new migration (admin functions), the admin pages + the server-side call sites (showing they use the admin session and pass reasons/idempotency keys), the new test script(s), and the **live verification output** from §7 (especially reconciliation after reversals/adjustments and the non-admin rejection proof). Note anything you changed from this prompt and why.

_Reminder: the reviewer will run `supabase db reset`, the admin + money tests, the builds, and the secret-leak check against the actual code — not just your summary — before approving Phase 4. Reconciliation after reversals/adjustments and the function-level non-admin rejection are mandatory for sign-off._

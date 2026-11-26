# Davao Bank — Phase 5 Follow-Up (Fixes) Prompt

**Hand this entire file to your coding agent.** This is a correction pass on Phase 5, not a new phase. Work on the same branch, `phase-5-redesign-features`. Make **one new migration** (never edit an earlier one) and **one commit**, titled `Phase 5 · Fixes — review corrections`.

## What the review found

The reviewer applied all 9 migrations to a real Postgres engine (PGlite, with Supabase stand-ins) and exercised every money feature as different users.

**Most of Phase 5 works and must be kept as it is:**

- 43 of 46 behavior checks pass, and the ledger reconciles.
- Transfers, deposits, retries and reversals behave correctly.
- Suspension is enforced.
- `_transfer_core`, the executor and `write_audit` are not callable by clients.
- Bill pay validates references.
- The scheduler runs each payment exactly once and records failures without partial writes.
- Monthly date math is correct.
- Payment requests can't be paid twice.
- FX rates match the live Frankfurter API exactly.
- All quality checks pass, and there are no secret leaks.

**The reviewer's harness is in the repo.** Use it to verify your fixes:

```
npm i -D @electric-sql/pglite
node scripts/review/pglite-behavior.mjs
```

It must end with **0 failed**. Add it as `npm run test:db` and keep it permanently as an offline integration suite. Because it has a single connection, it cannot test true concurrency; that still needs the live database.

**Verification so far was not real.**

- Every result in `PHASE5_REPORT.md` came from "Contract Mode", which searches files and never touches a database. The hosted project has **no tables** (every query returns 404).
- The Stage 0 instruction to remove that fallback was not carried out, and the agent continued past a failing gate.
- Claims such as "Backfilled 1 year (768 rows)" and "Ledger reconciliation: PASSED (Nominal)" were not true of any database.

**Stop on failure.** From now on, a stage whose gate fails stops there.

---

## Fixes

### Fix 1 — HIGH: remove the Contract Mode fallback (repeat of Stage 0 item 6)

- **Problem:** every `scripts/test-*.ts` still prints PASS and exits 0 when the database is unreachable.
- **Change, in every script:**
  - If the database or its tables can't be reached, print `NOT VERIFIED — database unreachable` and **exit 1**.
  - Before running any live test, print the URL host and `✓ Connected to live database`.
  - Source-file checks may run **only in addition to** live tests.
- **Also replace the code-scanning "tests" for Stages B–E with real live tests.** Examples of what currently passes without running anything:
  - "mathematically guaranteed"
  - "Migration seeds 1-year authentic ECB rates"
  - "PASSED (Nominal)"

  Each listed behavior must be exercised through real RPC calls by real signed-in users, the way `pglite-behavior.mjs` does it.

### Fix 2 — HIGH: `npm run seed` cannot create the admin or system user

- **Problem:**
  - `seed.ts` upserts `profiles.role = 'admin' | 'system'` using the service-role key.
  - The signup trigger has already created a `customer` profile, so the upsert becomes an UPDATE.
  - The Phase 3 guard trigger then raises **`Only admins may change role or status`**, because `is_admin()` is false (there is no `auth.uid()`).

  Result: there is no admin, so nobody can sign in to the admin app. There is no system profile either, so no billers get seeded.

- **Fix the guard trigger, in the new migration:**
  - Allow role and status changes when the request is the trusted backend. Check the database role: `current_user` in (`'service_role'`, `'postgres'`, `'supabase_admin'`), or the JWT role claim `current_setting('request.jwt.claim.role', true) = 'service_role'`.
  - Clients with an active session must still go through `is_admin()`.
  - **Do not** allow it simply because `auth.uid()` is null: anon has no UPDATE policy anyway, but don't widen the rule beyond the service role.
- **Seed:**
  - Ban the system user from signing in through the Admin API (`ban_duration`), as Stage C required.
  - Fail loudly (exit 1) if any profile, account or biller step errors, instead of logging and continuing.
- **Test:** the service role can set `admin`/`system`; a customer session still cannot change its own role or status.

### Fix 3 — HIGH: scheduled payments never get scheduled on a fresh database

- **Problem:**
  - In `20261023220000_phase5_stage_c_schedules_bills.sql` §9, `cron.unschedule('davao-run-schedules')` runs before `cron.schedule(...)` inside one `begin … exception when others then null` block.
  - On a fresh database the job doesn't exist, so `unschedule` raises, the handler swallows it, and **`cron.schedule` never runs**.
  - The Stage D expiry job does this correctly, with its own inner block around `unschedule`.
- **Fix:**
  - Re-register the job in the new migration. Wrap `unschedule` in its own `begin … exception when others then null; end;`, then call `cron.schedule`.
  - **Do not swallow errors from `cron.schedule`.** If `pg_cron` isn't installed, `raise warning` with clear instructions.
  - Add an admin/ops function `public.register_cron_jobs()`, revoked from clients, that (re)registers **all** jobs: schedules, request expiry and FX sync. Document running it after enabling `pg_cron`.

### Fix 4 — HIGH: the FX daily sync is never scheduled

- **Problem:** `supabase/functions/fx-sync/index.ts` says "Scheduled via pg_cron daily at 04:00 UTC", but nothing registers that job anywhere. The rates will stop at the seed date (2026-10-26).
- **Fix:**
  - Register a daily job inside `register_cron_jobs()`, using `pg_net` to POST to the Edge Function with a secret header the function checks. Store the secret in Vault or another secure setting, **not in the migration**.
  - Alternatively, use Supabase's scheduled-function feature.
  - Either way, document the exact setup steps in the README. Deploying the function is part of those steps: `supabase functions deploy fx-sync`.

### Fix 5 — MEDIUM: paid payment requests are not linked to their transaction

- **Problem:**
  - `pay_payment_request` reads `v_tx_res->>'transaction_id'`, but `_transfer_core` returns the transaction id under **`'id'`**. Bill pay and the executor read `'id'` correctly.
  - Result: every paid request has `transaction_id = NULL`. Receipts and audit lose the link, and the `transaction_id unique` "pay once" guarantee is silently disabled.
- **Fix:**
  - Read `->>'id'`. Raise an exception if it is null.
  - **Idempotent retry:** if the request is already `paid` _by the same `p_idempotency_key`_, return the original result instead of the error "no longer pending". That way a retry after a network timeout shows success.

### Fix 6 — MEDIUM: money moves with no confirmation on phones without biometrics

- **Problem:**
  - `SettingsContext.confirmBiometricPayment` returns `{ success: true }` when biometrics are unsupported or turned off.
  - The password fallback runs only after a biometric _failure_, and only in Transfer and Withdraw.
  - So on any device without enrolled biometrics, including most emulators, transfers, bill payments and request payments go through **with no confirmation**.
- **Fix (one shared helper used by every money flow):**
  - **Biometrics available and enabled:** biometric prompt, which may fall back to the device passcode.
  - **Otherwise** (no biometrics, setting turned off, or a biometric failure): require **password re-entry**, verified with `supabase.auth.signInWithPassword` for the user's own email.
  - **Never return success without one of those two checks.**
- **Apply it to every flow:** Transfer, Withdraw, Pay bills, Pay request, pay-from-QR (which goes through Transfer), and **create/edit schedule**. Scheduled-payment editing currently has no confirmation.
- Keep the order of operations: create the idempotency key once → run the confirmation → call the server.

### Fix 7 — LOW-MEDIUM: saved-recipient account numbers can be rewritten

- **Problem:** the UPDATE policy only checks ownership, so an owner can change `account_number` to anything. That bypasses `add_saved_recipient`'s validation and limits; the reviewer set it to a nonexistent account.
- **Fix:**
  ```sql
  revoke update on public.saved_recipients from authenticated;
  grant update (nickname) on public.saved_recipients to authenticated;
  ```

### Fix 8 — LOW: finish the Stage A design-system requirements

- **Admin inline styles:** 196 `style={{…}}` remain; the requirement was 0. Move them into CSS Modules.
- **Stray hex colors:** remove the 15 in `SchedulesClient.tsx` and `BillersClient.tsx`, including `var(--x, #hex)` fallbacks and hardcoded Lucide icon colors. Use tokens.
- **Token duplication:** `globals.css` hand-copies the palette. Generate those CSS variables from `@davao-bank/shared`, or add a check that fails when they differ.
- **Reduce Motion is not honored anywhere**, and `react-native-reanimated` isn't installed.
  - Honor `AccessibilityInfo.isReduceMotionEnabled` / `useReducedMotion` on mobile, and `prefers-reduced-motion` in admin.
  - Using React Native's built-in `Animated` instead of Reanimated is acceptable if Reduce Motion is respected. Record that deviation in the report.
- **Oversized files** (the target was about 350 lines): `TransferModal.tsx` (1,116), `PayBillsModal.tsx` (868), `QRHubModal.tsx` (784), `FXRatesModal.tsx` (744), `SchedulesClient.tsx` (711), `HomeScreen.tsx` (702). Split them into step components without changing behavior.

---

## Verification (required, with full output in `PHASE5_REPORT.md` under a new "Fixes" section)

1. `node scripts/review/pglite-behavior.mjs` (as `npm run test:db`) → **0 failed**. Add checks for every fix:
   - the seed role path works for the service role and is blocked for customers
   - a customer can't rewrite a saved recipient's account number
   - a paid request has a non-null `transaction_id`, and a same-key retry returns success
2. **Live database** — the owner must first run `npx supabase db push` on the hosted project:
   - `npm run seed` exits 0 and creates an admin, two customers, the system user and four billers.
   - Run every live suite. Each must show `✓ Connected to live database`. Include the concurrency tests: parallel transfers can't overdraw, a request paid in parallel only once, the executor run in parallel only once.
   - `select * from cron.job` shows the schedule, expiry and FX jobs.
   - The FX sync runs once and updates `fetched_at`.
3. typecheck, lint, format:check, `build:admin`, `expo export`, secret-leak check.
4. **Screenshots:**
   - the password-confirmation prompt on a device or emulator without biometrics
   - every admin page at 1440 / 1024 / 768 px
   - the mobile screens touched by Fix 8

## Do NOT

- Edit earlier migrations, or weaken any RLS policy or function revoke.
- Change money logic beyond Fix 5. Fixes 2 and 3 are trigger and cron changes only.
- Report a suite as passing unless its output shows `✓ Connected to live database`, or it is the PGlite suite.

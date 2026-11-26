# PHASE9_REPORT — Stage 9F admin service requests and appointments

## Scope and commits

Worktree: `/Users/ronalbert/Personal Projects/davao-bank-admin-services`
Branch: `phase-9-admin-services`
Base: `fc59513 Phase 8 · Merge — phase-9-fx-converter`

```text
(this commit) Phase 9 · Stage 9F — Admin service requests and appointments
fc59513 Phase 8 · Merge — phase-9-fx-converter
```

`git log --oneline -1` was run immediately before this stage's commit (base shown above); the final commit hash is reported to the captain in the handoff reply. No push and no merge into another branch were performed.

## What was implemented

- `apps/admin/src/app/service-requests/`: server page resolves the staff session for `AdminShell`, then `ServiceRequestsClient` reads `admin_list_service_requests` through the existing browser client. Status and type filters, masked customer id (`Customer •• AAAA`), sentence-case statuses, and a detail drawer with whitelisted detail fields. Status changes require a staff note and call `admin_update_service_request` with `p_id`, `p_status`, `p_note`.
- `apps/admin/src/app/appointments/`: server page and `AppointmentsClient` read `admin_list_appointments`, filter by branch and Manila calendar date, and mask the RPC's `user_name` (`J*** d*** C***`) everywhere it appears. Status changes call `admin_update_appointment` with `p_id`, `p_status`, `p_staff_note` (optional note).
- `apps/admin/src/lib/adminServices.ts`: exact migration vocabularies (requests: `submitted`, `in_review`, `completed`, `rejected`, `cancelled`; appointments: `booked`, `cancelled`, `completed`), type labels, variants, `formatReferenceId`-based references, customer masking and a strict detail whitelist. Free text and `new_value` are reported only as "Provided"; no raw UUID, full name, email, card number or TOTP value is rendered.
- `apps/admin/src/components/services/`: shared aal2 read hook (`auth.mfa.getAuthenticatorAssuranceLevel()` before each RPC) plus state components for skeleton, empty, error with **Try again**, offline and aal2-denied (link to `/mfa/verify`). A visible `Simulation` label and explanatory note appear on both screens.
- `apps/admin/src/components/ui/Sidebar.tsx`: added **Service requests** and **Appointments** links with 44 px-friendly nav rows; reused existing UI primitives and theme tokens (line height 1.4).
- Tests: `apps/admin/src/__tests__/admin_services_display.test.ts` and `admin_services_screens.test.tsx` (RTL) cover status vocabularies, masking/whitelists, filters, drawer, status-change payloads, empty/error/retry/offline/step-up states and absence of raw identifiers. `e2e/admin/admin-services.spec.ts` contains owner-session Playwright checks, every one skipped and labelled `NOT VERIFIED — needs owner sign-in`; it reads no `.env` and never automates MFA.
- No backend, migration, money handler, shared error helper, `package.json`, lockfile or hosted database change. No dependency added. `.env` files were only symlinked (`apps/mobile/.env`, `apps/admin/.env.local`); their contents were never opened or printed.

## File-ownership note

All implementation files are inside this agent's 9-track admin-services assignment (`apps/admin/src/app/service-requests/**`, `apps/admin/src/app/appointments/**`, `apps/admin/src/lib/adminServices.ts`, `apps/admin/src/components/services/**`, `apps/admin/src/components/ui/Sidebar.tsx`, the two new admin RTL tests and the new Playwright spec). `docs/agents/STATUS.md` and this `PHASE9_REPORT.md` were touched only as the mandatory handoff/report files. No reviewer-owned file (`docs/UAT_CHECKLIST.md`, `docs/uat-evidence/`, `Phase-*.md`) was edited.

## Checks — real output

Run from the worktree root after `npm ci` (`added 1500 packages, and audited 1504 packages in 25s`).

`npm run typecheck`:

```text
> davao-bank@0.1.0 typecheck
> npm run typecheck --workspaces --if-present

> admin@0.1.0 typecheck
> tsc --noEmit

> mobile@1.0.0 typecheck
> tsc --noEmit

> @davao-bank/shared@0.1.0 typecheck
> tsc --noEmit
```

`npm run lint` (tail):

```text
✖ 63 problems (0 errors, 63 warnings)
```

All 63 warnings are pre-existing repository warnings (including one removed from this branch: an unused `React` import in the new hook, fixed before this final run); there are no lint errors in the new files.

`npm run format:check`:

```text
Checking formatting...
All matched files use Prettier code style!
```

`npx jest`:

```text
A worker process has failed to exit gracefully and has been force exited. This is likely caused by tests leaking due to improper teardown. Try running with --detectOpenHandles to find leaks. Active timers can also cause this, ensure that .unref() was called on them.

Test Suites: 65 passed, 65 total
Tests:       536 passed, 536 total
Snapshots:   0 total
Time:        44.579 s
Ran all test suites in 3 projects.
```

`npm run check:copy`:

```text
PASS Copy audit clean across 177 files (17 justified allowlist match(es)).
```

`npm run build:admin` (excerpt):

```text
▲ Next.js 16.4.6 (Turbopack)
✓ Creating an optimized production build ...
✓ Compiled successfully in 2.1s
  Running TypeScript ...
  Finished TypeScript in 1697ms ...
✓ Generating static pages using 9 workers (8/8) in 130ms
Route (app)
├ ƒ /appointments
├ ƒ /service-requests
```

The build also emits a pre-existing deprecation notice: `The "middleware" file convention is deprecated. Please use "proxy" instead.` The root `npm run lint`, `npm run typecheck`, `npm run format:check` and `npm run check:copy` checks are shared workspaces; they passed on this branch unchanged apart from the new files.

## NOT VERIFIED

- Playwright with the project's default config: `npx playwright test e2e/admin/admin-services.spec.ts` → `Error: Timed out waiting 120000ms from config.webServer.` A pre-existing dev server occupies port 3000, so Next started on port 3002 while Playwright waited on 3000. No owner storage state was available. To confirm the specs skip cleanly, they were rerun with a temporary no-webServer config (removed immediately afterwards; not committed):
  ```text
  Running 3 tests using 1 worker
  NOT VERIFIED — needs owner sign-in
  NOT VERIFIED — needs owner sign-in
  NOT VERIFIED — needs owner sign-in
  3 skipped
  ```
  Real aal2 browser evidence still requires `ADMIN_STORAGE_STATE` from the owner.
- Hosted Supabase RPC behaviour, device/Maestro flows, app store deployment and on-screen 44 pt / 1.4× text at device scale were not exercised; no hosted writes or sign-ins were attempted by this agent.

## Stage 9H — Cards backend (2026-11-26)

Branch `phase-9-cards-db`, taken over from `6b6aab5`. The captain's one-migration brief supersedes the spec's two proposed files. Files: `supabase/migrations/20261130200000_phase9_cards.sql`, `scripts/review/pglite-phase9-cards.mjs`, harness registration in `scripts/review/pglite-behavior.mjs`, service-role seed wiring in `scripts/seed.ts`, and STATUS handoff. No `_transfer_core`/ledger/idempotency/scheduled-payment code changed; no new dependency; no push; no hosted write; no `.env` content read.

Real check output:

```text
npm run test:db
✓ Reconciliation: every transfer/reversal/bill nets to zero — {"net":"2037176576","unbalanced":0,"mismatched":0}
✓ Reconciliation: account_balances == ledger sum for every account — {"net":"2037176576","unbalanced":0,"mismatched":0}

530 passed, 0 failed

npm run typecheck
> admin@0.1.0 typecheck
> tsc --noEmit
> mobile@1.0.0 typecheck
> tsc --noEmit
> @davao-bank/shared@0.1.0 typecheck
> tsc --noEmit

npm run lint
✖ 62 problems (0 errors, 62 warnings)

npm run format:check
Checking formatting...
All matched files use Prettier code style!

npx jest (clean rerun)
Test Suites: 73 passed, 73 total
Tests:       621 passed, 621 total
Snapshots:   0 total

npm run check:copy
PASS Copy audit clean across 185 files (17 justified allowlist match(es)).
```

The first `npx jest` run, launched alongside other checks, reported 6/73 suites failing on pre-existing 5 s RNTL timeouts (`profile_confirmation.test.tsx` among them); a clean rerun passed all 73 suites / 621 tests. PGlite suite assertions cover S1–S6: Luhn-invalid fake PAN range, encrypted-only bytea columns, owner RLS and client-write denials, aal1/aal2 reveal, audited controls, merchant payment via unchanged `transfer` with Bantay and card-day caps, replay idempotency, direct-transfer rejection, online/frozen/replacement states, derived credit dues with reversal and overpayment/cross-customer rollback, aal2 admin views, and SECURITY DEFINER/search_path metadata for all 23 new functions.

Deviation from spec, reported to captain: `credit_cards.biller_id` is indexed but not `unique`, because the single seeded biller named `Davao Bank Card (simulation)` is shared by both demo customers (`billers.name` is itself unique). One card per owner is enforced by the `user_id` primary key. The merchant ledger trigger also requires the audited `card_merchant_payment_started` intent, so a bare `transfer` to a merchant settlement account cannot bypass the card RPC.

NOT VERIFIED: applying the migration to hosted Supabase, running `npm run seed` there, all live suites, Playwright, Maestro, device/VoiceOver, Apple Wallet UI stage and Security reviewer sign-off — owner/captain tasks.

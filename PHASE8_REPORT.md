# PHASE8_REPORT — Stage 8.5B operations dashboard

## Scope and commits

Worktree: `/Users/ronalbert/Personal Projects/davao-bank-ops-ui`
Branch: `phase-8.5-ops-ui`
Base: `54b1e11 Phase 8 · Merge — 8.5A backend`

```text
(this commit) Phase 8 · Stage 8.5B — Operations dashboard screens
06a3d6e Phase 8 · Fix — Format 8.5A backend spec
9deb533 Phase 8 · Fix — Sentence-case fallback in security event titles
faad42f Phase 7 · Fix — Activity test mock for useRoute
54b1e11 Phase 8 · Merge — 8.5A backend
```

The three fix commits are separate because they were outside the Stage 8.5B UI task but were required for the check suite to pass. Each was noted in `docs/agents/STATUS.md`.

## What was implemented

- Replaced the old admin home page with one hero (`Total volume`) plus four distinct metric cards (`Total transactions`, `Accounts`, `Customers`, `Open cases`). No duplicate stat tiles remain.
- Added today / 7 days / 30 days / custom date ranges and an optional previous-period comparison. Previous-period buckets are aligned by position in the ordered series, and comparison copy never invents a value while the previous RPC is loading or after it fails.
- Added six Recharts client components: volume over time, in vs out, volume by category, status mix, balance distribution, and customer/account growth. Every chart has SVG `<title>`/`<desc>`, a visible text table, a shape-matching skeleton, and distinct empty/error/Try again states. Colour is never the only encoding; labels and dash/stroke patterns carry the same information. Animations respect `prefers-reduced-motion`.
- Added a live feed over sanitized `staff_activity_events` INSERTs with a snapshot/reconnect refresh from `admin_ops_live_feed`, dedupe by event id, ten newest rows, a link to `/transactions`, masked accounts (`•• 1234`), `aria-live="polite"`, and connecting/connected/reconnecting/offline/AAL2-denied states. New-row animation is disabled under reduced motion.
- Added a security panel backed by `admin_ops_summary` (open cases, locked/frozen accounts, failed scheduled payments, new devices) and recent admin activity from `audit_logs`. Failed sign-ins are rendered as `Not available` with `no reliable source`; the UI never fakes `0`.
- Reused the existing aal2 admin guard. AAL2-denied states are shown by both the live feed and the security panel. The merged backend fix `f442269` enforces `assert_admin_aal2()` in all four analytics RPCs and `aal2` in the staff feed RLS policy.
- Every widget reads a real 8.5A RPC/table. Missing data produces an empty state, not invented numbers.
- Added Jest/RTL coverage for helpers, all chart states, live-feed states, security/activity states, and dashboard integration (49 admin tests).
- Added `e2e/admin/operations-dashboard.spec.ts` with dashboard checks explicitly skipped and labelled `NOT VERIFIED — needs owner sign-in`. It reads no `.env` and never automates MFA.
- Added pinned `recharts@3.11.1` to the `admin` workspace only. No other `package.json` dependency changed.

## Real command output

Dependency installation:

```text
added 1463 packages, and audited 1467 packages in 52s
added 37 packages, and audited 1504 packages in 12s
```

Manifest diff (only line added):

```diff
+    "recharts": "3.11.1",
```

Final local checks, all run from the worktree root after the last code change:

```text
typecheck_exit=0
lint_exit=0
format_exit=0
jest_exit=0
build_admin_exit=0
check_copy_exit=0

✖ 61 problems (0 errors, 61 warnings)
All matched files use Prettier code style!
Test Suites: 61 passed, 61 total
Tests:       500 passed, 500 total
Snapshots:   0 total
Time:        11.691 s
Ran all test suites in 3 projects.
PASS Copy audit clean across 167 files (15 justified allowlist match(es)).
✓ Compiled successfully in 828ms
```

`npm run typecheck` completed `tsc --noEmit` for `admin`, `mobile`, and `@davao-bank/shared` with exit 0. `npm run build:admin` completed with exit 0 and the expected route table (`/` is dynamic).

Admin-only unit suite during development:

```text
Test Suites: 7 passed, 7 total
Tests:       49 passed, 49 total
```

The pre-existing tracked `node_modules` symlinks were restored after that earlier check run, but the captain then had the worktree environment rebuilt with real `node_modules` directories. Those directories remain in place for reproducible checks; the tracked symlink deletions are unstaged.

## Post-merge re-verification (aal2 backend fix)

`f442269 Phase 8 · Fix — 8.5A require aal2 for analytics and feed` was merged with `--no-ff`. The only conflict was in `docs/agents/STATUS.md`; both branches' content was preserved. The migration is byte-identical to `f442269` (`cmp` exit 0), sha `1abd763dbc4f7a470e2c8cfa0ce18742648b7adb`, and contains `perform public.assert_admin_aal2()` in all four analytics RPCs plus `auth.jwt()->>'aal' = 'aal2'` in the staff feed RLS policy.

```text
typecheck_exit=0
jest_exit=0
build_admin_exit=0
lint_exit=0
format_exit=0
check_copy_exit=0

> admin@0.1.0 typecheck
> tsc --noEmit

> mobile@0.1.0 typecheck
> tsc --noEmit

> @davao-bank/shared@0.1.0 typecheck
> tsc --noEmit

Test Suites: 61 passed, 61 total
Tests:       500 passed, 500 total
Snapshots:   0 total
Time:        15.321 s, estimated 27 s
Ran all test suites in 3 projects.
✓ Compiled successfully in 1445ms
PASS Copy audit clean across 167 files (15 justified allowlist match(es)).
```

## NOT VERIFIED

- Playwright: `e2e/admin/operations-dashboard.spec.ts` is skipped until the owner supplies a real aal2 staff storage state. No owner sign-in, MFA automation, or `.env` read was performed.
- Hosted Supabase: captain reports the fixed migration is applied to hosted. Codex used no hosted query or write; RPC/table shapes were verified against `supabase/migrations/20261128000000_phase8_5_ops_backend.sql` and mocked in Jest.
- Device, Maestro, VoiceOver and live browser rendering: NOT VERIFIED — captain/owner to run.
- No push and no PR were made.

## Stage 8L — Bantay protective freeze mobile UI

Implemented UI-only reuse of the existing 8D lock. No migration, RPC, server rule, `_transfer_core`, ledger, idempotency key or scheduled-payment runner was changed. State comes from `get_security_settings().locked` plus a real `protective_lock` event in `get_security_timeline()`; failed reads show nothing protective. Existing `request_unlock` / `complete_unlock` remain the only customer path, and Outgoing-money screens navigate to the Bantay security center from the frozen state.

Surfaces wired:

- Home: red freeze banner below the balance card, polite live region, `Confirm it's me` → `BantaySecurity`, six disabled money tiles labelled `Bantay froze your account — check Bantay`, and protective Kada state.
- Floating Kada: protective tap bubble with the brief opener, the mandatory anti-scam sentence and the spec's short title-led body; existing `Open Bantay` and long-press actions retained.
- Inbox: `bantay_protective_lock` title, red shield icon and tap → `BantaySecurity`.
- Frozen money gate before any account read or money RPC on Send money, Pay bills, Cash out, QR/request, Scheduled payments and Payment requests; `useFeatureAccounts(enabled)` short-circuits account reads.
- Realtime: `useBantayRealtime` accepts a table/channel/filter override; the protective hook subscribes to both `security_events` and `notifications` INSERTs and refetches on relevant rows.
- Bantay security center: protective hero/status copy while the lock is active, retaining the original ordinary-lock copy and unlock flow.

Real local check output (repo root):

```text
> npm run typecheck
> npm run typecheck --workspaces --if-present
> admin@0.1.0 typecheck
> tsc --noEmit
> mobile@1.0.0 typecheck
> tsc --noEmit
> @davao-bank/shared@0.1.0 typecheck
> tsc --noEmit
exit 0

> npm run lint
✖ 62 problems (0 errors, 62 warnings)

> npm run format:check
Checking formatting...
All matched files use Prettier code style!

> npx jest
Test Suites: 74 passed, 74 total
Tests:       628 passed, 628 total
Snapshots:   0 total
Time:        19.247 s
Ran all test suites in 3 projects.

> npm run test:db
469 passed, 0 failed

> npm run check:copy
PASS Copy audit clean across 188 files (18 justified allowlist match(es)).
```

Copy decision to review: the writer brief's exact strings were used for the Home title (`Account frozen by Bantay`), the Home button (`Confirm it's me`) and the Kada opener (`I froze your account to keep your money safe. Tap to see what happened.`). To honour the approved spec, the mandatory `Davao Bank will never ask you to move your money.` sentence is present on every protective surface, the spec's `Bantay froze your account` title appears in the Home banner and Bantay status card, and the spec's short Kada body is shown as a second line. The spec's alternate Home/primary-button wording (`Open Bantay`) was not substituted because the brief explicitly names `Confirm it's me`; captain to confirm if strict spec wording is required.

### NOT VERIFIED — Stage 8L

- Device, Maestro, VoiceOver and hosted Realtime behaviour: NOT VERIFIED — captain/owner.
- Live drill/protective-lock deployment: NOT VERIFIED — no hosted writes, no `.env` read, no drill scripts run.
- No push and no PR were made.

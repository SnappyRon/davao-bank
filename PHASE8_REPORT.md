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

## Stage 8K — Bantay drill console (handoff)

Commits: `80214f5` (stage) and `e0e96d2` (contract-gap fix, includes this report).

Delivered `scripts/drill-bantay.mjs`, `scripts/lib/drill-core.ts`, `scripts/lib/drill-page.ts`, `scripts/__tests__/drill-core.test.ts`, `npm run drill`, and a `scripts` Jest project. The console binds only `127.0.0.1:4400`, serves one inline page with CSP/no-sniff/no-referrer headers, and exposes `/api/state`, SSE `/api/events` and validated `/api/command`. Startup and command guards accept only `test-customer-a@davaobank.ph` / `test-customer-b@davaobank.ph`. Cleanup uses `TEST_ADMIN` + aal2 `admin_unlock_user` and `admin_update_security_case`; temporary factors are removed through `withStepUpCleanup`. No direct lock-row write, money-engine change, migration change, hosted run, push or `.env` read.

Real checks from repo root:

```
npm run typecheck   → exit 0 (admin, mobile, shared)
npm run lint        → ✖ 62 problems (0 errors, 62 warnings)
npm run format:check → All matched files use Prettier code style!
npx jest            → Test Suites: 74 passed, 74 total; Tests: 641 passed, 641 total
npm run test:db     → 469 passed, 0 failed
npm run check:copy  → PASS Copy audit clean across 185 files (17 justified allowlist match(es)).
```

Local smoke (no hosted): `/api/state` returned `statusLabel: "Idle"`; page contained one `font-variant: small-caps` rule and no secret strings; a wrong-target start returned HTTP 403 with `NOT VERIFIED — drill target must be test-customer-a@davaobank.ph or test-customer-b@davaobank.ph`.

NOT VERIFIED — live drill, hosted deployment/migration, Stop-abort timing under real network, Reset unlock, simulator/admin/console side-by-side and screen-reader passes were intentionally not run (captain/owner scope).

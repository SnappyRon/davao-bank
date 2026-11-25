# Phase 7 · Stage 7B.8 — Copy audit script (handoff notes)

Taken over by be-opencode from tool-copy-check (that agent ran out of credits mid-task). All five of its uncommitted files were kept as-is and finished; no work was redone or reverted.

## What was already done (uncommitted on takeover)

- `scripts/check-copy.mjs` — dependency-free Node/TypeScript-AST scanner for `apps/mobile/src` and `apps/admin/src`. Detects `.toUpperCase()`/`.toLocaleUpperCase()` on copy, `PHP `, `!` in user-facing strings, and raw UUIDs (literal, interpolated, concatenated, JSX child or copy prop). Exports `scanSource`, `scanWorkspace`, `validateAllowlist`, `runCli`; supports `--root` and `--allowlist`; prints `PASS`/`FAIL` lines and exits 1 on violations.
- `scripts/check-copy.allow.json` — 15 justified exceptions, each with a reason (section eyebrow, 2-letter avatar monograms, ISO `USD/PHP` label, share-receipt plain-text UUID, staff detail drawers).
- `packages/shared/src/__tests__/check_copy.test.ts` — 7 scanner tests using fixture strings (clean copy, both uppercase variants, `PHP `, exclamation marks, literal + dynamic UUIDs, allowlist validation, CLI pass/fail).
- `package.json` — added `check:copy` script.
- `.github/workflows/ci.yml` — added a Typecheck → Lint → Format Check → **Copy Audit** → Unit Tests step.

## What I finished

- Ran every check named in the brief from the worktree root.
- Fixed the one failure in scope: `npx prettier --write packages/shared/src/__tests__/check_copy.test.ts`, then re-ran `npm run format:check` (clean).
- Did not edit any app copy: that is Stage 7B.7's task. The current violations are below.
- Left the untracked `node_modules` symlinks alone as instructed; they are not staged.

## Real check output

`npm run typecheck` — exit 0, all three workspaces clean (admin, mobile, shared).

`npm run lint` — exit 0:

```
✖ 63 problems (0 errors, 63 warnings)
```

(All 63 are pre-existing `@typescript-eslint/no-explicit-any` / unused-var warnings outside this task.)

`npm run format:check` (after the one test-file fix) — exit 0:

```
Checking formatting...
All matched files use Prettier code style!
```

`npm run test:unit` — exit 0:

```
Test Suites: 39 passed, 39 total
Tests:       341 passed, 341 total
Snapshots:   0 total
Time:        20.717 s
Ran all test suites in 3 projects.
```

Targeted scanner suite (native ESM runner) — exit 0:

```
Test Suites: 1 passed, 1 total
Tests:       7 passed, 7 total
```

`npm run test:db` — exit 0:

```
118 passed, 0 failed
```

`npm run check:copy` — exit 1 **by design** while 7B.7 copy is outstanding (the scanner is working, not broken):

```
FAIL apps/mobile/src/screens/ScheduledPaymentsScreen.tsx:195:26 [uppercase-copy] Avoid .toUpperCase() on UI copy; use sentence case — selectedSchedule.status.toUpperCase()
FAIL apps/mobile/src/screens/ScheduledPaymentsScreen.tsx:315:31 [raw-uuid] UUID rendered in JSX without formatReferenceId — run.transaction_id.slice(0, 8)
FAIL apps/mobile/src/screens/SignUpScreen.tsx:96:15 [php-currency] Use '₱' instead of 'PHP ' in user-facing copy — Join Davao Bank to receive a simulated PHP account.
FAIL apps/mobile/src/screens/qr/MyQRTab.tsx:76:20 [uppercase-copy] Avoid .toUpperCase() on UI copy; use sentence case — acc.type.toUpperCase()
FAIL apps/admin/src/app/accounts/AccountsClient.tsx:162:16 [raw-uuid] UUID rendered in JSX without formatReferenceId — owner?.email || a.user_id.substring(0, 8)
FAIL apps/admin/src/app/accounts/AccountsClient.tsx:393:20 [uppercase-copy] Avoid .toUpperCase() on UI copy; use sentence case — adjustDirection.toUpperCase()
FAIL apps/admin/src/app/audit/AuditClient.tsx:69:53 [raw-uuid] UUID rendered in JSX without formatReferenceId — log.actor_id.substring(0, 8)
FAIL apps/admin/src/app/audit/AuditClient.tsx:82:16 [raw-uuid] UUID rendered in JSX without formatReferenceId — log.entity_id.substring(0, 8)
FAIL apps/admin/src/app/schedules/ScheduleRunsDrawer.tsx:134:60 [raw-uuid] UUID rendered in JSX without formatReferenceId — run.transaction_id
FAIL apps/admin/src/app/transactions/TransactionsClient.tsx:212:44 [raw-uuid] UUID rendered in JSX without formatReferenceId — r.id.slice(0, 8)
FAIL apps/admin/src/app/transactions/TransactionsClient.tsx:446:69 [raw-uuid] UUID interpolated without formatReferenceId — `Are you sure you want to reverse transfer ${reversalTx.id}?`
FAIL apps/admin/src/app/users/UsersClient.tsx:122:43 [raw-uuid] UUID rendered in JSX without formatReferenceId — u.id.substring(0, 8)

Copy audit failed: 12 violation(s) across 141 files (15 justified allowlist match(es)).
```

## For Stage 7B.7 (wording pass)

The 12 lines above are the violations the wording pass must clear; none was added to the allowlist because none has an approved spec justification. The script will pass CI as soon as they are fixed. `formatReferenceId` is the approved formatter for UUIDs.

## NOT VERIFIED

- NOT VERIFIED — `npm run check:copy` cannot pass until Stage 7B.7 clears the 12 app-copy violations listed above; per the brief I did not edit app copy.
- NOT VERIFIED — GitHub Actions was not run locally; the CI workflow edit was inspected only.
- NOT VERIFIED — no hosted Supabase access was used or needed (local PGlite only).

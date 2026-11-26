# Phase 8 · Integration Notes (`phase-8-integration`)

- **Branch:** `phase-8-integration`
- **Worktree:** `/Users/ronalbert/Personal Projects/davao-bank-p8-integration`
- **Base:** `phase-8-bantay-risk` at `0d65291` (`1eb4d13` Stage 8A + `182505a` Stage 8D + `0d65291` 8D review fix)
- **Ratified contract reference:** `Phase-8-Bantay-AI-Prompt.md` (`802c8f5`: `risky_payment_warning` kind and `prepare_risk_challenge`)

## Merge summary

| Order | Merge commit | Merged branch                                                | Branch tip | Conflicts                                              | Result lines                                                                                                                                        |
| ----- | ------------ | ------------------------------------------------------------ | ---------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base  | `0d65291`    | `phase-8-bantay-risk` (8A + 8D + fix)                        | `0d65291`  | —                                                      | Starting base                                                                                                                                       |
| 1     | `767155a`    | `phase-8-bantay-edge` (8B + 8E + fixes `27d3eb0`, `b37d1fd`) | `b37d1fd`  | `scripts/review/pglite-behavior.mjs`                   | `typecheck` 0 · `lint` 0 errors (63 warnings) · `jest` passed · `test:db` 277 passed, 0 failed                                                      |
| 2     | `247bec4`    | `phase-8-bantay-ui` (8C + 8F)                                | `b562000`  | None                                                   | `typecheck` 0 · `lint` 0 errors (67 warnings) · `jest` 47 suites / 394 tests passed · `test:db` 277 passed, 0 failed                                |
| 3     | `5119f10`    | `phase-8-admin-cases` (8G)                                   | `4e0bd8e`  | None                                                   | `typecheck` 0 · `lint` 0 errors (67 warnings) · `jest` 48 suites / 397 tests passed · `test:db` 277 passed, 0 failed                                |
| 4     | `0d29020`    | `phase-8-bantay-tests` (8H)                                  | `2174d5f`  | None (`.github/workflows/ci.yml` path aligned with 8E) | `typecheck` 0 · `lint` 0 errors (67 warnings) · `jest` 48 suites / 397 tests passed (8E gate: 4 suites / 25 tests) · `test:db` 277 passed, 0 failed |

## Conflicts, cross-branch seams, and how each was resolved

### 1. Merge 1 (`767155a`) — `phase-8-bantay-edge` (`b37d1fd`)

- **Conflict:** `scripts/review/pglite-behavior.mjs` had a single add/add conflict at the end of the Phase 7B.9 block because `phase-8-bantay-risk` added `runPhase8BantayTests` (8A) + `runPhase8BantayRiskTests` (8D) while `phase-8-bantay-edge` added inline 8B (`saved_billers`, `push_tokens`, `get_bill_reminders`, `get_monthly_summary`) + 8E (`signin_signal_attempts`, `record_signin_failure_signal`, `write_signin_failure_event`) checks in the same region.
- **Resolution:** Kept both imports at the top of `scripts/review/pglite-behavior.mjs` and kept every check from 8A, 8B, 8D, and 8E untouched. Placed the 8B + 8E block immediately before `runPhase8BantayTests` and `runPhase8BantayRiskTests` (which run right before `// ---- Reconciliation`).
  - _Why ordering mattered:_ 8A/8D insert backdated prior-month transactions (`50000` centavos) to exercise daily-limit and 90-day baseline windows, whereas 8B's inline `ledgerB` query sums `ledger_entries` across all time without a current-month `created_at` filter (`get_monthly_summary($1::date)` correctly filters to the current month). Running 8B + 8E first (neither writes to `transactions` or `ledger_entries`) keeps both 8B's baseline ledger comparison and all 8A/8D checks intact (`277 passed, 0 failed`).

### 2. Merge 2 (`247bec4`) — `phase-8-bantay-ui` (`b562000`)

- **Conflicts:** None (`Automatic merge went well`).
- **Worktree `node_modules` isolation note:** Around 00:49 AEDT during Merge 2 checks, `/Users/ronalbert/Personal Projects/davao-bank/node_modules` and `apps/mobile/node_modules` became empty directories (likely another parallel agent ran `npm ci` through a symlink). Without touching `/Users/ronalbert/Personal Projects/davao-bank`, we removed only `davao-bank-p8-integration`'s three `node_modules` symlinks and ran `npm ci --prefer-offline` inside `davao-bank-p8-integration` so `npm run test:unit` (`jest`) executes directly against `<rootDir>` = `/Users/ronalbert/Personal Projects/davao-bank-p8-integration`.
- **Upstream finding flagged for captain / 8F review (kept untouched per `money/step-up handlers byte-identical` rule):**
  - `apps/mobile/src/screens/TransferScreen.tsx:380-441` (from commit `b562000` on `phase-8-bantay-ui`):
    1. Calls `const { showConfirmation, confirmSheet } = useConfirmSheet();` conditionally inside `if (isConfirmationRequired(error))` inside async `handleConfirmTransfer` (violates React Rules of Hooks at runtime when `'Confirmation required'` triggers, and `confirmSheet` is never rendered; also produces ESLint unused-var warnings at lines 389 and 431).
    2. Modifies `handleConfirmTransfer` directly rather than wrapping at the call site.
    3. Has unformatted indentation at lines 382–386, causing `npm run format:check` to warn on `apps/mobile/src/screens/TransferScreen.tsx` (every other file in the repo passes Prettier).
  - Per `AGENTS.md` and the integration brief (`money/step-up handlers byte-identical unless the brief allows`), `TransferScreen.tsx` was left byte-identical to `b562000` for captain routing.

### 3. Merge 3 (`5119f10`) — `phase-8-admin-cases` (`4e0bd8e`)

- **Conflicts:** None (`Automatic merge went well`).

### 4. Merge 4 (`0d29020`) — `phase-8-bantay-tests` (`2174d5f`)

- **Conflicts:** None (`Automatic merge went well`).
- **Cross-branch CI seam resolved (`.github/workflows/ci.yml:44-50`):**
  - Stage 8H (`2174d5f`, branched from `1eb4d13` before 8E existed) added the named CI step `Bantay shared Jest tests (Stage 8E)` with `if: hashFiles('packages/shared/src/__tests__/bantay/**/*.test.ts') != ''` and `run: npx jest --selectProjects shared packages/shared/src/__tests__/bantay --runInBand`.
  - Stage 8E (`316f718`) actually placed those 4 files at `packages/shared/src/__tests__/bantay_*.test.ts` (`bantay_facts.test.ts`, `bantay_gemini.test.ts`, `bantay_signin.test.ts`, `bantay_templates.test.ts`), and in Jest 30 `--selectProjects` consumes subsequent positional tokens unless terminated by another flag (`--runInBand`) before the path pattern.
  - Updated `.github/workflows/ci.yml` lines 44–50 to:
    - `if: hashFiles('packages/shared/src/__tests__/bantay_*.test.ts') != ''`
    - `run: npx jest --selectProjects shared --runInBand packages/shared/src/__tests__/bantay_`
  - Verified locally: runs the exact 4 Stage 8E suites (`25 passed, 25 total`).

## Migration order and byte-identity verification

All Phase 8 migrations were kept byte-identical (`git diff` against `0d65291` and `b37d1fd` = empty) and sit in strict chronological order after `20261111000000_phase7_notifications.sql`:

1. `supabase/migrations/20261126000000_phase8_bantay.sql` (Stage 8A)
2. `supabase/migrations/20261126010000_phase8_bills_summary.sql` (Stage 8B)
3. `supabase/migrations/20261127000000_phase8_bantay_risk.sql` (Stage 8D + `0d65291` fix)
4. `supabase/migrations/20261127010001_phase8_bantay_signin_signal.sql` (Stage 8E)

## Real check output on integrated branch (`0d29020`)

```text
$ git -C "/Users/ronalbert/Personal Projects/davao-bank-p8-integration" grep -nE '^(<<<<<<<|>>>>>>>|=======)$'
(exit 1 — no output)

$ npm --prefix "/Users/ronalbert/Personal Projects/davao-bank-p8-integration" run typecheck
> davao-bank@0.1.0 typecheck
> npm run typecheck --workspaces --if-present
> admin@0.1.0 typecheck
> tsc --noEmit
> mobile@1.0.0 typecheck
> tsc --noEmit
> @davao-bank/shared@0.1.0 typecheck
> tsc --noEmit
(exit 0)

$ npm --prefix "/Users/ronalbert/Personal Projects/davao-bank-p8-integration" run lint
> davao-bank@0.1.0 lint
> eslint .
✖ 67 problems (0 errors, 67 warnings)
(exit 0)

$ npm --prefix "/Users/ronalbert/Personal Projects/davao-bank-p8-integration" run test:unit
> davao-bank@0.1.0 test:unit
> jest
Test Suites: 48 passed, 48 total
Tests:       397 passed, 397 total
Snapshots:   0 total
Time:        9.011 s, estimated 15 s
Ran all test suites in 3 projects.
(exit 0)

$ npm --prefix "/Users/ronalbert/Personal Projects/davao-bank-p8-integration" run test:unit -- --selectProjects shared --runInBand packages/shared/src/__tests__/bantay_
Running one project: shared
PASS shared packages/shared/src/__tests__/bantay_facts.test.ts
PASS shared packages/shared/src/__tests__/bantay_signin.test.ts
PASS shared packages/shared/src/__tests__/bantay_templates.test.ts
PASS shared packages/shared/src/__tests__/bantay_gemini.test.ts
Test Suites: 4 passed, 4 total
Tests:       25 passed, 25 total
(exit 0)

$ npm --prefix "/Users/ronalbert/Personal Projects/davao-bank-p8-integration" run test:db
> davao-bank@0.1.0 test:db
> node scripts/review/pglite-behavior.mjs
...
✓ Reconciliation: every transfer/reversal/bill nets to zero — {"net":"20744801","unbalanced":0,"mismatched":0}
✓ Reconciliation: account_balances == ledger sum for every account — {"net":"20744801","unbalanced":0,"mismatched":0}
277 passed, 0 failed
(exit 0)
```

## NOT VERIFIED

- **Phase 7 merge (`phase-7-integration`):** NOT VERIFIED — intentionally not merged yet per captain brief ("Do NOT merge Phase 7 yet — the captain will say when phase-7-integration is ready").
- **Hosted live suites (`npm run test:bantay`, `test:rls`, `test:money`, `test:admin`, `test:extras`, `test:schedules`, `test:qr`, `test:fx`) and Edge Function deployment (`bantay-explain`, `signin-signal`):** NOT VERIFIED — hosted Supabase writes/pushes are prohibited until captain review and migration deployment, and `.env` was not read.
- **Playwright admin specs (`e2e/admin/security-cases.spec.ts`):** NOT VERIFIED — requires hosted Phase 8 migrations and owner admin sign-in / `.env`.
- **Maestro mobile flow (`e2e/mobile/bantay-lock-and-challenge.yaml`) and simulator/device visual check:** NOT VERIFIED — no running Expo Go / simulator session in this integration run.
- **Repo-wide `npm run format:check`:** NOT VERIFIED as all-green — fails solely on `apps/mobile/src/screens/TransferScreen.tsx` from `b562000` (`phase-8-bantay-ui`), left untouched per the `money/step-up handlers byte-identical` rule. All integration-touched files (`.github/workflows/ci.yml`, `scripts/review/pglite-behavior.mjs`, `docs/agents/notes/phase-8-integration.md`) pass Prettier.

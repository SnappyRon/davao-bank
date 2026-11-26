# Notes — phase-7-carryovers (Stage 7B.10 carry-overs from device checks)

Taken over by fe-cline-2 from fe-device-fixes.

## What was already done (fe-device-fixes, uncommitted on this branch — kept, not redone)

8 modified files + 3 new test files, all under apps/mobile/src:

- `apps/mobile/src/screens/ScheduledPaymentsScreen.tsx` — active schedules sort first; completed one-time schedules show a neutral "Completed" badge and "Paid <date>" instead of "Next: <past date>"; "Next" hidden for completed.
- `apps/mobile/src/__tests__/scheduled_payments_screen.test.tsx` — test for Completed/Paid ordering and detail view.
- `apps/mobile/src/screens/TransferScreen.tsx` — uncertain-state footer: "Check status" (re-runs `executeServerTransfer` → `recoverTransfer` with the same idempotency key, no new key, no new money) and "Done" (toast + `navigation.goBack()`); `isProcessing` narrowed to `loading`; discard guard excludes `uncertain`.
- `apps/mobile/src/__tests__/transfer_screen.test.tsx` — two new tests: "Done" closes sheet with Activity toast; "Check status" reuses the same idempotency key.
- `apps/mobile/src/screens/LockScreen.tsx` — biometrics-first lock screen: logo, "Davao Bank is locked", one primary unlock button ("Unlock with Face ID"/"Unlock"), password field only after "Use password", "Sign out" secondary.
- `apps/mobile/src/__tests__/lock_screen.test.tsx` — lock screen behaviour tests.
- `apps/mobile/src/screens/TwoStepSetupScreen.tsx` — step headings "Step 1 of 2: add to your app" / "Step 2 of 2: enter the code" added (already a `FeatureScreen`).
- `apps/mobile/src/components/TotpPromptOverlay.tsx` — rewritten as a card prompt titled "Enter your authenticator code", auto-submits on 6 digits, Cancel/Authorize buttons, `PrivacyOverlay` retained.
- `apps/mobile/src/__tests__/totp_prompt.test.tsx` — title + auto-submit test.
- New: `apps/mobile/src/__tests__/step_up_setup_link.test.tsx` — "Set up now" navigates directly to `TwoStepSetup`.
- New: `apps/mobile/src/__tests__/two_step_setup_screen.test.tsx` — setup flow through Step 1 and Step 2.

## What I finished

- Fixed typecheck breakage in `transfer_screen.test.tsx`: both `executeTransfer` mock fixtures now include the required `MoneyOperationResult` fields (`type`, `reference`, `idempotency_key`, `created_at`).
- Ran `npx prettier --write` on exactly the 6 task files prettier flagged (`scheduled_payments_screen.test.tsx`, `transfer_screen.test.tsx`, `LockScreen.tsx`, `ScheduledPaymentsScreen.tsx`, `TransferScreen.tsx`, `lock_screen.test.tsx`); re-checked clean.
- Ran the full check suite from the worktree root — all pass (see "Real check output" below).
- Updated `docs/agents/STATUS.md` (Now block, 7B.10 checklist ticked, open-items list, log line) and `PHASE7_REPORT.md` (new Stage 7B.10 section with per-item changes, handler comparison, checks, verification limits).
- Committed: `Phase 7 · Stage 7B.10 — Carry-overs from device checks` on `phase-7-carryovers`.

## What was skipped (already done in earlier stages — verified present, not re-done)

- Large text wrapping: `AmountText` already fits at `minimumFontScale 0.7` (7B.6).
- Raw biller regex hint: PayBills already shows "e.g. 10 digits, on your bill" (7B.4).
- Optimistic App lock switch: already in `ProfileScreen`.

## Real check output (worktree root, after commit content was final)

```text
npx prettier --check <task files>
Checking formatting...
All matched files use Prettier code style!

npm run typecheck — exit 0 (mobile + shared tsc --noEmit clean)

npm run lint — ✖ 63 problems (0 errors, 63 warnings) — warnings are pre-existing in unrelated files

npm run test:unit — Test Suites: 41 passed, 41 total; Tests: 344 passed, 344 total
```

Whole-repo `format:check` still exits 1 solely due to untracked `ONBOARDING.md` (not this task's file; left untouched).

## NOT VERIFIED

- Before/after device screenshots for every fixed screen (spec §10) — no device/simulator available to this agent; captain/owner at the 7B gate.
- On-device behaviour: large text at accessibility XL, privacy overlay flash in the app switcher, lock → unlock flow, "Set up now" → TwoStepSetup navigation.
- `customer1`'s authenticator was never touched or read. No hosted Supabase writes, no push, no merge.

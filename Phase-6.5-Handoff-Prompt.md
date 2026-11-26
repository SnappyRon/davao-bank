# Davao Bank — Phase 6.5 Handoff Prompt (finish Stage E)

**First read `AGENTS.md` and `docs/agents/STATUS.md`, and follow their handoff protocol: after each completed step, update `STATUS.md` and commit it, staging by name.**

You are taking over Phase 6.5 from another agent that ran out of credits. Read `Phase-6.5-Strong-Auth-Prompt.md` first. It is the full spec, and all of its rules still apply, especially the **Do NOT** list. This handoff only tells you where the work stopped.

Branch: `phase-6-5-strong-auth` (already checked out). Do not push. Do not create a new branch.

## Already done (committed, do not redo)

| Commit    | Stage                                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------- |
| `05f7f34` | A — Server-enforced step-up. Migration `20261110000000_phase6_5_step_up.sql`, errors.ts, PGlite tests, config.toml. |
| `b4ca28e` | B — Mobile authenticator setup and the code prompt. Includes `totp_prompt.test.tsx`.                                |
| `d419a19` | C — Biometric app lock. Includes `app_lock.test.tsx`.                                                               |
| `80b5699` | D — Admin console two-step sign-in (`/mfa/setup`, `/mfa/verify`, middleware).                                       |

## In progress (uncommitted, written by the previous agent; review it, then keep and finish it)

- `scripts/lib/step-up.ts` is the new shared helper:
  - `requireStepUpMigration`, `temporaryStepUp`, `signInWithStepUp`, `withStepUpCleanup`;
  - `assertAal1TransferRejected`, `assertStaleStepUpRejected`.
- `otpauth@9.6.0` was added as an exact devDependency (`package.json`, `package-lock.json`).
- All 7 live suites (`scripts/test-*.ts`) were switched to `signInWithStepUp` and wrapped in `withStepUpCleanup`, and `process.exit(1)` was replaced with thrown errors so cleanup always runs.

**Leave these alone:** `docs/UAT_CHECKLIST.md`, `docs/uat-evidence/`, `Phase-6.5-Strong-Auth-Prompt.md` and this file belong to the reviewer. Never stage them.

## What is left: Stage E

1. **Review the live-suite edits** with `git diff scripts/`. Check:
   - every suite calls `requireStepUpMigration` before doing anything else;
   - every sign-in that later moves money uses `signInWithStepUp`;
   - `withStepUpCleanup` wraps the whole run;
   - the process exit code is non-zero on any failure (`process.exitCode = 1`).

   Then add the explicit negative cases from the spec:
   - `assertAal1TransferRejected` (a plain password session, no step-up);
   - `assertStaleStepUpRejected`.

   The stale check waits more than 5 minutes, so put it in **`test:money` only**. Don't add it to the other suites.

2. **Playwright** (`e2e/admin/admin-flow.spec.ts` and the other admin specs). The admin now lands on `/mfa/setup` or `/mfa/verify` after password sign-in.
   - Build a small Playwright helper. Read the setup key shown on `/mfa/setup` (the visible text key, never the QR), generate codes with `otpauth`, and complete setup or verify.
   - **At the end of each test, remove the temporary factor** so the admin account ends with exactly the factors it started with. Use the Supabase admin API or a signed-in client in `afterAll`, inside `try/finally`.
   - If the admin account already has a verified factor before the test, stop with `NOT VERIFIED — admin account has an existing authenticator` rather than touching it. This matches the behaviour of `step-up.ts`.
   - Add a test that an aal1 admin session (password only) opening `/` is redirected to `/mfa/verify` or `/mfa/setup`.

3. **The Phase 6.5 migration is NOT on the hosted project yet.** That's intentional: the reviewer applies it after review. **Do not run `supabase db push`, `db query` writes or any SQL against the hosted project.**
   - Live suites and Playwright **will** stop with the `NOT VERIFIED — Phase 6.5 migration is not deployed` message.
   - Run each one once anyway and confirm:
     - it stops cleanly with that message and a non-zero exit;
     - no money moved;
     - no MFA factor was left on any demo account.
   - Record the exact output in the report as "pending reviewer deployment". Do not fake a pass, and do not weaken `requireStepUpMigration` to make the suites run.

4. **Unit tests.** `totp_prompt.test.tsx` and `app_lock.test.tsx` exist. Check they cover every point in spec Stage E item 4, and add whatever is missing:
   - the prompt renders inside the sheet;
   - Cancel never authorizes;
   - the 2-second safety net fails closed;
   - a `STEP_UP_EXPIRED` retry happens at most once;
   - the lock shows after more than 2 minutes in the background and not after less.

   Add an admin unit test for the middleware's aal1 → `/mfa/verify` redirect and for server actions refusing aal1, if those tests don't exist yet.

5. **Docs:**
   - `docs/SECURITY_REVIEW.md`: add the "Strong authentication" section as described in the spec.
   - Also document this known limitation: live tests need demo accounts **without** a real authenticator. Once the presenter enrolls one on `customer1`, `customer2` or `admin`, the live suites stop with NOT VERIFIED for that account. Recommend dedicated test accounts as follow-up work. Don't build them now.
   - Add a user-guide section if a user guide exists.
   - Create `PHASE6_5_REPORT.md` covering:
     - what each stage changed (one short paragraph each);
     - real command outputs;
     - the pending-deployment note;
     - anything you could not verify.

6. **Final checks.** Run all of these and paste the real results into the report:
   - `npm run format:check`
   - `npm run lint`
   - `npm run typecheck`
   - `npm run test:unit`
   - `npm run test:db`

   Then run the 7 live suites. They are expected to stop with NOT VERIFIED (see step 3).

7. **Commit** everything above in one commit titled exactly `Phase 6.5 · Stage E — Tests, docs and report`. Stage files by name. Never use `git add -A` or `git add .`, because the reviewer's files must stay out.

## Do NOT

- Do not print, log or commit any password, TOTP secret or generated code.
- Do not redo or rewrite Stages A–D. If you find a real bug in them, fix it in a **separate** commit titled `Phase 6.5 · Fix — <what>` and explain it in the report.
- Do not change `_transfer_core`, the idempotency logic, the ledger or `run_due_scheduled_payments`.
- Do not apply the migration to the hosted project, change hosted auth settings, or permanently enroll or unenroll factors on demo accounts.
- Do not run `npm audit fix` (with or without `--force`). Do not add packages other than `otpauth`.
- Do not mark any UAT row as passed.

## Finish with

A short reply listing:

- the commit hash or hashes;
- each check's pass/fail count;
- the live-suite and Playwright outputs (expected: NOT VERIFIED, pending deployment);
- any bug you found in Stages A–D.

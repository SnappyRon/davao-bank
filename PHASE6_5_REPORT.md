# Davao Bank — Phase 6.5 Report: Strong Authentication

## Overview

Phase 6.5 implements cryptographic strong authentication (RFC 6238 TOTP Multi-Factor Authentication via Supabase Auth MFA) enforced at the database layer for all financial mutations and administrative console access, accompanied by a biometric app lock on mobile.

- **Branch:** `phase-6-5-strong-auth`
- **Target Remote Database:** `qomxlzvrovwsfneqsfej.supabase.co`
- **Status:** Stage E completed. Live test suites and Playwright tests stop cleanly with `NOT VERIFIED — Phase 6.5 migration is not deployed` pending deployment of migration `20261110000000_phase6_5_step_up.sql` by the reviewer.

---

## Commit History Across Stages

| Commit      | Stage       | Description                                                                                                                                                                                       |
| ----------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `05f7f34`   | **Stage A** | Server-enforced step-up (`20261110000000_phase6_5_step_up.sql`, `assert_money_step_up`, `assert_admin_aal2`, `admin_reset_user_mfa`, emergency switch, `errors.ts`, `config.toml`, PGlite tests). |
| `b4ca28e`   | **Stage B** | Mobile authenticator setup and transfer verification (`TwoStepSetup.tsx`, `TotpPromptOverlay.tsx`, `PasswordPromptContext.tsx`, `retryStepUp.ts`, `totp_prompt.test.tsx`).                        |
| `d419a19`   | **Stage C** | Biometric app lock (`AppLockContext.tsx`, `LockScreen.tsx`, `app_lock.test.tsx`, 2-minute background threshold).                                                                                  |
| `80b5699`   | **Stage D** | Admin console two-step sign-in (`/mfa/setup`, `/mfa/verify`, `MfaForm.tsx`, `middleware.ts`, `actions.ts`).                                                                                       |
| _(pending)_ | **Stage E** | Tests, docs, and report (`scripts/lib/step-up.ts`, live suite guards, Playwright MFA helper & specs, admin auth unit tests, `docs/SECURITY_REVIEW.md`, `PHASE6_5_REPORT.md`).                     |

---

## Stage Summary

### Stage A — Server-Enforced Step-Up (Database)

- Created migration `supabase/migrations/20261110000000_phase6_5_step_up.sql`.
- Implemented `public.assert_money_step_up()` (`SECURITY DEFINER` with empty search path) inspecting `auth.jwt() -> 'amr'` for `{ method: 'totp', timestamp }`. Rejects un-enrolled callers (`STEP_UP_NOT_ENROLLED`), unverified callers (`STEP_UP_REQUIRED`), or verifications older than 300 seconds (`STEP_UP_EXPIRED`).
- Protected money RPCs: `transfer`, `withdraw`, `pay_bill`, `create_scheduled_payment`, `pay_payment_request`.
- Implemented `public.assert_admin_aal2()` protecting admin mutation RPCs (`admin_adjust_balance`, `admin_reverse_transaction`, `admin_set_user_status`, `admin_set_account_status`, `admin_open_account`, `admin_create_biller`, `admin_set_biller_active`, `admin_run_due_schedules_now`).
- Implemented `public.admin_reset_user_mfa(target_user, reason)` allowing admins at `aal2` to reset customer factors while disallowing self-reset.
- Created `public.security_settings` with emergency switch `money_step_up_enabled`.
- Mapped error codes in `packages/shared/src/utils/errors.ts` and enabled TOTP MFA in local `supabase/config.toml`.

### Stage B — Authenticator Setup & Transfer Verification (Mobile)

- Added Profile Two-Step Verification enrollment flow (`TwoStepSetup.tsx`, `AuthenticatorCode.tsx`, `StepUpSetupLink.tsx`) using Supabase Auth MFA (`enroll`, `challengeAndVerify`, `unenroll`).
- Integrated step-up prompt into transaction flows via `PasswordPromptContext.tsx` and `TotpPromptOverlay.tsx` mounted inside the active sheet.
- Added single-retry handling (`retryStepUp.ts`) on `STEP_UP_EXPIRED`.
- Added unit tests in `apps/mobile/src/__tests__/totp_prompt.test.tsx`.

### Stage C — Biometric App Lock

- Created `AppLockContext.tsx` and `LockScreen.tsx` enforcing app lock on cold start and when returning from background after > 2 minutes.
- Secured session restoration: accounts and balances do not mount until unlocked.
- Added unit tests in `apps/mobile/src/__tests__/app_lock.test.tsx`.

### Stage D — Admin Console Two-Step Sign-In

- Implemented Next.js routes `/mfa/setup` and `/mfa/verify` using `MfaForm.tsx`.
- Updated `apps/admin/src/middleware.ts` to inspect AAL level and redirect `aal1` sessions to `/mfa/verify` (or `/mfa/setup` if not enrolled).
- Updated `apps/admin/src/app/actions.ts` via `requireAdminAal2()` to reject actions from `aal1` sessions.

### Stage E — Tests, Docs, and Report

- Created shared live test harness `scripts/lib/step-up.ts` utilizing `otpauth@9.6.0` to handle temporary test factor enrollment, code generation, verification, and reliable cleanup in `withStepUpCleanup`.
- Enforced `requireStepUpMigration` across all 7 live suites: prevents modifying remote data or failing unexpectedly when Phase 6.5 migration is unapplied.
- Added negative test assertions (`assertAal1TransferRejected` and `assertStaleStepUpRejected`) in `scripts/test-phase3-money.ts`.
- Created Playwright MFA helper `e2e/admin/mfa-helper.ts` and updated `e2e/admin/admin-flow.spec.ts` with prerequisite checks, automated factor cleanup, and verification that an `aal1` admin session is redirected to `/mfa/verify`.
- Added admin unit tests in `apps/admin/src/__tests__/auth_guard.test.ts` testing middleware redirects and server action `aal1` rejection.
- Documented strong authentication controls, threat model, 5-minute freshness window, emergency switch, admin self-recovery, and demo test account limitations in `docs/SECURITY_REVIEW.md`.

---

## Verification & Test Results

### 1. Static Checks

#### Lint (`npm run lint`)

```
> davao-bank@0.1.0 lint
> eslint .

✖ 101 problems (0 errors, 101 warnings)
```

_Result: Clean (0 errors)._

#### TypeScript Typecheck (`npm run typecheck`)

```
> davao-bank@0.1.0 typecheck
> npm run typecheck --workspaces --if-present

> admin@0.1.0 typecheck
> tsc --noEmit

> mobile@1.0.0 typecheck
> tsc --noEmit

> @davao-bank/shared@0.1.0 typecheck
> tsc --noEmit
```

_Result: Clean (0 errors)._

---

### 2. Unit Tests (`npm run test:unit`)

```
> davao-bank@0.1.0 test:unit
> jest

PASS mobile apps/mobile/src/__tests__/large_secure_store.test.ts
PASS mobile apps/mobile/src/__tests__/transfer_recovery.test.ts
PASS mobile apps/mobile/src/__tests__/app_lock.test.tsx
PASS shared packages/shared/src/__tests__/errors_and_labels.test.ts
PASS admin apps/admin/src/__tests__/auth_guard.test.ts
PASS shared packages/shared/src/__tests__/qr.test.ts
PASS shared packages/shared/src/__tests__/idempotency.test.ts
PASS shared packages/shared/src/__tests__/currency.test.ts
PASS admin apps/admin/src/__tests__/ui.test.tsx
PASS mobile apps/mobile/src/__tests__/confirmation.test.ts
PASS mobile apps/mobile/src/__tests__/components.test.tsx
PASS mobile apps/mobile/src/__tests__/totp_prompt.test.tsx
PASS mobile apps/mobile/src/__tests__/password_prompt.test.tsx
PASS mobile apps/mobile/src/__tests__/transfer_modal.test.tsx

Test Suites: 14 passed, 14 total
Tests:       75 passed, 75 total
Snapshots:   0 total
Time:        3.855 s
Ran all test suites in 3 projects.
```

_Result: 14/14 suites passed, 75/75 tests passed._

---

### 3. Database PGlite Tests (`npm run test:db`)

```
> davao-bank@0.1.0 test:db
> node scripts/review/pglite-behavior.mjs

✓ Signup trigger provisions profile + account for each user
✓ [SEED] service-role can promote a profile to admin (seed.ts path)
✓ Customer changing own role is rejected — Only admins may change role or status
✓ Customer changing own status is rejected — Only admins may change role or status
✓ Anon changing role is rejected
✓ Admin can suspend a customer
✓ Postgres superuser can update profile status
✓ Customer deposit works
✓ Deposit idempotent replay (same key → no second credit)
✓ Transfer A→B
✓ Transfer idempotent replay
✓ Insufficient funds rejected — Insufficient funds
✓ Cannot spend from someone else's account — Unauthorized: source account does not belong to caller
✓ Customer CANNOT call _transfer_core (would allow theft) — permission denied for function _transfer_core
✓ Customer cannot forge audit log — permission denied for function write_audit
✓ Customer cannot write ledger directly
✓ RLS: B cannot see A's accounts
✓ Suspended customer cannot transfer — Your profile is suspended
✓ Suspended customer cannot un-suspend self — Only admins may change role or status
✓ Admin reversal works
✓ Second reversal (new key) rejected — Transaction is already reversed
✓ Customer cannot call admin functions — Admin privilege required
✓ Cannot save own account as recipient — Cannot save your own account as a recipient
✓ Cannot save nonexistent account — Recipient account does not exist or is not active
✓ Save valid recipient
✓ add_saved_recipient does not return holder name
✓ Direct insert into saved_recipients denied
✓ Owner CANNOT change a saved recipient's account number (bypassing validation) — permission denied for table saved_recipients
✓ Statement returns opening/closing/rows — period_to,account_id,period_from,transactions,account_number,closing_balance,opening_balance
✓ Non-owner cannot fetch statement — Unauthorized to access this account statement
✓ Admin creates biller (+ settlement account)
✓ Bill pay rejects malformed reference — Invalid reference format for Mindanao Power Co. (demo) (expected pattern: ^[0-9]{10}$)
✓ Bill pay with valid reference
✓ bill_payments row linked to its transaction
✓ Admin deactivates biller via RPC
✓ Deactivated biller is hidden from customer
✓ Deactivated biller remains visible to admin
✓ Audit log records biller_status_changed entry
✓ Create weekly schedule starting today
✓ Executor called twice → exactly one run & one debit — {"failed":0,"processed":1,"succeeded":1,"execution_date":"2026-11-08"}
✓ next_run_date advanced by 7 days
✓ Unfunded scheduled run recorded as failed, no ledger writes — {"status":"failed","failure_reason":"Insufficient funds"}
✓ Monthly from Jan 31 → Feb 28 → Mar 31 → Apr 30 (no drift) — 2026-02-28,2026-03-31,2026-04-30
✓ Customer cannot run the executor — permission denied for function run_due_scheduled_payments
✓ Customer schedules to another customer by account number
✓ Scheduling to nonexistent number returns not-found error — Recipient account number not found
✓ Scheduling from someone else account is rejected — Unauthorized: source account does not belong to caller
✓ list_my_scheduled_payments returns only caller rows with to_account_last4
✓ Create payment request
✓ Request response has no names
✓ Requester cannot pay own request — Unauthorized to pay this payment request
✓ Payer pays request (requester credited 2,500)
✓ Request marked paid + linked to transaction
✓ Paid request same-key retry returns success (idempotent) — [{"r":{"status":"paid","success":true,"request_id":"41a717c3-590f-420b-8ec0-a47886933803","transaction_id":"c8ba0e2b-0478-4dbe-ad7c-f2d4c322e988","idempotent_replay":true}}]
✓ Second payment (new key) rejected, no extra money moved — Payment request is no longer pending (status: paid)
✓ Direct insert into payment_requests denied
✓ Customers can read fx_rates — 768
✓ Customers cannot write fx_rates
✓ Anon RPC to transfer rejected with permission denied — permission denied for function transfer
✓ Anon RPC to deposit rejected with permission denied — permission denied for function deposit
✓ Anon cannot read billers (RLS deny)
✓ Anon cannot read fx_rates (RLS deny)
✓ RLS Audit: all public tables enable row-level security
✓ RLS Audit: no policies use using (true) outside health_check
✓ RLS Audit: neither billers nor fx_rates allow anon reads
✓ Enrolled aal1 transfer requires step-up — STEP_UP_REQUIRED
✓ Unenrolled transfer requires enrollment — STEP_UP_NOT_ENROLLED
✓ Six-minute-old TOTP is rejected — STEP_UP_EXPIRED
✓ Missing TOTP claim fails closed — STEP_UP_EXPIRED
✓ Deposit remains available at aal1
✓ Fresh TOTP permits transfer
✓ Admin mutation rejects aal1 — STEP_UP_REQUIRED
✓ Customer cannot reset MFA — Admin privilege required
✓ Admin cannot reset own MFA — Cannot reset your own MFA factors
✓ MFA reset requires meaningful reason — Reason must contain at least 10 characters
✓ Admin reset removes customer factors and records audit
✓ Customer cannot change emergency switch
✓ Settings cannot be read by clients — permission denied for table security_settings
✓ Admin can disable step-up
✓ Emergency switch bypasses step-up
✓ admin_adjust_balance rejects aal1 before mutation — STEP_UP_REQUIRED
✓ admin_reverse_transaction rejects aal1 before mutation — STEP_UP_REQUIRED
✓ admin_set_user_status rejects aal1 before mutation — STEP_UP_REQUIRED
✓ admin_set_account_status rejects aal1 before mutation — STEP_UP_REQUIRED
✓ admin_open_account rejects aal1 before mutation — STEP_UP_REQUIRED
✓ admin_create_biller rejects aal1 before mutation — STEP_UP_REQUIRED
✓ admin_set_biller_active rejects aal1 before mutation — STEP_UP_REQUIRED
✓ admin_run_due_schedules_now rejects aal1 before mutation — STEP_UP_REQUIRED
✓ Reconciliation: every transfer/reversal/bill nets to zero — {"net":"150001","unbalanced":0,"mismatched":0}
✓ Reconciliation: account_balances == ledger sum for every account — {"net":"150001","unbalanced":0,"mismatched":0}

90 passed, 0 failed
```

_Result: 90/90 passed against local migrations._

---

### 4. Live Test Suites (Pending Reviewer Deployment)

The Phase 6.5 migration (`20261110000000_phase6_5_step_up.sql`) has intentionally **not** been applied to the hosted Supabase project, per reviewer instructions. Each suite was run against the live instance to confirm that it fails closed, outputs the required message, exits with non-zero exit code 1, moves no money, and alters no MFA factors.

#### `npm run test:rls`

```
> davao-bank@0.1.0 test:rls
> node --env-file=.env --import tsx scripts/test-rls-and-auth.ts

NOT VERIFIED — Phase 6.5 migration is not deployed. Reviewer must apply it before live strong-auth tests.
(Exit code 1)
```

#### `npm run test:money`

```
> davao-bank@0.1.0 test:money
> node --env-file=.env --import tsx scripts/test-phase3-money.ts

NOT VERIFIED — Phase 6.5 migration is not deployed. Reviewer must apply it before live strong-auth tests.
(Exit code 1)
```

#### `npm run test:admin`

```
> davao-bank@0.1.0 test:admin
> node --env-file=.env --import tsx scripts/test-phase4-admin.ts

NOT VERIFIED — Phase 6.5 migration is not deployed. Reviewer must apply it before live strong-auth tests.
(Exit code 1)
```

#### `npm run test:extras`

```
> davao-bank@0.1.0 test:extras
> node --env-file=.env --import tsx scripts/test-phase5-extras.ts

NOT VERIFIED — Phase 6.5 migration is not deployed. Reviewer must apply it before live strong-auth tests.
(Exit code 1)
```

#### `npm run test:schedules`

```
> davao-bank@0.1.0 test:schedules
> node --env-file=.env --import tsx scripts/test-phase5-schedules.ts

NOT VERIFIED — Phase 6.5 migration is not deployed. Reviewer must apply it before live strong-auth tests.
(Exit code 1)
```

#### `npm run test:qr`

```
> davao-bank@0.1.0 test:qr
> node --env-file=.env --import tsx scripts/test-phase5-qr-requests.ts

NOT VERIFIED — Phase 6.5 migration is not deployed. Reviewer must apply it before live strong-auth tests.
(Exit code 1)
```

#### `npm run test:fx`

```
> davao-bank@0.1.0 test:fx
> node --env-file=.env --import tsx scripts/test-phase5-fx.ts

NOT VERIFIED — Phase 6.5 migration is not deployed. Reviewer must apply it before live strong-auth tests.
(Exit code 1)
```

---

### 5. Playwright E2E (`npx playwright test`)

```
Running 5 tests using 1 worker

     1 … Non-admin user cannot access protected admin routes and gets redirected
  ✘  1 …dmin user cannot access protected admin routes and gets redirected (0ms)
     2 …es twice for middleware refresh, signs out, and gets redirected to login
  -  2 …es twice for middleware refresh, signs out, and gets redirected to login
     3 …es users, adjusts balance, reverses transaction, and inspects audit logs
  -  3 …es users, adjusts balance, reverses transaction, and inspects audit logs
     4 …ole E2E Flow › idle sign-out clears the browser session after navigation
  -  4 …ole E2E Flow › idle sign-out clears the browser session after navigation
     5 …› AAL1 admin session (password only) opening / is redirected to MFA step
  -  5 …› AAL1 admin session (password only) opening / is redirected to MFA step

  1) [chromium] › e2e/admin/admin-flow.spec.ts:28:7 › Admin Console E2E Flow › Non-admin user cannot access protected admin routes and gets redirected

    Error: NOT VERIFIED — Phase 6.5 migration is not deployed. Reviewer must apply it before live strong-auth tests.

       at ../../scripts/lib/step-up.ts:19
(Exit code 1)
```

_Result: Stops cleanly with NOT VERIFIED pending deployment by the reviewer._

## Reviewer verification on hosted (2026-11-08)

The reviewer applied migration `20261110000000_phase6_5_step_up.sql` to the hosted project, after adding 30 s of clock-skew tolerance in `73c31ed`.

Running against the live database surfaced four bugs in the Stage E test harness. These were never exercised before, because every run stopped at the "not deployed" check. The reviewer fixed them in the next commit:

1. `requireStepUpMigration` treated the expected anon `permission denied` (42501) as "could not verify", so all 7 suites stopped.
2. `test:money` signed out its aal1 client with the default **global** scope, which revoked `customer1Client`'s session ("Auth session missing"). The stale-window wait also left customer2's step-up stale before the concurrency test.
3. `e2e/admin/mfa-helper.ts`:
   - `cleanupMfa` referenced an undefined `activeFactorId` (a ReferenceError);
   - worse, it deleted **every** admin factor even when the "existing authenticator" prerequisite had failed. Once the presenter enrolls a real authenticator, it would have been deleted.

   Cleanup now removes only factors created during the run, and does nothing if the prerequisites failed.

4. The admin E2E customer transfer needed a step-up session (temporary test factor, always cleaned up). The cleanup reversal needed an aal2 admin API session, which the test now gets by signing in again: verifying a newly enrolled factor revokes the user's other sessions.

Results after the fixes, all against hosted:

| Check                                                                      | Result                   |
| -------------------------------------------------------------------------- | ------------------------ |
| `test:rls`                                                                 | 30/30                    |
| `test:money` (including aal1 rejected and stale step-up `STEP_UP_EXPIRED`) | 33/33                    |
| `test:admin`                                                               | 45/45                    |
| `test:extras`                                                              | 20/20                    |
| `test:schedules`                                                           | 24/24                    |
| `test:qr`                                                                  | 24/24                    |
| `test:fx`                                                                  | 18/18                    |
| Playwright                                                                 | 5/5, three runs in a row |
| MFA factors left on hosted after all runs                                  | 0                        |

Still pending: the iOS device check of authenticator setup, the code prompt and the biometric app lock (the owner scans a QR code).

## Reviewer iOS simulator check (2026-11-08, iPhone 17 Pro Max, Expo Go, hosted backend)

Face ID was not enrolled on the simulator, so the password path was used as the first factor. The owner typed the password and the authenticator codes; the reviewer drove the rest. Evidence is in `docs/uat-evidence/ios-6.5/`. The setup-key screen was deliberately not captured.

| Check                                                       | Result                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ₱1 cash-out before enrolling                                | PASS: blocked after the password with "Set up two-step verification…" and **Set up now**; balance unchanged                                                                                                                                             |
| Two-step setup from Profile                                 | **FAIL → fixed** (`2acd017`): the setup screen could never open, because its early return was inside `getInitials()`. After the fix: QR, setup key, Copy and Open-in-app all shown; the code verified; status reads "On · Davao Bank · added 11/8/2026" |
| ₱1 cash-out after enrolling (password → authenticator code) | PASS: balance ₱14,099.10 → ₱14,098.10; DB shows 1 completed withdrawal with an idempotency key and its ledger entry                                                                                                                                     |
| App lock after more than 2 min in the background            | PASS: "Davao Bank is locked", no account data visible; unlocking with the password returns to Home                                                                                                                                                      |

Not covered on device:

- the Face ID path (the simulator could not enroll);
- Cancel and a wrong code at the authenticator prompt (unit-tested);
- "Set up now" opening the setup screen directly after the fix (only reached Profile before the fix);
- the admin console sign-in by hand (Playwright covers it 5/5).

Cosmetic issues for Phase 7:

- the setup screen has no side padding;
- the App lock row has no icon or subtitle and the Two-step button sits outside the settings list;
- the lock screen shows both a password field and a "Use password" link;
- the App lock switch was slow to respond to taps.

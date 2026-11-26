# Davao Bank — Phase 6.5 Prompt (Strong authentication)

Branch: create `phase-6-5-strong-auth` from the current tip of `phase-6-hardening`. Do not push.

The working tree has uncommitted reviewer files: `docs/UAT_CHECKLIST.md` and `docs/uat-evidence/`. **Do not edit, stage or commit them.**

Make one commit per stage, titled exactly as below:

- `Phase 6.5 · Stage A — Server-enforced step-up`
- `Phase 6.5 · Stage B — Authenticator setup and transfer verification (mobile)`
- `Phase 6.5 · Stage C — Biometric app lock`
- `Phase 6.5 · Stage D — Admin console two-step sign-in`
- `Phase 6.5 · Stage E — Tests, docs and report`

## Why this phase exists

Today every money action is confirmed by Face ID / fingerprint, with password as the fallback. That check happens **only in the app**. The database functions only check that the caller is signed in and owns the account, so anyone holding a valid session token can call `transfer`, `withdraw` and the other money functions directly and skip the check.

## Agreed decisions

1. **Second factor:** an authenticator app (TOTP) through Supabase Auth MFA, on top of the existing biometric/password confirmation. No SMS and no email codes for payments.
2. **Scope:** **every** outgoing money action requires a fresh authenticator code, enforced by the database, not just the app.
3. **Biometric app lock:** add it.
4. **Admins:** must pass the authenticator code at every sign-in to the console. Admin money functions require a two-step session.

## Key technical facts (check these against the Supabase docs before relying on them)

- **AAL claim.** After `supabase.auth.mfa.challengeAndVerify({ factorId, code })`, the session's JWT carries `aal = 'aal2'`.
- **AMR claim.** The JWT also carries an `amr` array of `{ method, timestamp }` entries, and one entry has `method = 'totp'`.
- **Reading claims in SQL.** Both are readable in SQL through `auth.jwt()`.
- **AAL alone is not enough for "every transfer".** A session stays `aal2` after one verification, until sign-out. So "every transfer" is enforced by checking how recent the `totp` timestamp in `amr` is.
- **Window: 5 minutes.** That is long enough for one transfer, including a retry with the same idempotency key, and short enough that each new transfer needs a new code.
- **Hosted config.** The hosted project already has TOTP enroll and verify **enabled**.
- **Local config.** Local `supabase/config.toml` still has `[auth.mfa.totp] enroll_enabled = false, verify_enabled = false`. Set both to `true`.

---

## Stage A — Server-enforced step-up (database)

New migration: `supabase/migrations/20261110000000_phase6_5_step_up.sql`.

1. Create one helper, `public.assert_money_step_up()`, as `security definer` with `set search_path = ''`.

   It raises a distinct, machine-readable error in these cases:

   | Condition                                                                                               | Error                                                   |
   | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
   | No JWT / not signed in                                                                                  | `'Authentication required'` (keep the existing message) |
   | `auth.jwt()->>'aal'` is not `'aal2'` and the user has **no verified TOTP factor** in `auth.mfa_factors` | `'STEP_UP_NOT_ENROLLED'`                                |
   | `aal` is not `'aal2'` (user is enrolled)                                                                | `'STEP_UP_REQUIRED'`                                    |
   | Latest `amr` entry with `method = 'totp'` is older than `step_up_window_seconds`                        | `'STEP_UP_EXPIRED'`                                     |
   - Read the window from a new single-row settings table, `public.security_settings`, created in this migration:
     - columns: `money_step_up_enabled boolean not null default true`, `step_up_window_seconds int not null default 300`;
     - RLS on;
     - readable by nobody except `security definer` functions;
     - updatable only by admins.
   - If `money_step_up_enabled = false`, the helper returns without checking. This is the documented emergency switch. It must never be the default.

2. Call `public.assert_money_step_up()` as the **first statement** of every customer function that moves money out or commits to moving it:
   - `transfer`, `transfer_by_account_number`, `withdraw`, `pay_bill`, `pay_payment_request`;
   - `create_scheduled_payment`, `create_scheduled_transfer_to_number`, and `update_scheduled_payment` when the amount, recipient or date changes.

   Do **not** add it to:
   - `deposit` (play money in);
   - `create_payment_request`, `decline_payment_request`, `cancel_payment_request`, `cancel_scheduled_payment`;
   - read functions, `add_saved_recipient`.

   Re-create these functions **with their current bodies copied exactly from the latest migration that defines them**, plus the one new line. Keep signatures, grants and idempotency behaviour identical.

3. **Never** put the check in `_transfer_core` or `run_due_scheduled_payments`. The pg_cron job runs scheduled payments without a user JWT, and that must keep working. Approval happened when the schedule was created.

4. Admin functions:
   - `admin_adjust_balance` and `admin_reverse_transaction` require `aal = 'aal2'`, with no 5-minute freshness. The admin passed TOTP at sign-in.
   - Do the same for the other `admin_*` mutation functions: `admin_set_user_status`, `admin_set_account_status`, `admin_open_account`, `admin_create_biller`, `admin_set_biller_active`, `admin_run_due_schedules_now`.
   - Use a second helper, `public.assert_admin_aal2()`. Read-only admin functions do not need it.

5. Add `public.admin_reset_user_mfa(target_user uuid, reason text)` for customers who lose their authenticator phone.
   - Admin only, requires `aal2`.
   - Deletes the target user's rows in `auth.mfa_factors`.
   - Writes an audit row through `write_audit` with the reason (required, at least 10 characters).
   - Admins cannot reset their own factors this way. Document the dashboard procedure for that in `docs/SECURITY_REVIEW.md`.

6. Map the new errors to friendly text in `packages/shared/src/utils/errors.ts`:

   | Error                                  | Message                                                           |
   | -------------------------------------- | ----------------------------------------------------------------- |
   | `STEP_UP_NOT_ENROLLED`                 | "Set up two-step verification in Profile before sending money."   |
   | `STEP_UP_REQUIRED` / `STEP_UP_EXPIRED` | "Enter the 6-digit code from your authenticator app to continue." |

## Stage B — Authenticator setup and transfer verification (mobile)

1. **Profile → Security → "Two-step verification".**
   - Shows the status: Off / On (factor friendly name, date added).
   - **Set up:** `mfa.enroll({ factorType: 'totp', friendlyName: 'Davao Bank' })`. Show:
     - the QR code (`react-native-qrcode-svg`, already installed);
     - **the setup key as text with a Copy button**;
     - an **"Open in authenticator app"** button (`Linking.openURL(totp.uri)`). Most users set up on the same phone and cannot scan their own screen.
   - Then ask for the first 6-digit code and call `mfa.challengeAndVerify`. If the user abandons setup, unenroll the unverified factor.
   - **Turn off:** requires a fresh code, then `mfa.unenroll`. Warn that sending money will be blocked until it is set up again.

2. **Every money confirmation** (`TransferModal`, `WithdrawModal`, `PayBillsModal` including schedules, `PaymentRequestsModal`, `ScheduledPaymentsModal` edit) uses this order after the user taps Authorize:
   1. Biometrics, or the password fallback. This is the existing `decideConfirmation`; do not change its rules.
   2. **Authenticator code prompt:** a 6-digit numeric input, auto-submit on the 6th digit, `textContentType="oneTimeCode"` / `autoComplete="one-time-code"`.
      - It renders **inside the top sheet** using the same host pattern as `PasswordPromptContext` (that pattern fixed the iOS stacked-modal bug; reuse it, do not add a new root `<Modal>`).
      - On submit, call `mfa.challengeAndVerify`, then **refresh the session** so the RPC carries the new JWT.
   3. Call the RPC with the **same idempotency key** as before.
   - Wrong code: inline error and the prompt stays open.
   - Cancel: `{ cancelled: true }`. No money moves, and the user returns to Review with the existing "cancelled" message.
   - The prompt has the same 2-second fail-closed safety net as the password prompt.
   - Not enrolled: skip the prompt and show the `STEP_UP_NOT_ENROLLED` message with a **"Set up now"** button that opens the Profile setup screen.

3. If the RPC still returns `STEP_UP_REQUIRED` or `STEP_UP_EXPIRED` (for example the user waited more than 5 minutes on Review), show the code prompt once more and retry with the same idempotency key. Never loop more than once.

4. Keep all transfer-recovery behaviour from `transferRecovery.ts` unchanged.

## Stage C — Biometric app lock (mobile)

1. A new **App lock** setting in Profile → Security.
   - On by default when the device has biometrics enrolled.
   - Stored with `expo-secure-store`, like the existing biometric preference.

2. A **LockScreen** appears when app lock is on and:
   - the app cold-starts with a restored session; or
   - the app returns to the foreground after **more than 2 minutes** in the background.

   Use `useAppBackgrounded` / `AppState` and record the time the app went to the background.

3. LockScreen behaviour:
   - It calls `LocalAuthentication.authenticateAsync` automatically, with an **Unlock** button to retry.
   - It offers **"Use password"**, which uses the existing password check (`signInWithPassword` against the session's email), and **"Sign out"**.
   - Nothing behind it renders or fetches balances until it is unlocked.
   - The privacy overlay must not flash on top of it. While you are here, fix the known flash of the privacy overlay when the password prompt closes.

4. If biometrics become unavailable (for example the user removes Face ID), fall back to the password and do not lock the user out.

5. App lock is a convenience layer. Do not rely on it for server security, which Stage A already provides.

## Stage D — Admin console two-step sign-in

1. After a successful password sign-in on `/login`:
   - **No verified factor:** redirect to `/mfa/setup`. Show the QR code and setup key, verify the first code, then go to the dashboard.
   - **Has a factor:** redirect to `/mfa/verify` for the 6-digit code.

2. `middleware.ts`: for every protected route, call `supabase.auth.mfa.getAuthenticatorAssuranceLevel()`.
   - If `currentLevel !== 'aal2'`, redirect to `/mfa/verify` (or `/mfa/setup` when `nextLevel` is `aal1`, meaning no factor).
   - Allow `/mfa/*` for signed-in users at `aal1` only.
   - Keep the existing non-admin → `/unauthorized` behaviour and the idle sign-out.

3. Server actions in `actions.ts` must also refuse an `aal1` session. The middleware alone is not enough.

4. On the user detail page, add a **"Reset two-step verification"** button.
   - It calls `admin_reset_user_mfa` with a required reason through the existing confirm dialog.
   - It is shown only when the user has a factor.

## Stage E — Tests, docs and report

1. **DB tests (`npm run test:db`, PGlite harness).** Simulate JWT claims and cover:
   - aal1 → `STEP_UP_REQUIRED`;
   - not enrolled → `STEP_UP_NOT_ENROLLED`;
   - aal2 with a TOTP timestamp 6 minutes old → `STEP_UP_EXPIRED`;
   - aal2 fresh → success;
   - `run_due_scheduled_payments` with no JWT still pays a due schedule;
   - `deposit` works at aal1;
   - the admin functions reject aal1;
   - `admin_reset_user_mfa` rejects non-admins, rejects resetting one's own factors, and writes an audit row;
   - `money_step_up_enabled = false` bypasses the check, and only an admin can change it.

2. **Live suites** (`test:money`, `test:rls`, `test:admin`, `test:extras`, `test:schedules`, `test:qr`, `test:fx`):
   - Add one shared helper, `scripts/lib/step-up.ts`, that:
     - enrolls a temporary TOTP factor for the signed-in test user;
     - computes codes with the `otpauth` package (devDependency, exact version);
     - verifies, so the client is aal2 and fresh;
     - **unenrolls in a `finally` block.**
   - Add explicit negative cases: an aal1 transfer is rejected, and a stale step-up is rejected.
   - The demo accounts must end each run with the same factors they started with.
   - All 7 suites must pass.

3. **Playwright:** the admin flow uses the same helper approach to pass `/mfa/setup` or `/mfa/verify`, then removes the factor at the end. Run the full suite **3 times in a row**, 4/4 each time. Add a test that an aal1 admin session is redirected to `/mfa/verify`.

4. **Unit/component tests (`npm run test:unit`):**
   - the code prompt renders inside the sheet;
   - Cancel never authorizes;
   - the 2-second safety net fails closed;
   - a `STEP_UP_EXPIRED` retry happens at most once;
   - the LockScreen shows after more than 2 minutes in the background and not after less.

5. **Docs:**
   - `docs/SECURITY_REVIEW.md`: a new "Strong authentication" section covering:
     - the threat that this closes;
     - the 5-minute window;
     - the emergency switch;
     - the customer factor reset;
     - admin self-recovery through the Supabase dashboard;
     - why there is no SMS.
   - A short "Two-step verification" section in the user guide, if one exists.
   - A new `PHASE6_5_REPORT.md` with the real command outputs.

6. **Final checks:** `format:check`, `lint`, `typecheck`, `test:unit`, `test:db`, and all 7 live suites.

## Do NOT

- Do not print, log or commit any password, TOTP secret or code. Test secrets live only in memory during a run.
- Do not change `_transfer_core`, the idempotency logic, the ledger or `run_due_scheduled_payments`, except where step 2 of Stage A requires it.
- Do not change `decideConfirmation`'s rule that success requires a passed biometric or password check.
- Do not enroll or unenroll factors on the demo accounts permanently. The reviewer enrolls the presenter's authenticator manually.
- Do not apply the migration to the hosted project. The reviewer applies it after review.
- Do not mark any UAT row as passed.

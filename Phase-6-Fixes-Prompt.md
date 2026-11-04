# Davao Bank — Phase 6 Follow-Up (Fixes) Prompt

**Give this entire file to your coding agent.** It is a correction pass on Phase 6 Stages 0, A and B. After the fixes, finish Stage C exactly as written in `Phase-6-Prompt-Testing-Security-Hardening.md`.

**Verdict on the current branch: Needs Fixes.**

## Before you start

1. **Switch branch.** The working folder is currently on `main`. Run `git checkout phase-6-hardening` first and work there.
2. **Commits:**
   - Make one commit for these fixes, titled `Phase 6 · Fixes — review corrections`.
   - Make one later commit for Stage C, titled `Phase 6 · Stage C — Quality checks on real devices`.
   - Use the exact title format. The last commit ("Phase 6 – Security Hardening completed") did not follow it.
3. **Migrations:** put all database changes in one new migration. Never edit an earlier migration.
4. **Report:** append a "Stage B" section and a "Fixes" section to `PHASE6_REPORT.md`, with real command output. The Stage B commit added no report section at all.
5. **Do not push.** The owner pushes after the reviewer approves.

## What the reviewer verified (keep all of this working)

These were checked on 2026-11-04 and 2026-11-05 against a clean checkout of the branch and the hosted database.

- **Offline harness:** `test:db` 63/63.
- **Unit tests:** `test:unit` 50/50.
- **Static checks:** typecheck clean; lint 0 errors; npm audit 0 high or critical.
- **Builds:** `build:admin` succeeds and the iOS `expo export` bundles.
- **Live suites, 182/182, each showing `✓ Connected to live database`:**

  | Suite     | Result |
  | --------- | ------ |
  | rls       | 24/24  |
  | money     | 31/31  |
  | admin     | 41/41  |
  | extras    | 20/20  |
  | schedules | 24/24  |
  | qr        | 24/24  |
  | fx        | 18/18  |

- **Live database:**
  - All 12 migrations are applied.
  - No public function can be executed by `anon`.
  - `davao-run-schedules` runs every 5 minutes and succeeds.
  - The FX job reads its secret from Vault, and `cron.job` contains no key.
  - The FX sync updated `fx_rates` on 2026-11-04 at 04:00 UTC.
- **Stage 0 code:** items 0.1, 0.7 and 0.8 are met. In 0.9, items 5 (key regeneration), 7 (balance card), 8 (`typeLabel`) and 10 (scheduled transfers to other customers) are met.

---

## Fixes

### F1 — HIGH: Transfer can send twice and loses its receipt

**Problem.** In `TransferModal.tsx`, the reset `useEffect` (about lines 117–162) depends on `selectedAccount` and `loadSavedRecipients`. `selectedAccount` becomes a new object every time Home's `loadData()` replaces `accounts`. After a successful transfer, `onTransferSuccess` calls `loadData()`, so the effect runs again:

- **Normal path:** the success screen is replaced by an empty Recipient step after about a second.
- **QR-with-amount path:** the effect restores the prefilled amount, **generates a new idempotency key** and jumps back to Review. Tapping Confirm again sends a **second, separate transfer**.

**Fix:**

- Reset the flow only when `visible` changes from `false` to `true` (track the previous value in a `useRef`). Apply the QR prefill once per opening.
- Data refreshes must never change the step, the form or the idempotency key.
- Look up the selected account by `account_id` so a refresh keeps the selection without resetting anything.
- **"Updated Balance":** no SQL function returns `new_balance` or `from_new_balance`. Show the refreshed balance of the source account (looked up by `account_id` in the updated `accounts` prop) and label it "Balance now". Do not compute it as `balance - amount`, and do not change any function signature.
- **Check the other money modals for the same pattern.** Deposit, Withdraw and PayBills currently reset only on `[visible]`; keep it that way.
- **Pay Bills:** the result screen must show the amount and ID from the server response, not client values. Show "This payment was already processed" on a replay, as Transfer does.

**Test:**

- Add a unit test that renders `TransferModal` at the success step, re-renders it with a new `accounts` array containing equal data, and asserts that it stays on success with the same key.
- Add a Maestro step to `stage-0-9-flow-checks.yaml`: open a QR prefill with an amount, confirm, wait 3 s, and assert that the result screen is still visible.

### F2 — HIGH: forced HttpOnly cookies break the admin browser client

**Problem.** `apps/admin/src/lib/supabase-cookies.ts` and `middleware.ts` now force `httpOnly: true` on every Supabase auth cookie. The admin console also uses `createBrowserClient` from `@supabase/ssr`, which reads and writes those cookies through `document.cookie`. After the middleware rewrites them as HttpOnly, the browser client loses the session. That affects:

- Sign-out: `Sidebar.tsx`, `AdminNav.tsx`.
- Idle sign-out: `AdminShell.tsx`.
- Browser-side queries.

`signOut()` also cannot clear the HttpOnly cookies, so staff may stay signed in.

**Fix:**

- Remove the forced `httpOnly`. Keep `secure` in production and `sameSite: 'lax'`.
- **Optional:** if you want server-only cookies, first move every browser-side Supabase call into server actions, including:
  - sign-out, as a server action that calls `supabase.auth.signOut()` and redirects;
  - the idle timeout;
  - the biller toggle (F3).

  Then remove `createBrowserClient` usage. Do not leave the two approaches mixed.

**Test:**

- Playwright: sign in, wait for at least one middleware refresh by navigating twice, click **Sign Out**, and assert that you are redirected to `/login` and that `/` redirects to `/login` again.
- Same check for the idle sign-out, with the timeout shortened through an environment variable or test hook.

### F3 — HIGH: administrators can no longer see inactive billers

**Problem.**

- The Stage B migration replaced the billers policy with `using (is_active = true)`. The original was already limited to `authenticated` and allowed `or public.is_admin()`. This is confirmed on the live database.
- As a result, the admin Billers page cannot show or reactivate a deactivated biller.
- The Activate/Deactivate button in `BillersClient.tsx` also updates the table directly. Billers have no update policy, so RLS silently ignores the change and no audit entry is written.

**Fix (new migration):**

- Recreate the policy as `to authenticated using (is_active = true or public.is_admin())`.
- Switch the button to the existing server action `adminSetBillerActiveAction` (`admin_set_biller_active`).
- Correct `SECURITY_REVIEW.md`, which says billers were readable by `anon`. They were not.

**Test:**

- `test:db` and `test:admin`: an administrator deactivates a biller through the RPC; it disappears for customers and stays visible to the administrator; the audit log has a `biller_status_changed` entry.

### F4 — HIGH: README is corrupted and CI fails

**Problem.**

- `README.md` contains the same "## Phase 6 – Security Hardening" block **117 times**, inserted after headings and inside tables. Some tables are broken, and the file grew from 282 to 1,745 lines.
- `format:check` fails on `README.md` and `.claude/launch.json`, so CI will fail on push.

**Fix:**

- Start again from the README as it was at `f5f3086`. Add **one** Phase 6 section, and change the title from "Phase 4" to the current state.
- Correct the architecture note that says sessions use AsyncStorage.
- Run Prettier on `.claude/launch.json`, or add `.claude/` to `.prettierignore`.
- `npm run format:check` must pass.

### F5 — HIGH: demo passwords are published in a public repository

**Problem.** The GitHub repository is public. The seed password of the live hosted demo accounts, **including the administrator**, appears in plain text in:

- `README.md`
- `.env.example`
- the fallback in `scripts/seed.ts`
- `e2e/admin/admin-flow.spec.ts`
- `e2e/mobile/*.yaml`

**Fix:**

- **`seed.ts`:** remove the hard-coded fallback. If `SEED_PASSWORD` is not set, print a clear error and exit with code 1.
- **Seed behavior:** when a user already exists, `seed.ts` must update that user's password to `SEED_PASSWORD` through the Admin API, so the owner can rotate passwords by re-running the seed.
- **`.env.example`:** `SEED_PASSWORD=` with a comment saying to choose a private value. Leave it empty.
- **E2E files:** read credentials from environment variables (`E2E_ADMIN_EMAIL`, `E2E_PASSWORD`, and so on). In Maestro use `${E2E_PASSWORD}` with `-e`; in Playwright use `process.env`. Document both in the README.
- **README:** remove the password column from the credentials table. Keep the account emails and point readers to `SEED_PASSWORD`.
- **Report:** in `PHASE6_REPORT.md`, tell the owner to set a new private `SEED_PASSWORD` in `.env` and run `npm run seed` to rotate the live passwords. The old value remains in git history, so rotating it is what fixes this.

### F6 — MEDIUM: session encryption reuses its key and counter

**Problem.** `apps/mobile/src/lib/supabase.ts`, the `LargeSecureStore`, keeps one AES key per storage key and always uses `new aesjs.Counter(1)`. Every token refresh therefore re-encrypts with the same keystream.

**Fix:** follow the Supabase Expo guide.

- Generate a **new random 256-bit key on every `setItem`**, store it in SecureStore and replace the previous one.
- Keep the plain-JSON migration that already exists.

**Test:** a unit test with mocked SecureStore and AsyncStorage. Two consecutive `setItem` calls for the same key must produce different stored keys and different ciphertexts, and `getItem` must round-trip correctly.

### F7 — MEDIUM: privacy overlay does not cover open sheets; Android needs a secure flag

**Problem.** The app-switcher overlay renders in the root view. Money sheets are React Native `<Modal>`s, which iOS presents in a separate window, so an open Transfer Review stays visible in the app switcher. Android does not emit `inactive`.

**Fix:**

- Add a shared hook, `useAppBackgrounded()`.
- Render the same overlay inside `BottomSheet`, `PasswordConfirmationModal` and `FXRatesModal` when the app is backgrounded.
- On Android, call `ScreenCapture.preventScreenCaptureAsync()` from `expo-screen-capture`. That sets `FLAG_SECURE`, which also hides the app-switcher thumbnail.
- `expo-screen-capture` ships with Expo Go SDK 58. Install it with `npx expo install expo-screen-capture`; this is the only new dependency allowed in this pass.

### F8 — MEDIUM: finish error sanitizing

**Problem.** These still show raw Supabase or Postgres messages:

- **Mobile auth screens:** Login, SignUp, ForgotPassword, VerifyEmail.
- **Other mobile screens:** QR request money, Scheduled Payments, Saved Recipients, Personal Details.
- **The whole admin console:** login page, every server action's returned error, `BillersClient`, `ConfirmDialog`.

**Fix:**

- Route all of them through `toUserMessage` (extend it with admin messages if needed). Log the original only in development.
- Narrow the network match: `includes('fetch')` is too broad. Match `TypeError: Network request failed` and `Failed to fetch` specifically.

**Test:** the Maestro auth flow already asserts "That email and password don't match. Try again." It must now pass.

### F9 — LOW-MEDIUM: remaining 0.9 gaps

- **Back buttons:** disable them while a request is in flight in Transfer Review, Deposit Review and Withdraw Review, as Pay Bills already does.
- **Discard prompt:** ask "Discard this …? Your details will be lost." whenever the form has input, **on any step**, not only on step 1.
- **Payment requests:** for Decline and Cancel, set `actionLoadingId` **before** showing the Alert, and clear it on Keep, so a double tap cannot open two dialogs.
- **Keyboard:** add `keyboardShouldPersistTaps="handled"` to `PersonalDetailsModal`, `SavedRecipientsModal`, the QR request form, the `BillerStep` search and `ExportStatementModal`.

### F10 — LOW-MEDIUM: test quality

- **Confirmation test:** `confirmation.test.ts` tests a copy of the logic written inside the test file. Extract the real decision logic from `SettingsContext` into a pure function (for example `decideConfirmation(...)`), use it in the context, and test that function. The rule to prove is "never succeeds without a biometric or password check".
- **Guard trigger (0.6):** the checks exist only in `test:db`. Add them to the live `test:rls` suite:
  - a customer changing their own role or status is rejected;
  - an administrator suspending a customer is allowed;
  - an anonymous attempt is rejected.
- **Maestro:** extend `stage-0-9-flow-checks.yaml` to cover Cash-out, Pay Bills and Pay request, and add a "tap the backdrop while processing" step.

### F11 — LOW: the FX job reports a timeout

**Problem.** `pg_net` stops waiting after the default 5,000 ms. The Edge Function takes about 10 s, so every run is recorded as a timeout even though the rates are saved.

**Fix:**

- Re-register the job in the new migration with `timeout_milliseconds := 30000` in `net.http_post`. Keep the Vault lookup exactly as it is.
- Add `[functions.fx-sync] verify_jwt = false` to `supabase/config.toml`, matching how the function is deployed. The cron call sends only the secret header.

### F12 — LOW: security headers

- Add `http://127.0.0.1:54321` and `ws://127.0.0.1:54321` to `connect-src` in development only, so the admin console works against local Supabase.
- `'unsafe-eval'` in `script-src` is needed only in development; remove it from the production header.
- Keep `'unsafe-inline'` only if Next requires it, and record that choice in `SECURITY_REVIEW.md`.

### F13 — Hosted auth settings and `SECURITY_REVIEW.md`

**Hosted auth settings.** `supabase/config.toml` changes apply only to local Supabase. Add a short "Hosted project settings" checklist to `SECURITY_REVIEW.md` for the owner to apply in the dashboard:

- minimum password length 10, with letters and digits;
- leaked-password protection, if the plan allows it;
- auth rate limits;
- email confirmation on.

Add a line in the report saying whether each has been applied.

**Corrections to `SECURITY_REVIEW.md`:**

- Billers were never readable by `anon`.
- HttpOnly cookies are not used (see F2).
- The privacy overlay's coverage is as described after F7.
- `toUserMessage` maps known errors and uses a generic message for everything else.
- CI does not check security headers.

**Add to the remaining risks:**

- the old seed password in git history (mitigated by rotation);
- the CSP allowances.

---

## Evidence required in `PHASE6_REPORT.md` (Stage B and Fixes)

1. Full output of `test:db`, `test:unit`, typecheck, lint, `format:check`, `build:admin` and `expo export`.
2. All 7 live suites, each showing `✓ Connected to live database`.
3. A security advisor check. Use either `npx supabase db lint --linked` output, or a screenshot of the dashboard Security Advisor showing no errors. List any warnings with how they were resolved or why they were accepted.
4. A gitleaks scan of the full git history. Use the CI run's output after the owner pushes, or local `gitleaks detect` output if it is installed.
5. `curl -sI http://localhost:3000/login` showing the security headers.
6. Screenshots:
   - the mobile app still signed in after a full restart (F6);
   - the app-switcher view with a Transfer sheet open, on iOS and Android (F7).
7. Playwright output for the sign-out checks (F2) and Maestro output for the flows (F1, F8, F10).
8. `select jobname, schedule from cron.job` and the last FX run from `cron.job_run_details` and `net._http_response`, showing a non-timeout status (F11).

## Do NOT

- Change money logic or any function signature. The only database changes allowed are:
  - the billers policy (F3);
  - re-registering the FX job (F11).
- Edit earlier migrations, weaken RLS, or grant `anon` access to anything.
- Put any password, key or secret into the repository, including test files and the report.
- Start Phase 7 work.
- Push to GitHub.

_The reviewer will re-run every check above on a clean checkout and against the live database. The report alone isn't enough._

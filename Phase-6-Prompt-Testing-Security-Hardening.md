# Davao Bank — Phase 6 Implementation Prompt: Testing & Security Hardening

**Hand this entire file to your coding agent. It is self-contained.**

Phase 6 adds **no new features**. It closes the loose ends Phase 5 left, builds an automated safety net, hardens security, and checks quality on real devices. The redesign, savings goals and the security center are Phases 7–9, so do not start them here.

**Current state (verified by the reviewer on 2026-11-03)**

- All 10 migrations are applied to the hosted project (`qomxlzvrovwsfneqsfej`), and the seed works.
- Live suites: 165/174 passing. All 9 failures are bugs in the tests themselves (Stage 0.3).
- Live concurrency checks passed: parallel withdrawals, double reversal, scheduler run-once.
- `pg_cron` and `pg_net` are enabled. Three cron jobs are registered, but the FX one is a placeholder that does nothing.
- The reviewer's offline harness passes 47/47 (`npm run test:db`).

## How to run this phase

1. **Branch:** create `phase-6-hardening` from `phase-5-redesign-features`.
2. **Commits:** one per stage, titled `Phase 6 · Stage X — <name>`.
3. **Migrations:** one new migration per stage that touches the database. **Never edit an earlier migration.**
4. **Stop on failure.** Run each stage's checks before starting the next. If anything fails, stop and write it up.
5. **Report:** append to `PHASE6_REPORT.md` after each stage, covering:
   - what was built;
   - the commands you ran and their **full output**;
   - which database each test ran against;
   - any deviations from this prompt, with reasons.
6. **Live results must show the connection line.** A live suite result counts only if its output includes `✓ Connected to live database`.
7. **Conflicts:** if anything here conflicts with the code or the approved documents, stop and flag it.

**Review before starting:**

- `Phase-5-Fixes-Prompt.md`
- `scripts/review/pglite-behavior.mjs`
- all migrations
- `packages/shared`
- both apps
- `apps/admin/AGENTS.md` (this Next.js version has breaking changes, so read `node_modules/next/dist/docs/` before changing config or headers)

---

## Stage 0 — Carry-overs from Phase 5

### 0.1 Commit the reviewer's admin fix and clean up

- **Commit `apps/admin/src/components/ui/Table.tsx`.** It is already in the working tree. The fix removed `'use client'` and made the row `onClick` conditional, so the server-rendered Dashboard no longer passes functions to a client component.
- **Discard the whitespace-only edits** in these four files (each adds only a trailing blank line):
  - `FXRatesHero.tsx`
  - `HomeRecentActivity.tsx`
  - `HomeUpcomingPayments.tsx`
  - `TransferSuccessStep.tsx`
- **Run Prettier on `PHASE5_REPORT.md`.** It is the only committed file that fails `format:check`.
- **Keep and commit `apps/mobile/src/components/Screen.tsx`.** It replaces React Native's deprecated `SafeAreaView` with the one from `react-native-safe-area-context`, which is correct.
- **Commit the organized assets** (the reviewer added them on 2026-11-03; don't rename or move them):
  - `apps/mobile/assets/illustrations/` holds 3 illustrations at @1x/@2x/@3x.
  - `apps/mobile/assets/icons/billers/` holds 3 biller-category icons at @1x/@2x/@3x.
  - `apps/mobile/assets/source/` holds the originals, the 1024 px cutouts and a `README.md` manifest.

  Don't `require()` any of them in Phase 6. Wiring them into screens is Phase 7.

### 0.2 Fix "Add New Biller" in the admin console

- **Bug:** `apps/admin/src/app/billers/BillersClient.tsx` calls `supabase.rpc('admin_register_biller', …)`. That function does not exist; the real one is `admin_create_biller`.
- **Fix:** call the existing server action in `apps/admin/src/app/actions.ts` (it already calls `admin_create_biller`), then refresh the list.
- **Verify:** create a biller from the UI on the live database. It should appear with a settlement account and an audit entry.

### 0.3 Fix the 9 broken live tests

These scripts have never run against a real database before, and the failures are test bugs, not app bugs. Fix each test so it checks the right behavior.

| Suite            | Test                                                  | Fix                                                                                                                                                                                                                         |
| ---------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test:qr`        | create, pay and idempotent-retry of a payment request | Use the real parameter names: `create_payment_request(p_requester_account, p_payer_account_number, p_amount, p_note)` and `pay_payment_request(p_request_id, p_from_account, p_idempotency_key)`                            |
| `test:fx`        | schema and RLS "string checks"                        | Delete the source-text checks (they look for `numeric(12, 6)`; the column is `numeric(18,8)`). Instead, assert behavior live: a customer can read `fx_rates`; inserts and updates are rejected                              |
| `test:admin`     | adjustment credit                                     | The function returns no `new_balance`. Assert instead that an `adjustment` transaction exists, a credit ledger entry exists, and the balance rose by the amount                                                             |
| `test:rls`       | admin DELETE on `audit_logs`                          | RLS matches 0 rows silently rather than raising an error. Assert that the audit row count is unchanged after the attempt                                                                                                    |
| `test:money`     | withdrawal over balance                               | Use an amount **above the balance but below the ₱5,000,000 cap**, and assert the error says "Insufficient funds"                                                                                                            |
| `test:schedules` | reconciliation                                        | Replace "global credits = debits" (wrong, because deposits and adjustments are single-entry) with two checks: per-account balance = ledger sum, and every `transfer` / `reversal` / `bill_payment` transaction nets to zero |

**Gate:** all 7 live suites report **0 failed**, each with the connection line.

### 0.4 Run the scheduler every 5 minutes

- **Change:** in a new migration, update `public.register_cron_jobs()` so `davao-run-schedules` uses `*/5 * * * *` (it is currently `0 * * * *`).
- **Run it** once against the live database (`select public.register_cron_jobs();`).
- **Verify:** `select jobname, schedule from cron.job` shows the new schedule.

### 0.5 Make the FX sync actually run

1. **Deploy the function:** `npx supabase functions deploy fx-sync`.
2. **Secure the function:**
   - Create a random `FX_SYNC_SECRET`.
   - Store it as a function secret with `npx supabase secrets set FX_SYNC_SECRET=…`.
   - Store the same value in **Supabase Vault** with `vault.create_secret`.
   - `fx-sync` must reject any request without a matching `x-fx-sync-secret` header with **401**. Today it accepts any caller with a valid JWT, including the public anon key shipped in the app.
3. **Register the real job:** `register_cron_jobs()` registers `davao-daily-fx-sync` to `net.http_post` the function URL. It reads the secret from `vault.decrypted_secrets` **at run time**.
   - **No key or secret may be written into `cron.job.command`.**
   - **Remove** the `app.settings.service_role_key` / `app.settings.edge_function_url` approach.
4. **Verify:**
   - Trigger the function once.
   - `cron.job_run_details` shows success.
   - `fx_rates.fetched_at` updates for the latest date.
   - A call without the header returns 401.
   - Querying `cron.job` shows no secret.

### 0.6 Make the role-change guard check the caller explicitly

- **Problem:** `guard_profile_self_update()` is `SECURITY DEFINER`, so `current_user` inside it is always the function owner. Its check `current_user in ('service_role','postgres',…)` is therefore always true, which makes the real rule "no signed-in user ⇒ allowed".
- **Fix (new migration):** recreate the trigger function as **`SECURITY INVOKER`** with this logic:
  - `current_user` in (`service_role`, `postgres`, `supabase_admin`) → allow;
  - otherwise → require `public.is_admin()` for any change to `role` or `status`.

  `is_admin()` is itself `SECURITY DEFINER`, so it still works from an invoker trigger.

- **Tests:** add these to both `test:db` and the live suites.

  | Caller                              | Expected result    |
  | ----------------------------------- | ------------------ |
  | `service_role` sets `admin`         | Allowed            |
  | Customer changes own role or status | Rejected           |
  | `anon`                              | Rejected or 0 rows |
  | Admin suspends a customer           | Allowed            |
  | `cron` / `postgres`                 | Allowed            |

### 0.7 Repair logins that have no profile

- **Problem:** `roncheta@gmail.com` signed up on 2026-10-23, before the tables existed. That login has no profile and no account, and the app shows it as "Customer, ₱0.00".
- **One-off backfill (new migration, idempotent):** for every `auth.users` row without a profile, create the profile (full name from `raw_user_meta_data` or the email prefix) and one default savings account. Use the same account-number generation as `handle_new_user`.
- **Self-heal:** add `public.ensure_my_profile()` (`SECURITY DEFINER`, granted to `authenticated`). It creates the profile and account for `auth.uid()` only if they are missing, and returns them. The mobile app calls it after login if no profile is found.
- **Admin console:** Users gains a "Needs attention" filter that lists logins without a profile.

### 0.8 Small fixes found on the simulator

- **App name:** set `apps/mobile/app.json` `name` to **"Davao Bank"** (the splash currently says "mobile"). Keep `slug` and `scheme` unless changing them is required.
- **Avatar fallback:** when a profile has no name, show a neutral person icon instead of the initials "DB".

### 0.9 Critical flow fixes (from the UI/UX audit)

The reviewer ran the app on an iPhone 17 Pro Max simulator and found these bugs. They break trust in money flows, so they're fixed now rather than in the Phase 7 redesign.

**Scope:** behavior only. Don't restyle anything, and don't change the order or number of steps in any flow. Copy changes are limited to the error mapper in item 4 and the confirmation dialogs in item 6.

1. **Result screens are never seen, and the next open shows a stale receipt.**
   - **Problem:** `HomeScreen.tsx` closes each sheet inside its `on*Success` callback (the Transfer, Deposit, Withdraw and Pay Bills handlers). The modals also keep their `success` step when they're closed from outside.
   - **Observed:** after a ₱500 cash-in the sheet closed at once. Reopening Cash-in showed the old receipt with "Updated Balance ₱75,700.00", but the real Savings balance was ₱75,200.00.
   - **Fix:**
     - `on*Success` only refreshes data (`loadData()`). "Done" closes the sheet.
     - Every money modal resets to step 1 whenever `visible` becomes `true`.
     - Result screens take amount, timestamp and id from the server response. "Updated Balance" comes from the refreshed account, never from `balance ± amount`.
2. **Sheets can be dismissed mid-flow and while processing.**
   - **Problem:** `BottomSheet` calls `onClose` on a backdrop tap, Android back and the X, in every state. A single backdrop tap on Transfer Review discarded the whole transfer.
   - **Fix:**
     - Add two props to `BottomSheet`: `dismissible` (default `true`) and `onRequestDismiss`.
     - While a request is in flight: `dismissible={false}` (backdrop, back and X do nothing), and Back buttons are disabled.
     - When the form has input, a dismissal attempt asks first. Use `Alert`: title "Discard this transfer?" (or payment, request, etc.), body "Your details will be lost.", buttons Keep editing / Discard.
     - Android back on step 2 or later goes back one step.
3. **QR payment with an amount always fails.**
   - **Problem:** `TransferModal.tsx` jumps to `review` on a QR prefill without creating an idempotency key, so the server rejects it with "Idempotency key is required".
   - **Fix:** create the key on that path too. Run the same recipient checks (10 digits, not the same account) on prefilled recipients.
4. **Raw backend errors are shown to users.**
   - **Fix:** add one shared mapper `toUserMessage(error)` in `packages/shared`. Use it in every flow and in the auth screens.

   | Server or Supabase text (match)       | User sees                                                         |
   | ------------------------------------- | ----------------------------------------------------------------- |
   | `Insufficient funds%`                 | Not enough balance. You have ₱X available.                        |
   | `Recipient account number not found%` | We couldn't find that account. Check the 10 digits.               |
   | `%not active%`                        | This account can't send or receive money right now.               |
   | `Invalid reference format%`           | That reference doesn't look right. Check your bill and try again. |
   | `%no longer pending%`                 | This request was already paid, declined or cancelled.             |
   | `Invalid login credentials`           | That email and password don't match. Try again.                   |
   | network or fetch failure              | You appear to be offline. Nothing was sent.                       |
   | anything else                         | Something went wrong. No money was sent. Try again.               |

   In `__DEV__`, log the original message.

5. **New idempotency key when the payload changes.**
   - **Problem:** the key survives Back + edit, so a retry after an edit can replay the old transaction.
   - **Fix:** regenerate the key whenever the amount, recipient, biller, reference or source account changes. Keep it unchanged only across retries of the identical payload.
   - **Replays:** if the response has `idempotent_replay: true`, the result screen says "This payment was already processed".
6. **Decline and Cancel request act without confirmation.**
   - **Fix:** in `PaymentRequestsModal`, Decline asks "Decline this request?" (body "The requester will see it as declined.", buttons Keep / Decline). Cancel asks "Cancel this request?" with buttons Keep / Cancel request.
   - **Double tap:** set `actionLoadingId` _before_ authorization, so a double tap can't open two prompts.
7. **The balance card shows the total under a single-account label.**
   - **Problem:** `HomeBalanceCard` shows `totalBalance` under "Savings · 1030438921" with "Total Available Balance". The real Savings balance was ₱74,700, but the card said ₱75,200.
   - **Fix:** show the selected account's balance. Label the account from its type (don't hard-code "Savings").
8. **Unknown transaction types render raw.**
   - **Fix:** add one shared `typeLabel()` covering all 7 types, including `bill_payment` → "Bill payment".
   - Use it in `TransactionRow`, `TransactionDetailModal` and the Activity empty state.
   - Badge text is sentence case ("Reversed", "Pending", "Failed").
   - Pending and failed rows get a badge.
9. **The first tap after typing only closes the keyboard.**
   - **Fix:** add `keyboardShouldPersistTaps="handled"` to every `ScrollView` and `FlatList` inside a form or sheet.
10. **Scheduled transfers to other customers fail.**
    - **Problem:** `executeScheduledTransfer` looks up the destination with `from('accounts')`, and RLS hides other customers' accounts. The user sees "Destination account was not found or is inactive."
    - **Fix (new migration, approved by the owner on 2026-11-03):** add `public.create_scheduled_transfer_to_number(p_from_account uuid, p_to_account_number text, p_amount bigint, p_frequency text, p_start_date date, p_end_date date, p_max_runs int, p_note text)`:
      - `SECURITY DEFINER`, with `set search_path = public, auth, pg_temp`.
      - Granted to `authenticated` only.
      - It resolves the active account by number, raising `Recipient account number not found` otherwise, then calls the existing `create_scheduled_payment` with `p_kind = 'transfer'`.
      - **Don't change `create_scheduled_payment` or its signature.**
    - **Listing:** add `public.list_my_scheduled_payments()`. It returns the caller's schedules with `to_account_last4` (and the biller name for bills), so the list stops showing a UUID fragment.
    - **Tests:** add both functions to `test:db` and `test:schedules`:
      - A customer schedules to another customer: allowed.
      - Scheduling to a nonexistent number: the not-found error.
      - Scheduling from someone else's account: rejected.
      - The list returns only the caller's rows.

**0.9 gate:** a screen recording on the iOS simulator for each money flow (Transfer, Cash-in, Cash-out, Pay Bills, Pay request), linked in the report. Each recording shows:

- the result screen staying up;
- tapping Done, reopening the sheet and landing on step 1;
- a backdrop tap during processing doing nothing;
- the discard dialog appearing when input exists.

Also, the QR-with-amount payment succeeds once live, and a scheduled transfer to `customer2` is created live.

Stage A then turns these same checks into Maestro flows, so they're checked automatically from then on.

**Stage 0 gate:**

- all 7 live suites pass (0 failed);
- `test:db` passes, including the new 0.6 checks;
- the biller UI works live;
- the FX job is verified;
- typecheck, lint, format:check, `build:admin` and `expo export` all pass.

---

## Stage A — Automated testing and CI

1. **Unit tests**
   - Use `jest-expo` for mobile and `packages/shared`, and Jest + React Testing Library for admin.
   - Cover:
     - `formatCentavosToPHP`, `phpToCentavos` (including rounding edge cases and no float drift);
     - `generateIdempotencyKey`;
     - QR encode/parse (all accept and reject cases from Stage D);
     - the confirmation helper's decision logic (biometrics, password fallback; never succeeds without a check);
     - render tests for `Button`, `AmountText` (including the masked state), `TransactionRow` and `EmptyState`.
   - Commands: `npm run test:unit` at the root.
2. **Database tests**
   - Keep `test:db` (PGlite) as the offline suite.
   - Add every Stage 0 behavior to it.
3. **End-to-end tests**
   - **Mobile:** Maestro flows that run against Expo Go:
     - log in as customer1 → cash-in → transfer to customer2 → see it in Activity → pay a demo biller → schedule a bill → sign out;
     - wrong password;
     - insufficient funds;
     - the 0.9 checks for each money flow: the result stays up, a reopened sheet lands on step 1, a backdrop tap during processing does nothing, and the discard dialog appears.
   - **Admin:** Playwright against the local dev server:
     - log in as admin → suspend and reactivate customer2 → adjust a balance (credit) → reverse a transfer → see audit entries;
     - a non-admin is redirected to `/unauthorized`.
   - Both use the seeded test accounts.
   - Put the flows in `e2e/`, and document how to run them in the README.
4. **CI**
   - Add `.github/workflows/ci.yml`. On every push and pull request it runs: install → typecheck → lint → format:check → `test:unit` → `test:db` → `build:admin` → `expo export` → secret scan (gitleaks).
   - CI needs **no secrets**. The live suites and E2E tests stay manual, because they need the hosted database.

**Stage A gate:** all of these run green locally, and the CI workflow file passes `act` or a dry review. The owner pushes the branch to trigger the real run.

---

## Stage B — Security hardening

1. **Supabase advisors:** run the database linter / Security Advisor (`npx supabase db lint` and the dashboard advisor). Fix every warning, or document why it is acceptable.
2. **Function grants**
   - Revoke `EXECUTE` from `anon` (and `public`) on every client money, admin and profile function; grant only to `authenticated`.
   - Add `alter default privileges in schema public revoke execute on functions from public, anon;` so new functions start closed.
   - Test:
     - an `anon` RPC to `transfer` is rejected with "permission denied";
     - every app call still works (the reviewer's check: all 29 `.rpc()` calls).
3. **RLS audit**
   - Write `scripts/audit-rls.ts` (or a SQL check in `test:db`). It must fail if any public table lacks RLS, or if a policy uses `using (true)` outside an allow-list (`health_check`).
   - Restrict `fx_rates` and `billers` reads to `authenticated`, not `anon`.
4. **Auth settings** (the owner approves dashboard changes; put what you can in `supabase/config.toml`, and list the dashboard steps in the report):
   - email confirmation on;
   - minimum password length 10, with letters and digits;
   - rate limits for sign-in, sign-up and OTP;
   - JWT expiry 3600 s with refresh-token rotation;
   - leaked-password protection, if the plan supports it (otherwise document that it is a production requirement).
5. **Secure session storage on mobile**
   - Replace AsyncStorage for the Supabase session with **`expo-secure-store`**.
   - Use the "large secure store" pattern from the Supabase React Native guide: an AES key kept in SecureStore, with the encrypted session in AsyncStorage. This is needed because SecureStore values are size-limited.
   - Verify that login survives an app restart.
6. **App-switcher privacy:** when the app moves to the background, cover the screen (or hide balances) so the iOS/Android app switcher never shows balances.
7. **Admin hardening**
   - Security headers in `next.config.ts`: Content-Security-Policy (self + the Supabase URL), `frame-ancestors 'none'`, Strict-Transport-Security, Referrer-Policy, Permissions-Policy.
   - **Auto sign-out after 15 minutes idle**, with a 1-minute warning.
   - Confirm that the session cookies are `HttpOnly`, `Secure` (in production) and `SameSite=Lax`.
8. **Error sanitizing**
   - Map database errors to friendly, safe messages in both apps. Never show raw SQL, constraint names or stack traces.
   - Keep the server messages that are meant for users, for example "Insufficient funds".
9. **Dependencies and secrets**
   - Fix every high and critical item from `npm audit`.
   - Run gitleaks over the full git history.
   - Move the seed password out of `scripts/seed.ts` into an env var (`SEED_PASSWORD`, with the current value as the dev default in `.env.example` only), and add a README warning that it must be changed before any public demo.
10. **Security review document:** `docs/SECURITY_REVIEW.md`, containing:
    - a short threat model (who could attack, what they could try);
    - every control and where it lives;
    - what this phase found and fixed;
    - remaining risks;
    - **prototype vs production limits**: KYC/AML, PCI, licensing, real rails. Also note that **RA 8791 Sec. 64** bars presenting an unlicensed entity as a bank, so any public build must be labelled "Davao Bank (Demo) — academic prototype, not a licensed bank".

**Stage B gate:**

- every live suite and `test:db` still pass;
- the new grant and RLS-audit tests pass;
- the advisor is clean (or each remaining warning is documented);
- the secure-store login survives a restart (screenshot);
- the headers are visible in `curl -I` against the admin dev server.

---

## Stage C — Quality checks on real devices

1. **Accessibility**
   - A contrast check script over the shared color tokens: text pairs must be ≥ 4.5:1, and large text and icons ≥ 3:1.
   - A VoiceOver/TalkBack pass on Home, Transfer, Activity and Profile.
   - Text at 130% and 200%: no clipped text or overlaps.
   - Reduce Motion on: no animations.
   - Touch targets ≥ 44 pt.
   - Record what you found and what you fixed.
2. **Performance:** time cold start → Home and tab switches on the iOS simulator and an Android emulator. The target is under 2 s for key screens. Record the numbers.
3. **Dropped connection mid-transfer**
   - Simulate losing the network after submitting.
   - The app must show "Checking status…" and retry with the **same** request key.
   - Prove that exactly one transaction is created, no matter how many retries happen.
4. **Test checklist:** `docs/UAT_CHECKLIST.md` covers every feature, with pass/fail and a screenshot for each step, on an iPhone simulator and an Android emulator. A physical phone is needed for QR scanning; if none is available, record it as not tested.
5. **Limitations list:** `docs/LIMITATIONS.md` gives a plain list of what is simulated and what a production bank would need, for the capstone write-up.

**Stage C gate:** the checklist is complete, the accessibility and performance notes are recorded, and the dropped-connection test proves a single transaction.

---

## Final completion criteria

1. All 7 live suites, `test:db`, `test:unit` and both E2E flows pass. Every live result shows the connection line.
2. Stage 0 carry-overs done: the biller UI works, the scheduler runs every 5 minutes, FX sync runs securely via Vault, the guard trigger is explicit, profile-less logins are repaired, and the app name is "Davao Bank".
3. Critical flow fixes (0.9) done:
   - result screens stay up and reset;
   - sheets lock while processing and confirm before discarding;
   - QR-with-amount works;
   - errors are mapped;
   - keys regenerate on edit;
   - Decline and Cancel confirm;
   - the balance card matches its label;
   - every type has a label;
   - scheduled transfers to other customers work.
4. Security hardening done: grants are closed to `anon`, the RLS audit and Supabase advisor are clean, sessions use secure storage, the admin has security headers and idle timeout, errors are sanitized, `npm audit` has no high or critical items, and gitleaks is clean.
5. The CI workflow exists and passes without secrets.
6. `docs/SECURITY_REVIEW.md`, `docs/UAT_CHECKLIST.md` and `docs/LIMITATIONS.md` exist and are filled in.
7. typecheck, lint, format:check, `build:admin`, `expo export` and the secret-leak check all pass.

## Do NOT

- Build Phase 7–9 work: no redesign of tiles or Home, no savings goals, no security center, no onboarding.
- Change money logic, function signatures, or anything the 29 app `.rpc()` calls depend on. Two exceptions: grant changes, and the two new functions in 0.9 item 10, which wrap existing logic.
- Install `react-native-reanimated` or `react-native-gesture-handler`. They arrive in Phase 7.
- Edit earlier migrations, weaken any RLS policy, or grant client access to internal functions.
- Write any secret into a migration, `cron.job`, a client bundle or git.
- Report a live result without the `✓ Connected to live database` line.

_The reviewer will review each stage commit: re-running the live suites, `test:db` and the new tests, checking `cron.job` and `job_run_details`, and inspecting headers and grants on the live project — not relying on the report alone._

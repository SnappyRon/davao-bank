# Phase 8 · Stage C — Frontend Notes (`phase-8-frontend`)

- **Branch:** `phase-8-frontend` (from `af8b3aa`)
- **Worktree:** `/Users/ronalbert/Personal Projects/davao-bank-p8-ui`
- **Role:** `frontend-4`

## What was built

1. **Local Phase 8 Shared Contract module (`apps/mobile/src/hooks/usePhase8Contracts.ts`)**
   - `packages/shared` is maintained in parallel by another agent, so all Phase 8 RPC/table wrappers and types were placed locally in `apps/mobile/src/hooks/usePhase8Contracts.ts` using the exact shared contract names and signatures:
     - `get_security_settings()`, `set_daily_limit(p_limit_centavos)`
     - `lookup_payee(p_account_number)` + `usePayeeLookup` hook
     - `saved_billers` table CRUD + `get_bill_reminders()`
     - `get_monthly_summary(p_month)`
   - Added `phase8UserMessage` mapping `'Daily limit reached'` and range constraint errors cleanly without editing `packages/shared/src/utils/errors.ts`.
   - Normalized single-row vs array RPC returns (`Array.isArray(data) ? data[0] ?? null : data ?? null`) and Postgres `bigint` values via `Number(...)`.

2. **Bantay security center (`apps/mobile/src/screens/BantaySecurityScreen.tsx`)**
   - Linked from Profile → Security (`"Bantay security center"`, `apps/mobile/src/screens/ProfileScreen.tsx`) and registered in `apps/mobile/App.tsx` (`BantaySecurity`).
   - Built on `FeatureScreen` (so `PasswordPromptHost` renders password/TOTP prompts inside the active screen).
   - Displays daily transfer limit, spent today, remaining today, and a plain-`View` usage bar; masks all amounts (`₱••••••`) when `hideBalance` is true.
   - Handles loading (`Skeleton`), empty, and error + `"Try again"` states.
   - Limit changes validate ₱1,000.00–₱500,000.00 (`100000`–`50000000` centavos) and enforce the existing step-up order (`confirmBiometricPayment` → `retryStepUp(() => supabase.rpc('set_daily_limit', ...), promptTotp)`), guarded by `useInFlightGuard`.
   - Links to `TwoStepSetup`, `App lock` (returns to Profile security switches), and `ChangePassword`.

3. **Payee confirmation on Transfer Review step (`apps/mobile/src/screens/transfer/TransferReviewStep.tsx`)**
   - Owner decision D9: calls `usePayeeLookup(recipientAccountNumber)` (`lookup_payee`) **only** inside `TransferReviewStep` (`step === 'review'`).
   - Shows `"Account holder"` (`masked_name`, e.g. `'J*** d*** C***'`) and `"Account type"` (`Savings`/`Checking`) inside `ReviewCard`.
   - Never called or displayed on Recipient, Amount, or Success steps. Non-blocking retry banner on lookup error.

4. **Saved billers & due-date reminders (`PayBillsScreen.tsx`, `BillerStep.tsx`, `SuccessStep.tsx`, `HomeScreen.tsx`, `HomeUpcomingPayments.tsx`)**
   - `BillerStep.tsx`: `"Saved billers"` section with loading skeleton, empty state, error + `"Try again"`, tap-to-pay prefill (jumps to Amount step), inline edit (`nickname` 1–40 chars, optional `due_day` 1–28, `remind` switch), and delete via `useConfirmSheet()`.
   - `SuccessStep.tsx`: `"Save this biller"` form after paying (`timing === 'now'`), inserting into `saved_billers` when not already saved.
   - `PayBillsScreen.tsx`: supports optional `{ billerId, reference }` route params from Home reminders (with `useRoute` wrapped safely in `try/catch` for tests without route context).
   - `HomeScreen.tsx` & `HomeUpcomingPayments.tsx`: fetches `get_bill_reminders()` and renders due-within-7-days reminders (`"Due today"`, `"Due tomorrow"`, `"Due in N days"`, `"Bill due"` badge) on Home's `"Coming up"` card; tapping navigates to `PayBills` pre-filled.

5. **Monthly money summary (`apps/mobile/src/screens/MonthlySummaryScreen.tsx`, `ActivityScreen.tsx`)**
   - Added `"Monthly summary"` (`"Summary"`) header button on `ActivityScreen.tsx` navigating to `MonthlySummary`.
   - Built `MonthlySummaryScreen` on `FeatureScreen` with month switcher (`Previous month` / `Next month` capped at current month), `Money in` / `Money out` overview card, and per-category rows (`money_in`, `transfers_out`, `bills`, `cash_out`, `adjustments`) with plain-`View` horizontal bars (no new chart dependency).
   - Handles loading, empty, error + `"Try again"`, and `hideBalance` masking.

## Unspecified decisions made

- **Payee lookup placement:** Placed `usePayeeLookup` directly in `TransferReviewStep` instead of `TransferScreen` so `TransferScreen.tsx` stays 100% untouched and the lookup physically cannot run on other steps.
- **Bantay `"App lock"` link:** Displays live `appLock.enabled` status (`On · Lock after 2 minutes` / `Off · Manage in Profile`) and navigates back to Profile's Security switches on press so app-lock state remains owned by Profile / `AppLockContext`.
- **Coming up reminder row tapping:** Added optional `{ billerId, reference }` route params on `PayBills` so tapping a bill reminder on Home pre-fills that biller and reference and lands on the Amount step (or Source step with 2+ accounts).

## Money handler comparison vs `af8b3aa`

- `apps/mobile/src/screens/TransferScreen.tsx`: **0 lines changed** (byte-identical to `af8b3aa`). `handleConfirmTransfer`, `executeScheduledTransfer`, and `executeServerTransfer` are untouched.
- `apps/mobile/src/screens/PayBillsScreen.tsx`: `handleSubmitPayment` (biometric/password prompt, `retryStepUp`, `pay_bill`, `create_scheduled_payment`, and `idempotencyKey` handling) is **byte-identical** to `af8b3aa`. Only saved-biller CRUD/prefill state and UI props were added outside the payment handler.

## Check outputs

- `npm run typecheck`: exit 0 (`admin`, `mobile`, `@davao-bank/shared` all passed)
- `npm run lint`: `✖ 63 problems (0 errors, 63 warnings)` (0 errors; 0 new warnings in added/edited files)
- `npm run format:check`: `All matched files use Prettier code style!`
- `npm run test:unit`: `Test Suites: 42 passed, 42 total`, `Tests: 355 passed, 355 total` (includes 4 new RNTL suites: `bantay_security_screen.test.tsx`, `payee_lookup_review.test.tsx`, `saved_billers_and_reminders.test.tsx`, `monthly_summary_screen.test.tsx`, plus Profile navigation test in `profile_screen.test.tsx` and RPC-name routing in `transfer_screen.test.tsx`)
- `npm run test:db`: `118 passed, 0 failed`

## NOT VERIFIED items

- **Live Phase 8 backend integration & hosted DB:** NOT VERIFIED — backend migrations/RPCs (`get_security_settings`, `set_daily_limit`, `lookup_payee`, `saved_billers`, `get_bill_reminders`, `get_monthly_summary`) are implemented in parallel by the backend agent and were mocked in RNTL tests.
- **iOS/Android simulator & physical device rendering, keyboard behavior, 1.4× text scaling, and VoiceOver:** NOT VERIFIED — no simulator or device run in this session.

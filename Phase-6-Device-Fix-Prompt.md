# Davao Bank — Phase 6 Device Fix Prompt (password confirmation never appears on iOS)

Branch: `phase-6-hardening`. Do not push. One commit titled `Phase 6 · Device fix — password confirmation inside sheets`.

## The defect (found by the reviewer on the iPhone 17 Pro Max simulator, 2026-11-06)

**Severity: blocker.** On iOS, every money action that falls back to password confirmation hangs forever.

Steps to reproduce:

1. Use a device with no Face ID enrolled, or switch biometrics off in the app's settings.
2. Transfer → saved recipient → ₱1 → Review → **Authorize Transfer**.
3. The button spins forever. No password prompt appears, and Back and Close stay disabled. The only way out is to force-quit the app. No money moves.

Cause: `decideConfirmation` falls back to `promptPassword()`. That opens `PasswordConfirmationModal`, a native `<Modal>` rendered at the root in `SettingsContext`. iOS refuses to present a second root modal while the `BottomSheet` `<Modal>` is already presented, so the promise never resolves. Device log (`docs/uat-evidence/ios/06-password-fallback-hang.log`):

```
Attempt to present <RCTFabricModalHostViewController> on <EXRootViewController> ... which is already presenting <RCTFabricModalHostViewController>.
```

Every caller is affected: `TransferModal`, `WithdrawModal`, `PayBillsModal`, `PaymentRequestsModal`, `ScheduledPaymentsModal`. Unit tests didn't catch it because `decideConfirmation` is tested with a mocked `promptPassword`.

## Fix

1. Render the password prompt **inside whichever modal is on top**, never as a second sibling root modal.
   - Turn `PasswordConfirmationModal` into a plain overlay view (absolute fill, no `<Modal>`), for example `PasswordPromptOverlay`.
   - Render it inside `BottomSheet`'s `<Modal>`, the same way `PrivacyOverlay` already is.
   - Keep one root-level instance for prompts raised when no sheet is open.
   - Make sure exactly one instance renders at a time: the top-most one. A simple approach is a context counter or stack of open sheets, so the newest open sheet's host shows the prompt and the root host shows it only when no sheet is open.
   - Do the same for `FXRatesModal` and `NotificationsModal` only if a money confirmation can be raised from them. If none can, say so in the report.
2. Keep all current behaviour of the prompt:
   - title and message;
   - password check through `signInWithPassword`;
   - wrong password shows an error and stays open;
   - **Cancel** resolves `{ success: false, cancelled: true }`;
   - the privacy overlay still covers it in the app switcher;
   - the keyboard doesn't hide the input (`KeyboardAvoidingView` and `keyboardShouldPersistTaps="handled"`).
3. Add a safety net in `confirmMoneyAction`: if the prompt is not visible within about 2 seconds of being requested, resolve `{ success: false, error: 'Could not show the confirmation prompt. Please try again.' }`. A missing prompt must never hang the flow, and must never authorize anything.
4. Re-check biometric support when the app returns to the foreground (`AppState` → `active`), not only at launch, so enrolling Face ID mid-session takes effect.

## Tests

- **Component test:** render `BottomSheet` with a pending password request and assert that the prompt renders inside the sheet. Cancel must resolve `cancelled: true`, and only one prompt instance may exist.
- **Unit test:** the 2-second safety net resolves to failure and never to success.
- **Manual proof on the iOS simulator, with no Face ID enrolled, for each action:**
  - Transfer ₱1, Cash-out ₱1, Pay Bills ₱1, and paying an incoming request (if a fixture exists).
  - For each: the prompt appears over the sheet, Cancel returns to Review with the "cancelled" message, and the correct password completes the action.
  - Take one screenshot per action into `docs/uat-evidence/ios/`. **Do not** type or log the password in any file.
- Then run `format:check`, `lint`, `typecheck`, `test:unit`, `test:db`, `test:money`, and add a short "Device fix" section to `PHASE6_REPORT.md`.

## Do NOT

- Do not change `decideConfirmation`'s rule that success requires a passed biometric or password check.
- Do not change server functions, migrations or idempotency logic.
- Do not mark UAT rows as passed. The reviewer re-runs the device checklist after this fix.

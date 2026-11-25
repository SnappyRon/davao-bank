Taken over by Antigravity from fe-cline-3 (commit b562000).

Status: Stage 8F completed and hardened — Bantay timeline, lock and risk challenge (mobile). All tests, typecheck, lint, and format pass.

COMPLETED:

- Risk challenge call site wiring:
  - `TransferScreen.tsx`: fixed illegal nested hook call inside async callback; cleanly wired `useRiskChallenge` at the call site for both instant and scheduled transfers; on `Confirmation required`, opens `RiskChallengeSheet`, calls `confirm_risky_payment` with identical idempotency key, and re-invokes transfer; cancel/lock paths handled; handler bodies byte-identical.
  - `PayBillsScreen.tsx`: wired `useRiskChallenge`; on `Confirmation required`, opens `RiskChallengeSheet` and repeats with same idempotency key; handler bodies byte-identical.
  - `PaymentRequestsScreen.tsx`: wired `useRiskChallenge`; on `Confirmation required`, opens `RiskChallengeSheet` and repeats with same idempotency key; handler bodies byte-identical.
- `BantaySecurityScreen.tsx`:
  - Status card: "Protected" or "Locked" with countdown ("You can unlock at 3:41 PM" or "Unlock request is ready").
  - "Lock my account" button with confirmation sheet calling `lock_my_account` RPC.
  - Unlock flow: Request unlock (`request_unlock` RPC) -> countdown -> complete unlock (`complete_unlock` RPC).
  - Security timeline on `GroupedList` using `get_security_timeline`: renders kind icon, title, AI explanation or template fallback, timestamp, and open event actions ("This was me" calls `mark_event(id, 'confirmed_me')`; "Not me" opens confirm sheet and calls `mark_event(id, 'reported_not_me')` and locks account).
  - Offline banner, loading skeleton, error state with retry.
- Device registration & password change:
  - `apps/mobile/src/utils/deviceRegistration.ts`: SecureStore-backed `install_id` generator/retriever; `registerDeviceOncePerSession()` called once per session on sign-in / session restore.
  - `ChangePasswordScreen.tsx`: calls `registerPasswordChangeRpc()` after password change success.
- Realtime alerts:
  - `App.tsx`: `BantaySessionTracker` subscribes to Realtime `security_events` inserts; triggers toast notification and refreshes/increments Inbox badge on high severity; cleanly unsubscribes on sign-out.
- App-wide locked state:
  - `HomeScreen.tsx`: displays locked account banner linking to Bantay Security; action tiles show toast "Account locked — Unlock in Bantay".
- RNTL tests:
  - `apps/mobile/src/__tests__/bantay_security_screen.test.tsx`: 14 tests covering loading, empty state, error recovery, balance masking, navigation, daily limit validation, step-up retry, status card, lock/unlock countdown flow, and timeline event actions.
  - `apps/mobile/src/__tests__/risk_challenge.test.tsx`: 3 tests covering challenge sheet display on "Confirmation required", confirmation calling `confirm_risky_payment` and repeating transfer with identical idempotency key, cancellation, and "Not me" locking account.
  - `apps/mobile/src/__tests__/device_registration.test.ts`: 3 tests covering install_id generation/persistence in SecureStore, once-per-session device registration, and password change registration.
- Checks:
  - `npm run typecheck`: exit 0 (all workspaces pass)
  - `npm run lint`: 0 errors
  - `npm run format:check`: 100% clean
  - `npm run test:unit`: 44 suites passed, 368 tests passed (0 failed)

NOT VERIFIED:

- Real device lock/unlock flow on physical iOS/Android device
- Hosted Supabase migrations (handled by captain/reviewer per hard rules)

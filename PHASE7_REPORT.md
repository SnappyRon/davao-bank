# Davao Bank — Phase 7 Report: UI/UX Refinement & Motion

## Overview

Phase 7 refines the visual hierarchy, layout consistency, motion, typography, and accessibility across Davao Bank's mobile application. It implements decisions D1–D7 (full-screen feature pages, compact 3×2 Home action grid, floating translucent tab bar, Kada and Duri mascots, selective translucency) while strictly preserving all database, security, and strong authentication invariants established in Phase 6 and 6.5.

- **Branch:** `phase-7-ui-motion` (created from `phase-6-5-strong-auth`)
- **Date:** 2026-11-08
- **Current Stage:** Stage 7A — Foundations

---

## Stage 7A.0 — Pre-Implementation UI/UX & Codebase Audit

Before modifying typography, tokens, or shared components, a complete audit of the existing mobile codebase was conducted across navigation structures, modal patterns, spacing anomalies, and interaction lag.

### 1. Baseline Inventory & Screenshot Evidence

The baseline state incorporates the device checks from Phase 6 and 6.5 recorded in `docs/uat-evidence/ios/` and `docs/uat-evidence/ios-6.5/`:

- **Main App Screens:**
  - `HomeScreen` (`01-home.png`): Green gradient balance card, 6 large solid-color action tiles (2×3), Currency Watch card, Upcoming Payments list, Recent Activity.
  - `ActivityScreen` (`12-activity.png`): Filter chips, search bar, and transaction list.
  - `InboxScreen`: Notifications list with unread state indicators.
  - `ProfileScreen` (`02-set-up-now-profile.png`): Profile card, list rows, floating full-width "Two-step verification" button, and app lock controls.
  - `LoginScreen` / `SignUpScreen`: Authentication forms with email/password fields.
  - `LockScreen` (`05-app-lock-after-2min.png`): Password fallback and unlock prompts rendered upon return from background.
- **Accessibility & Scaling Deficiencies:**
  - `14-home-large-text.png`: At accessibility XL, the available balance wraps mid-number, action tile labels split across words, and headers overflow.
  - `13-activity-large-text.png`: Transaction list amounts and filter buttons clip on narrow widths and enlarged type sizes.

---

### 2. Inventory of Modals & BottomSheets (Full-Screen vs. Sheet under Decision D4)

Every modal in `apps/mobile/src/screens` was audited against Decision D4 ("Full-screen features: major features open as full-screen pages, sheets are only for quick actions and confirmations"):

| Current Component            | Current Implementation | Content / Complexity                                            | Decision D4 Destination         | Rationale                                                        |
| ---------------------------- | ---------------------- | --------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------- |
| `TransferModal.tsx`          | `<BottomSheet>`        | 4-step wizard (Recipient, Amount, Review, Result)               | **Full-Screen `FeatureScreen`** | High cognitive load, multi-step flow, sticky footer action.      |
| `PayBillsModal.tsx`          | `<BottomSheet>`        | 6-step wizard (Biller, Reference, Amount, When, Review, Result) | **Full-Screen `FeatureScreen`** | Multi-step form with list selection and review steps.            |
| `DepositModal.tsx`           | `<BottomSheet>`        | 3-step wizard (Amount, Review, Result)                          | **Full-Screen `FeatureScreen`** | Financial mutation requiring review and dedicated result screen. |
| `WithdrawModal.tsx`          | `<BottomSheet>`        | 3-step wizard (Amount, Review, Result)                          | **Full-Screen `FeatureScreen`** | Critical money out flow requiring clear authorization hierarchy. |
| `QRHubModal.tsx`             | `<BottomSheet>`        | 3 tabs (My QR, Scan QR, Request Money)                          | **Full-Screen `FeatureScreen`** | Camera viewport, large QR generation, and amount requests.       |
| `ScheduledPaymentsModal.tsx` | `<BottomSheet>`        | List of active schedules + sub-flow for creation                | **Full-Screen `FeatureScreen`** | Scrollable schedule history and multi-field creation form.       |
| `PaymentRequestsModal.tsx`   | `<BottomSheet>`        | List of incoming requests + pay/decline actions                 | **Full-Screen `FeatureScreen`** | List of pending transactions and review details.                 |
| `ExportStatementModal.tsx`   | `<BottomSheet>`        | Date range selection, preview, share                            | **Full-Screen `FeatureScreen`** | Multi-input filter and document preview.                         |
| `SavedRecipientsModal.tsx`   | `<BottomSheet>`        | List of recipients + add/edit/delete actions                    | **Full-Screen `FeatureScreen`** | Full CRUD list interface.                                        |
| `PersonalDetailsModal.tsx`   | `<BottomSheet>`        | Profile editing form (name, phone)                              | **Full-Screen `FeatureScreen`** | Multi-field user details form.                                   |
| `FXRatesModal.tsx`           | RN `<Modal>`           | Currency picker, chart periods, rate history list               | **Full-Screen `FeatureScreen`** | Complex data visualization and scrolling rate table.             |
| `TransactionDetailModal.tsx` | `<BottomSheet>`        | Transaction receipt, metadata, and share action                 | **Full-Screen `FeatureScreen`** | Receipt layout with reference numbers and action buttons.        |
| `TwoStepSetup.tsx`           | In-line / Modal        | TOTP QR code, secret key display, code input                    | **Full-Screen `FeatureScreen`** | 200 pt QR, security-critical key entry and verification.         |
| `AboutModal.tsx`             | `<BottomSheet>`        | App metadata, version, academic disclaimer                      | **Full-Screen `FeatureScreen`** | Informational text and brand credits.                            |
| _Account Picker_             | In-line / Modal        | List of customer accounts (Savings, etc.)                       | **Stays a `Sheet`**             | Single quick choice, 2–4 rows, contextual to active screen.      |
| _Transaction Filter_         | In-line / Sheet        | Type chips (All, Transfers, Bills)                              | **Stays a `Sheet`**             | Quick filter selection without leaving Activity list.            |
| _Confirmations_              | In-line / Alert        | Discard dirty form, Cancel schedule, Sign out                   | **Stays a `Sheet`**             | 1–2 action confirmation dialogs with clear destructive choices.  |
| _Auth Overlays_              | In-sheet prompt host   | Password prompt, TOTP authenticator prompt                      | **In-window prompt host**       | Rendered inside the active `FeatureScreen` or top-most `Sheet`.  |
| `NotificationsModal.tsx`     | Modal                  | Duplicate code of `InboxScreen.tsx`                             | **DELETE**                      | Dead, orphaned component; unimported in the project.             |

---

### 3. Causes of Cramped Widgets and Empty Gaps

Static code analysis and layout inspection revealed the structural causes of awkward layout spacing across screens:

1. **`marginBottom` Stacking on Parent Gaps:**
   - **File & Line:** `apps/mobile/src/components/TextField.tsx:83` (`marginBottom: spacing.base` = 16 pt).
   - **Root Cause:** When `TextField` is used inside a parent container that defines `gap: 16` or `gap: 24` (e.g. `TransferRecipientStep.tsx:142`, `LoginScreen.tsx:142`, `SignUpScreen.tsx:135`), the component's internal `marginBottom` compounds with the flex gap, generating 32 pt to 40 pt gaps between consecutive fields, but only 16 pt when followed by non-TextField elements.
   - **Fix:** Remove `marginBottom` from `TextField.tsx`. Rely exclusively on parent container `gap` or explicit section spacing.

2. **Arbitrary Content Height Caps in BottomSheet:**
   - **File & Line:** `apps/mobile/src/components/BottomSheet.tsx:77` (`maxHeight: '90%', minHeight: 200`).
   - **Root Cause:** Multi-step wizards change height dramatically between steps (e.g. 1-input amount step vs. 6-row review step). The fixed `maxHeight` combined with lack of dynamic height animations creates clipped inner scroll areas on shorter screens and large empty voids on larger phones.
   - **Fix:** Move major flows to `FeatureScreen` with naturally scrolling content; restrict `Sheet` to quick actions with smooth Reanimated height transitions.

3. **`flex: 1` Spacers Causing Layout Jumps & Remote Buttons:**
   - **File & Line:** `apps/mobile/src/components/Screen.tsx:43`, `apps/mobile/src/screens/transfer/TransferAmountStep.tsx:78`, `apps/mobile/src/screens/pay-bills/ReviewStep.tsx:94`.
   - **Root Cause:** Using `<View style={{ flex: 1 }} />` to push the submit button to the very bottom of the screen causes buttons to float hundreds of points away from inputs on tablets or Max devices, and jump abruptly when the software keyboard opens.
   - **Fix:** Adopt sticky footers padded `16 + insets.bottom` riding directly above the keyboard via `KeyboardAvoidingView` / sticky footer layout.

4. **Inconsistent Side Margins Across Screens:**
   - **File & Line:** `apps/mobile/src/screens/HomeScreen.tsx:392` (`paddingHorizontal: spacing.base` = 16 pt), `apps/mobile/src/components/Screen.tsx:64` (16 pt), vs `packages/shared/src/theme/tokens.ts:11` (`spacing.screenSide: 20` = 20 pt).
   - **Root Cause:** Different screens hardcode `paddingHorizontal: 16` while design tokens specify 20 pt, causing horizontal alignment drift during screen transitions.
   - **Fix:** Standardize screen side margins to 20 pt universally.

5. **Sub-44 pt Touch Targets Violating Human Interface Guidelines:**
   - **File & Line:** `apps/mobile/src/components/Chip.tsx:44` (`height: 32`), `apps/mobile/src/components/Button.tsx:103` (`minHeight: 48`).
   - **Root Cause:** Interactive chips and buttons were styled for visual compactness without extending touch slop to the required 44 pt minimum.
   - **Fix:** Enforce `size.touch = 44` with `hitSlop` and raise standard control heights to `size.control = 52` (`minHeight: 36` on chips).

---

### 4. Interactions Without Immediate Feedback or Double-Trigger Vulnerabilities

1. **Lack of Instant Micro-Interaction on Touch:**
   - **Issue:** All touchables utilize React Native's `TouchableOpacity` with variable `activeOpacity` (0.7 to 0.88). Opacity changes do not convey tactile compression.
   - **Fix:** Replace all touchable instances with unified `Pressable` supporting Motion Pattern 1 (instant 100 ms micro-compression to 0.97 scale and `primaryPressed` background).

2. **Always-On Button Haptic Distortion:**
   - **Issue:** `apps/mobile/src/components/Button.tsx:68` executes `Haptics.impactAsync` on every tap, masking critical success/error haptic signals on transaction outcomes.
   - **Fix:** Remove default press haptics from `Button`; reserve haptics strictly for confirmed results, toggle state changes, and explicit errors.

3. **Double-Tap Vulnerabilities on Action Triggers:**
   - **Issue:** Quick repetitive taps on `ActionTile` in `HomeScreen.tsx:28` or modal open links in `ProfileScreen.tsx:125` can trigger multiple modal mounting cycles or concurrent state updates.
   - **Fix:** Implement ref guards and immediate disabled state upon button press (<100 ms feedback) with busy label transition ("Sending…").

---

### 5. Architectural Remedies for Stage 7A

1. **Typography Repair:** Register actual weights in `tokens.ts` mapping to loaded `PlusJakartaSans_*` font families, stripping synthetic iOS bold weights.
2. **Tokens Alignment:** Update `textMuted`, introduce `borderStrong`, `scrim`, `size.touch` (44), `size.control` (52), and card shadows.
3. **Core Primitives:** Introduce `Pressable`, `FeatureScreen`, `Sheet` (Reanimated + GestureHandler), and `FloatingTabBar`.

---

## Stage 7A Implementation: Foundations

### 1. Typeface Repair (`7A.1`)

- **Font Family Mapping:** In `packages/shared/src/theme/tokens.ts`, registered font families mapped to the exact fonts loaded by Expo:
  - 500: `PlusJakartaSans_500Medium`
  - 600: `PlusJakartaSans_600SemiBold`
  - 700: `PlusJakartaSans_700Bold`
  - 800: `PlusJakartaSans_800ExtraBold`
- **iOS Synthetic Bold Elimination:** Enhanced `Text.tsx` so that on iOS, any `fontWeight` defined on components or passed via styles is removed when a custom font family is present. This prevents iOS CoreText from applying synthetic stroke dilation over already-weighted font glyphs.
- **App-Wide Coverage:** Removed manual `fontWeight` styles across screens and components (`FloatingTabBar`, `Badge`, `AmountInput`, `Chip`, `Logo`, `ActionTile`, `CurrencyWatchCard`, `MyQRTab`, `RequestMoneyTab`, `TransferRecipientStep`, `PaymentRequestsModal`, `FXRatesHero`), ensuring all text weights map to the loaded font files.
- **Input Fields:** Set `typography.amount.fontFamily` on `AmountInput`'s `TextInput` and `typography.body.fontFamily` on `TextField`'s `TextInput`.

### 2. Token Updates (`7A.2`)

- **`colors.textMuted`:** Updated to `#6B6860` (contrast rises to 5.11:1 on canvas, 5.56:1 on surface).
- **`colors.borderStrong`:** Added `#8E887B` for input outlines (3.52:1 contrast against white surface).
- **`colors.scrim`:** Added `rgba(26, 26, 26, 0.5)` for sheet and modal backdrops.
- **`typography.amount`:** Added 32/36, weight 800, tabular figures.
- **`size.touch`:** Added `44` pt minimum hit target.
- **`size.control`:** Added `52` pt control height for inputs and buttons.
- **`elevation.card`:** Added static card shadow (offset 0/2, opacity 0.06, radius 8, Android elevation 2).
- **`motion`:** Replaced with standardized duration and easing tables; deleted `counterDuration`.
- **Token Verification:** `npx tsx scripts/verify-tokens.ts` verified that admin `globals.css` and shared tokens match with 0 drift.
- **Contrast Check:** `npx tsx scripts/check-contrast.ts` confirmed 31/31 token pairs pass WCAG AA standards (text >= 4.5:1, controls/icons >= 3:1).

### 3. Shared Components (`7A.3`)

- **`Pressable`:** Created custom wrapper around RN `Pressable` requiring accessibility roles/labels, enforcing >= 44 pt hitSlop, providing scale and opacity feedback, and completely eliminating `TouchableOpacity` across the codebase.
- **`FeatureScreen`:** Full-screen feature container implementing Decision D4:
  - 44 pt Back button with step indicator ("Step X of Y") and screen title.
  - Sticky footer with safe-area padding riding above keyboard.
  - Dirty form guard (`Alert.alert` with discard confirmation).
  - Processing lock (blocks back navigation and gestures during transaction submission).
  - Built-in `PasswordPromptHost` to host in-screen password and authenticator TOTP prompts.
  - Translucent header on scroll via `BlurView` with `reduceTransparency` fallback.
- **`Sheet`:** Replaces `BottomSheet` for quick actions only (1–2 inputs, confirmations, pickers):
  - 36×4 drag handle, header with close button, scrolling body, sticky footer.
  - Dynamic `maxHeight: '90%'`.
  - In-sheet `PasswordPromptHost` maintaining prompt continuity.
- **`FloatingTabBar`:** Floating bottom navigation bar implementing Decision D5:
  - 64 pt pill floating 16 pt from sides and `8 + bottom safe-area inset`.
  - Translucent `BlurView` backdrop with solid fallback.
  - 4 tabs with icons and always-visible labels (12/600).
  - Active pill in `primaryTint`, selection haptic on tab switch.
  - Automatically hidden when keyboard opens.
- **`ResultView`:** Standardized transaction outcome screen supporting 4 states (Completed, Scheduled, Request sent, Failed) with dedicated icons, amount display, metadata card, and Done action.
- **`Button`:**
  - `minHeight: 52`, pill radius, `bodyStrong` (16/600).
  - `primaryPressed` scale 0.98.
  - Disabled state uses `surfaceSubtle` with `textMuted` (no opacity).
  - Loading state preserves title text and replaces icon with spinner, setting `accessibilityState={{ busy: true }}`.
  - Removed default press haptic.
- **`TextField` & `AmountInput`:**
  - Removed `TextField`'s `marginBottom` so parent containers control spacing.
  - Uses `borderStrong` switching to `primary` on focus and `redText` on error.
  - `AmountInput` uses `decimal-pad` keyboard, live grouping (`5,000.00`), and 36 pt preset chips setting amounts.
- **`Chip`:** `minHeight: 36` + hitSlop, `accessibilityRole="button"`, `accessibilityState={{ selected }}`.
- **`Badge`:** 24 pt height, sentence case, `typography.fonts.semiBold`.
- **`Toast`:** Global queue with `AccessibilityInfo.announceForAccessibility` and slide/fade motion.
- **`EmptyState`:** Scrollable container for pull-to-refresh compatibility with optional illustration support.
- **`ListRow`:** Divider uses `border` color.
- **`NotificationsModal.tsx`:** Deleted orphaned, unimported file.

### 4. Libraries & Infrastructure (`7A.4`)

- Installed `react-native-reanimated` (4.7.1), `react-native-gesture-handler` (~3.3.0), `react-native-worklets` (0.13.0), and `expo-blur` (~58.0.5).
- Configured `babel.config.js` with `react-native-reanimated/plugin`.
- Wrapped application root in `GestureHandlerRootView` in `App.tsx`.
- Configured Jest environment mock in `tests/setup/mobile-setup.ts` to support worklets, Reanimated, and Gesture Handler during testing.

### 5. Stage 7A Gate Verification

- **Contrast Check:** 31/31 token pairs PASS (`scripts/check-contrast.ts`).
- **Touchables:** `grep -R "TouchableOpacity" apps/mobile/src` returns 0 matches.
- **Unit Tests:** 75/75 passing across all 3 workspaces (`test:unit`).
- **Database / Behavioral Tests:** 90/90 passing in PGlite harness (`test:db`).
- **Typecheck:** Clean 0 errors across mobile, admin, and shared (`typecheck`).
- **Lint:** 0 errors across the repository (`lint`).
- **Build / Bundle:** `npx expo export` bundles cleanly for iOS, Android, and Web with 0 errors.

---

## Stage 7A — Reviewer verification and fixes (Claude Code, 2026-11-09)

The review of `6441fc0` requested changes (see `docs/agents/STATUS.md`). The owner reassigned the fixes to Claude Code.

### Commits

- `b6d09e4` Phase 7 · Fix — Stage 7A review findings: hidden balance masked on the Cash out result; one back guard in `FeatureScreen` (Modal path via `onBack` + `backHandlerRef`, stack path via `usePreventRemove`); `Pressable` animates the pressable surface (row layouts work), `highlight` implemented, Button scale 0.98; token values; exact pins for `expo-blur` 58.0.5 and `react-native-gesture-handler` 3.3.0; 9 guard unit tests.
- `93cb757` Phase 7 · Fix — app crashes on launch without SafeAreaProvider. **`6441fc0` did not open**: `ToastProvider` calls `useSafeAreaInsets()` with no provider above it (render error on launch, evidence `00-crash-before-fix-6441fc0.png`). The earlier "app opens in Expo Go" claim was not true.

### Gate (re-run after the fixes)

| Check                                                      | Result                                                                                                                                                                                                                                |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                        | 0 errors                                                                                                                                                                                                                              |
| `npm run lint`                                             | 0 errors, 97 warnings                                                                                                                                                                                                                 |
| `npm run format:check`                                     | All matched files use Prettier code style                                                                                                                                                                                             |
| `npm run test:unit`                                        | 15 suites, 84/84 (9 new in `feature_screen_guard.test.tsx`)                                                                                                                                                                           |
| `npm run test:db`                                          | 90 passed, 0 failed                                                                                                                                                                                                                   |
| `scripts/check-contrast.ts`                                | 31/31 token pairs pass                                                                                                                                                                                                                |
| `scripts/verify-tokens.ts`                                 | globals.css matches shared tokens                                                                                                                                                                                                     |
| `TouchableOpacity` grep                                    | 0                                                                                                                                                                                                                                     |
| `expo export --platform ios`                               | iOS bundled (3801 modules)                                                                                                                                                                                                            |
| App opens in Expo Go (iOS 26 simulator, iPhone 17 Pro Max) | PASS after `93cb757`                                                                                                                                                                                                                  |
| Maestro (`e2e/mobile`)                                     | **NOT VERIFIED** — Maestro is not installed on this machine, and the flows predate the authenticator-code prompt (customer1 now has a real authenticator). Updating and running them moves to the 7B gate, which already requires it. |

### iOS simulator — Cash out as a `FeatureScreen` (evidence in `docs/uat-evidence/ios-7a/`)

| #   | Check                                                                                                                                         | Result |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 01  | Font: Plus Jakarta Sans renders at the real weights                                                                                           | PASS   |
| 02  | Dirty step 1 → Back shows exactly **one** "Discard changes?" prompt; Keep editing keeps the input                                             | PASS   |
| 03  | Step 2 (Review) → Back returns to step 1 with the amount kept                                                                                 | PASS   |
| 04  | Authorize → password prompt renders inside the feature screen; Back is disabled while processing                                              | PASS   |
| 05  | Password → authenticator code (entered by the owner) → result screen                                                                          | PASS   |
| —   | Database (read-only): transaction `fd27ad74-…` type `withdrawal`, status `completed`, one ledger debit of 100 centavos on customer1's account | PASS   |

No password or code was typed by an agent or written to any file.

### Deferred to 7B.0 (owner decision)

- Cash out moves from a `Modal` to a root native-stack page (`presentation: 'card'`); the Modal wrapper and the `onBack` path then go away.
- `FloatingTabBar` is wired as the tab navigator's `tabBar`; `Sheet` replaces `BottomSheet` for quick actions.

### Found during the device check (for 7B)

- With the amount field focused, the first tap on Back only blurs the field; a second tap is needed. Use `keyboardShouldPersistTaps` on the header path or dismiss and act on the same tap.
- Wording: the result says "Cash Out Successful" in the header but "Cash-out Prepared" in the body; the Review button says "Authorize Cash-out". Unify the wording and casing in 7B.
- The result card's Transaction ID wraps under its label at this width.

## Stage 7B.0 task 3 — Transfer, Pay bills and QR stack pages (2026-11-10)

Implemented on `phase-7-ui-motion`, based on `f3b7aaa`. New `TransferScreen`, `PayBillsScreen` and `QRHubScreen` use FeatureScreen without `onBack`, with dirty/processing guards and previous-step navigation. Root routes use the captain's exact params, card presentation and slide-from-right animation. Home navigates directly and retains its focus refresh. QR scan/manual fallback replace Transfer; Request money replaces QRHub with the request tab.

The pages load accounts through `fetchAccountBalances` using `useFeatureAccounts`, with loading, mapped errors, empty state and Try again (`AccountLoadStatus`). Action forms are unavailable until accounts load successfully. Transfer prefill runs once after account loading, preserving the ten-digit and own-account checks and idempotency generation. A success effect refreshes Transfer's receipt balance without resetting its step or request key. Removed all three modal files and migrated `transfer_modal.test.tsx` to `transfer_screen.test.tsx`; all original assertions retained, plus account retry and invalid/self-account prefill cases. Subcomponents in transfer/, pay-bills/ and qr/ are unchanged.

### Exact handler comparison

Compared extracted handler text with `git show HEAD:apps/mobile/src/screens/<Old>Modal.tsx` while HEAD was `f3b7aaa`:

```text
Transfer.handleSelectOwnAccount: BYTE-IDENTICAL
Transfer.handleSelectSavedRecipient: BYTE-IDENTICAL
Transfer.handleNextFromRecipient: BYTE-IDENTICAL
Transfer.handleNextFromAmount: BYTE-IDENTICAL
Transfer.handleConfirmTransfer: BYTE-IDENTICAL
Transfer.executeScheduledTransfer: BYTE-IDENTICAL
Transfer.executeServerTransfer: BYTE-IDENTICAL except explicitly requested success callback removal
Transfer: idempotency payload-change effect BYTE-IDENTICAL
Transfer: StepUpSetupLink JSX BYTE-IDENTICAL; component unchanged
PayBills.validateReference: BYTE-IDENTICAL
PayBills.handleSelectBiller: BYTE-IDENTICAL
PayBills.handleReferenceContinue: BYTE-IDENTICAL
PayBills.handleAmountContinue: BYTE-IDENTICAL
PayBills.handleSubmitPayment: BYTE-IDENTICAL except explicitly requested success callback removal
PayBills: idempotency payload-change effect BYTE-IDENTICAL
PayBills: StepUpSetupLink JSX BYTE-IDENTICAL; component unchanged
QRHub.handleSendRequest: BYTE-IDENTICAL except explicitly requested success callback removal
Payment authentication/RPC/error mapping blocks unchanged; no subcomponent changes.
```

The explicit success callback removals are the only differences within those handlers: one `onTransferSuccess(data)`, two `onPaymentSuccess()` and one guarded `onRequestSent()` call. Full handlers therefore are not literally byte-identical in those three cases; all remaining bytes match. The QR scan handler preserves parsing/haptics/error handling and replaces its old reset/parent callback with `navigation.replace('Transfer', { recipientAccount, amountCentavos, note })`, as requested. StepUpSetupLink component and JSX are unchanged; its existing `onClose` now goes back through stack navigation. No RPC, server, migration, shared error mapping, authentication helper or money-engine changes.

### Local checks

```text
npm run typecheck — exit 0
> davao-bank@0.1.0 typecheck
> npm run typecheck --workspaces --if-present


> admin@0.1.0 typecheck
> tsc --noEmit


> mobile@1.0.0 typecheck
> tsc --noEmit


> @davao-bank/shared@0.1.0 typecheck
> tsc --noEmit

npm run lint — exit 0
✖ 75 problems (0 errors, 75 warnings)

npm run test:unit — exit 0
> davao-bank@0.1.0 test:unit
> jest


Test Suites: 17 passed, 17 total
Tests:       95 passed, 95 total
Snapshots:   0 total
Time:        3.585 s, estimated 4 s
Ran all test suites in 3 projects.
```

`rg -n 'TransferModal|PayBillsModal|QRHubModal' apps/mobile` returned no matches (exit 1). No imports of the deleted modules remain.

Device flows, native swipe/Android Back, live password → code → RPC flow and screenshots: **NOT VERIFIED — captain performs device verification per the task brief.** Remaining stage 7B work is outside this task.

Format verification (exit 0):

```text
> davao-bank@0.1.0 format:check
> prettier --check "**/*.{ts,tsx,js,jsx,json,md}"

Checking formatting...
All matched files use Prettier code style!
```

## Stage 7B.0 task 5 — Quick-action confirmations (2026-11-10)

Added ConfirmSheet using existing Sheet and a useConfirmSheet controller. Discard, sign-out, decline/cancel request, cancel schedule and delete recipient now use sheets. Confirmation unmounts the Sheet before invoking the captured callback, releasing its password/code host. FeatureScreen keeps its existing stack vs modal guard ownership and dispatches the captured navigation action on Discard. Native error/app-lock Alerts, rename prompt and statement-ready Alert remain unchanged.

Comparison against `f5c53fa`: the five async confirmation bodies are identical after leading indentation normalization; raw bodies differ only by Prettier indentation after moving properties. PaymentRequests.handlePay is byte-identical. No RPC, authentication/step-up, shared package or route changes. Removed BottomSheet and its export; `rg -n 'BottomSheet' apps/mobile` returns no matches (exit 1). Historical documentation retains the old component name.

All original password/TOTP assertions remain. The two-modal password test explicitly includes hidden trees because Sheet marks both native modal siblings accessibilityViewIsModal. New tests cover ConfirmSheet actions/labels, Profile sign-out only on confirm and the confirmation-to-FeatureScreen password-host handoff. Existing single-back-guard tests now press sheet buttons by role.

Final checks (all exit 0):

```text
> davao-bank@0.1.0 typecheck
> npm run typecheck --workspaces --if-present


> admin@0.1.0 typecheck
> tsc --noEmit


> mobile@1.0.0 typecheck
> tsc --noEmit


> @davao-bank/shared@0.1.0 typecheck
> tsc --noEmit

npm run lint
✖ 66 problems (0 errors, 66 warnings)

> davao-bank@0.1.0 format:check
> prettier --check "**/*.{ts,tsx,js,jsx,json,md}"

Checking formatting...
All matched files use Prettier code style!

> davao-bank@0.1.0 test:unit
> jest


Test Suites: 20 passed, 20 total
Tests:       107 passed, 107 total
Snapshots:   0 total
Time:        3.828 s, estimated 4 s
Ran all test suites in 3 projects.
```

Device flows: **NOT VERIFIED — captain runs them.** This task reuses the existing Sheet implementation; its Reanimated/swipe motion patterns and native dismissal timing were not changed or device-verified here.

**Captain review fixes (same commit):** `Sheet` renders `PrivacyOverlay` inside its Modal again (privacy regression from removing `BottomSheet`). `useConfirmSheet` now keeps the sheet mounted with `visible: false` so it can animate out, and runs the confirmed action once the sheet is hidden (its password/code host unregisters on `visible=false`); async actions are caught and mapped with `toUserMessage`. Sheet close label is "Close" and the title uses the `title` style. Added a double-tap/re-open test. Checks after the fixes: typecheck exit 0, lint 0 errors (66 warnings), format PASS, unit 20 suites / 108 tests. Device flows NOT VERIFIED.

## Stage 7B.1 — Home (2026-11-10, Claude implementer sub agent)

Implemented the Home table (spec 7B "Rules for every screen" and "### 1. Home"):

- **Header:** 56 pt, Logo 32, "Maayong adlaw," caption over the first name in `title`, avatar 40 inside a 44 pt `Pressable` labelled "Open profile" (Profile tab, as before).
- **Balance card:** radius 24, padding 20, `elevation.card`. Pill "Savings •• 8921" opens `AccountPickerSheet` (new, built on `Sheet`; selected row marked; choosing closes it). Cycling removed; the selection is kept by account id across reloads. Eyebrow "AVAILABLE BALANCE"; amount in `amount`, or `display` at 400 pt and wider (`useWindowDimensions`); "All accounts ₱X" with 2+ accounts, masked when balances are hidden; 44 pt eye toggle ("Hide balance" / "Show balance"); amounts capped at `maxFontSizeMultiplier={1.4}`.
- **Load error:** "Balance unavailable", the `toUserMessage` text and a "Try again" button; never ₱0.00. Pull-to-refresh and focus reload kept.
- **Actions:** 3×2 grid, gap 12; white tiles with 1 px border, radius 16, padding 12, `minHeight: 96`, 40 pt colour disc (white icon, ink on yellow), ink label 14/600. Transfer blue, Pay bills orange, QR primary, Add money green, Cash out red, Schedule yellow. Same navigation targets.
- **Currency Watch:** one 64 pt row, "USD/PHP ₱63.94" (2 decimals), percent change chip, "Reference rate · Oct 26", or "Not updated since Oct 26" in muted text when the latest rate is more than 3 days old. With no rate data it now says "Rate unavailable" instead of showing the old hard-coded fallback rate.
- **Coming up:** only with items; one grouped card (radius 16, 1 px border, hairlines inset 72), up to 3 rows dated "Nov 10 · Monthly"; amounts respect hide-balance.
- **Recent activity:** one grouped card, 5 rows, "See all". `TransactionRow` itself is unchanged apart from an optional `style` prop used to drop its per-row border inside the card (its restyle is 7B.2).
- **Screen:** side margin 20, sections `gap: 24` with no stacked margins, spacing tokens only, bottom clearance 16 pt above the floating tab bar (`max(inset, 8) + 8 + 64`, minus the inset Screen's SafeAreaView already pads). Dev diagnostics unchanged.

Outside the listed files, additive only: `AmountText` gained an optional `maxFontSizeMultiplier`; `TransactionRow` gained an optional `style`. No shared package, App.tsx, RPC, money or step-up change.

Tests: new `apps/mobile/src/__tests__/home_screen.test.tsx` (10 tests: balance error + retry with no ₱0.00, picker opens and switches account, "All accounts" only with 2+ accounts, sum and masking, Coming up hidden/shown, FX stale and fresh text, tile labels and targets).

Checks (repo root):

```text
npm run typecheck   → admin, mobile, shared: tsc --noEmit, exit 0
npm run lint        → ✖ 65 problems (0 errors, 65 warnings)
npm run format:check→ All matched files use Prettier code style!
npm run test:unit   → Test Suites: 22 passed, 22 total
                      Tests:       130 passed, 130 total
```

Device: **NOT VERIFIED — captain runs it** (widths 375/402/440, 1.4x text, picker sheet motion, tab-bar clearance).

Known: on a network failure the error line reads `toUserMessage`'s "You appear to be offline. Nothing was sent." — the load-only wording issue already deferred to 7B.7/7B.11.

**Fix round for `ee43efa` (captain-accepted CQ/UX findings):** auth error → "Balance unavailable"; stable account order (savings first); Recent activity error + retry; 44 pt "See all"; stale-load guard and a single load on mount; health check isolated; Currency Watch refetches on refresh/focus; "Amount hidden" label and `AmountText` reuse for "All accounts"; skeleton height matches the card; tab-bar height/offset exported from `FloatingTabBar`; fresh FX date "Oct 26". Checks: typecheck exit 0; lint `✖ 65 problems (0 errors, 65 warnings)`; format `All matched files use Prettier code style!`; unit `Test Suites: 22 passed, 22 total`, `Tests: 143 passed, 143 total`. Device NOT VERIFIED — captain runs it.

## Stage 7B.2 — Lists, rows and badges (2026-11-10, Claude implementer sub agent)

Implemented spec 7B "### 2. Lists, rows and badges" plus the 7B.1 carry-overs (TransactionRow amount cap, row labels with amounts, hairline inset consistency).

- **Shared list metrics** (`apps/mobile/src/components/GroupedList.tsx`): disc 40, row padding 12×16, disc–text gap 16, `LIST_HAIRLINE_INSET = 16 + 40 + 16 = 72`; `GroupedList` (radius 16, 1 px border), `ListHairline`, `groupedListStyles`. Used by Home Recent activity, Coming up, `AccountPickerSheet`, Activity and Inbox.
- **Transaction row:** minHeight 64, 40 pt disc, title `bodyStrong`, meta caption muted "To •• 7943 · 2:41 AM" (Activity: "Savings · To •• 7943 · 2:41 AM"), amount `bodyStrong` tabular with `maxFontSizeMultiplier={1.4}`. Reads `hideBalance` itself. Accessibility label: title, meta, "plus/minus ₱500.00" or "amount hidden", and the badge. Titles from the Wording table: "Sent to •• 7943", "Received from •• 8921", "Bank credit" (debit adjustments: "Bank debit"), "Money added", "Cash out", "Bill payment". Lists never show a full account number. Completed rows have no badge (Completed is for receipts only).
- **Reversals:** every reversal written by `admin_reverse_transaction` has the reference `Reversal of <original uuid>: <reason>` (all migrations use this format). The app reads the original id from it (strict UUID match), finds the original among the loaded rows (same account first) and titles the row "Reversal · Transfer to •• 8720"; if the original isn't loaded it reads "Reversal". The staff reason and the id are never shown in lists. Reversed originals (`status = 'reversed'`) show the amount struck through in `textMuted` with a neutral "Reversed" badge.
- **Badge:** table colours (Completed primary/primaryTint; Pending orangeText/tintOrange; Scheduled blueText/tintBlue; Failed redText/tintRed; Reversed and Cancelled textSecondary/surfaceSubtle), minHeight 24, 12/600 from tokens, `transactionStatusBadge(status, 'list' | 'receipt')`.
- **Activity:** search by note or counterparty account digits (client-side over loaded rows), account filter chips when there are 2+ accounts, type chips (sentence case: Add money / Cash out), chips 36 pt, one grouped card per day, side margin 20, gap 24, bottom clearance via `tabScreenBottomClearance` (added to `FloatingTabBar`, same math as Home). Loads on focus (stale responses ignored). Empty states are scrollable (pull-to-refresh) with the wording-table copy ("No activity yet. Money you send, receive and pay will show here.", "No bill payments yet.", "No matches"). Load error → "Activity unavailable", `toUserMessage` text, "Try again"; if rows were already loaded, an inline error + Try again sits above them.
- **Inbox:** one grouped card; type icon disc; sentence-case titles (Money sent / Money received / Transfer reversed / Bank credit / Account update / Payment request / Request paid / …); message on two lines; time on the right ("2:41 AM" today, else "Nov 8"); unread = 8 pt green dot (`primary`) + `bodyStrong` title, left border removed; loads on focus; load error + Try again; empty "You're all caught up". Request notifications still open Payment requests with the right `initialTab`. **Transaction notifications: BLOCKED** — the `notifications` table has no related transaction id, so a tap only marks the item as read (TODO in `InboxScreen.tsx`); no matching heuristics.
- **Inbox badge at start:** `hooks/useUnreadNotificationCount.ts` loads the unread count when a user is signed in (restored session or sign-in), refreshes when the app returns to the foreground, resets on sign-out; Inbox still reports its count after loading or marking read. `App.tsx` only swaps its inline loader for the hook.
- **Receipt:** amount and status badge centred together (title line above); rows Date & time, To/From (full account number, as the spec allows on receipts), Note, Reference no. **Reference rule:** `formatReferenceId` (shared, unchanged): "DB-" + the first 8 alphanumeric characters of the transaction UUID, uppercased, split 4-4 (e.g. `8f043910-…` → `DB-8F04-3910`). Copy button (`expo-clipboard`, 44 pt, toast "Reference copied"). Sticky footer: "Share receipt" (writes a text receipt to the cache with `expo-file-system/legacy` and opens `expo-sharing`; it includes the full transaction UUID; amount reads "Hidden" when balances are hidden) and "Done". No UUID on screen. Hide-balance respected.

Data gaps (no shared/DB change made):

1. **Bill payment biller name:** the Wording table wants "Bill payment · Apo Fiber", but `get_account_transactions` returns no biller name (only the biller's account number as counterparty). Rows read "Bill payment" with "To •• 1234". Needs an RPC change (owner/captain decision).
2. **Inbox → transaction:** notifications have no related transaction id (owner decision, unchanged).
3. **Reversal lookup** depends on the reference format above and on the original being in the loaded history (it always is for the same account, since history returns all of the user's rows).

Tests (RNTL, roles): new `transaction_row.test.tsx` (masking, account prefix, a11y label with amount, hide-balance, 1.4 cap, no Completed badge in lists, sentence-case titles, reversal parsing/title/fallback, struck-through original, Badge colours per status, inset = 72), `activity_screen.test.tsx` (prefix, search by note and digits, no matches, account filter chips 36 pt + selected, receipt navigation, error + retry with no fake empty state, empty copy, reversal pair), `inbox_screen.test.tsx` (titles, unread dot/bold and no left border, unread count lowered on open with no navigation for transactions, request tabs, error + retry, empty copy, badge count loads at start without Inbox, resets on sign-out, refreshes on foreground); `receipt_screen.test.tsx` rewritten (spec rows, full counterparty number, no UUID on screen, reference format, copy → Clipboard + toast, Share → expo-sharing with full UUID, reversed struck through, hidden amount on screen and in the shared text). Existing assertions updated only for the new copy (components: "Received from •• 2222", masked meta; Home: Coming up label now includes the amount). `tests/setup/mobile-setup.ts`: global AsyncStorage jest mock.

Checks (repo root):

```text
npm run typecheck   → admin, mobile, shared: tsc --noEmit, exit 0
npm run lint        → ✖ 64 problems (0 errors, 64 warnings)
npm run format:check→ All matched files use Prettier code style!
npm run test:unit   → Test Suites: 25 passed, 25 total
                      Tests:       184 passed, 184 total
```

Device: **NOT VERIFIED — captain runs it** (row layout at 375/402/440 and 1.4x, Activity search/keyboard with the floating bar, share sheet, copy toast, VoiceOver labels).

**Fix round for `fabdf1c` (captain-accepted CQ/UX/SEC findings), commit A `Phase 7 · Fix — fabdf1c review findings (lists, Inbox, Receipt)`:**

1. Inbox mark-as-read: functional `setNotifications(prev => …)`; the badge count is derived from the latest list in one effect after load (load, mark one, mark all), so rapid taps don't revert each other.
2. Bill payments never show the internal billers account number: rows/meta show the time (or the note), Activity search ignores it, Receipt and the shared text read "To: Biller". Title stays "Bill payment" (biller name needs an RPC change, tracked separately).
3. Activity keeps previous accounts when the account load fails; the account filter resets to "All accounts" when the chosen account disappears or only one remains.
4. `useUnreadNotificationCount`: Inbox's `setCount` bumps the request id, so an older in-flight refresh is dropped.
5. Count query scoped with `.eq('user_id', userId)` (RLS also lets admins see every row).
6. Receipt: the share file is deleted in `finally` (`FileSystem.deleteAsync(uri, { idempotent: true })`); copy failure → error toast "Couldn't copy the reference. Try again.".
7. Wording: deposit is "Money added" in rows and in "Reversal · Money added"; adjustments chip "Bank credits & debits", empty "No bank credits or debits yet.".
8. Activity digit search only when the query matches `/^[\d•\s]+$/` or has 3+ digits.
9. A failed refresh with an empty filtered list shows the inline error + Try again above the empty state.
10. Receipt for a reversal finds the original in the same response: "Reversal · Transfer to •• 8720".
11. Activity section header `letterSpacing` literal → `typography.caption.letterSpacing` (Inbox had no literal).
12. Tests: stale-load (deferred promise) for Activity and Inbox; two rapid taps with held update queries; Mark all as read asserts the update, `user_id`/`read` filters and count 0; hook user filter and in-flight refresh (fails without the fix); bill payment rows/search/receipt/share; deposit reversal label; digit search rules; account fallback; kept accounts; error above empty state; share file deleted on failure; copy failure toast; reversal receipt title.
13. `tests/setup/mobile-after-env.ts` (new `setupFilesAfterEnv` entry in `jest.config.js`; `afterEach` isn't available in `setupFiles`) clears the AsyncStorage mock after every test.

Checks after commit A:

```text
npm run typecheck   → admin, mobile, shared: tsc --noEmit, exit 0
npm run lint        → ✖ 64 problems (0 errors, 64 warnings)
npm run format:check→ All matched files use Prettier code style!
npm run test:unit   → Test Suites: 25 passed, 25 total
                      Tests:       203 passed, 203 total
```

Deferred (captain): Inbox raw message text / full numbers / reversal UUID and staff reason / hide-balance in messages → 7B.9 wording migration; biller name and transaction deep link → owner DB decision; `toLocaleUpperCase` section headers → 7B.8. Device NOT VERIFIED — captain runs it.

**Fix outside the stage, commit B `Phase 7 · Fix — scope notifications fetch to the signed-in user`:** `packages/shared/src/supabase/client.ts` `fetchNotifications(client, userId?)` always filters `.eq('user_id', …)` — the passed id, or the signed-in user from `client.auth.getUser()`; with no user it returns `Authentication required` without querying (RLS alone would let an admin account read every user's notifications). Signature is backward compatible; the only caller is `InboxScreen` (grep over apps, packages, scripts, e2e). New `packages/shared/src/__tests__/notifications.test.ts` (3 tests).

```text
npm run typecheck   → admin, mobile, shared: tsc --noEmit, exit 0
npm run lint        → ✖ 64 problems (0 errors, 64 warnings)
npm run format:check→ All matched files use Prettier code style!
npm run test:unit   → Test Suites: 26 passed, 26 total
                      Tests:       206 passed, 206 total
```

Hosted behaviour NOT VERIFIED (live suites not run).

## Stage 7B.3 — Profile (2026-11-10, Claude implementer sub agent)

Implemented spec 7B "### 3. Profile" and plan task 6 (Change password page).

- **Profile** (`apps/mobile/src/screens/ProfileScreen.tsx`): profile card kept (badges now sentence case: "Email verified", "Staff admin"). Below it three grouped cards (`GroupedList`, radius 16, 1 px border, hairlines inset 72, rows 64 pt with a 40 pt disc):
  - **Money:** Saved recipients, Scheduled payments, Payment requests, Statements (→ `ExportStatement`).
  - **Security:** Two-step verification (subtitle "On"/"Off" from `supabase.auth.mfa.listFactors()` — a verified TOTP factor means On; read on focus so it updates after the setup screen; no subtitle if the read fails) → `TwoStepSetup`; App lock switch "Lock after 2 minutes in the background" (optimistic: moves at once, reverts and shows the error toast "Couldn't save the app lock setting. Try again." if `setEnabled` rejects — Phase 6.5 carry-over "Slow switch"); "Confirm with {biometricType}" switch (existing `setBiometricEnabled`; a refused turn-off now shows a toast instead of an `Alert`); Change password → new page.
  - **Settings:** Personal details, Hide balances switch (existing `hideBalance` / `toggleHideBalance`), About.
  - Floating full-width "Two-step verification" button removed. Footer: "Sign out" (`secondaryDestructive`, same `ConfirmSheet` flow and handler as before), then "Version 1.0.0 · Simulated prototype".
  - Section titles and the screen title have `accessibilityRole="header"`; switches have role switch, label = row title, hint = subtitle; navigation rows are role button. Side margin 20, `gap: 24`, bottom padding `tabScreenBottomClearance(insets.bottom)`. Profile refetch on focus (`onProfileUpdated` via ref) unchanged.
- **Change password** (`apps/mobile/src/screens/ChangePasswordScreen.tsx`, route `ChangePassword: undefined`, `presentation: 'card'`, `slide_from_right`): FeatureScreen page with New password and Confirm new password (`secureTextEntry`, `textContentType="newPassword"`, `autoComplete="new-password"`). Client checks mirror `supabase/config.toml` (`minimum_password_length = 10`, `password_requirements = "letters_digits"`): "Use at least 10 characters.", "Include at least one letter and one number.", "Passwords don't match.". `isDirty` while either field has input; `isProcessing` while submitting (blocks Back/swipe). Success → `ResultView` "Password changed" with Done (goBack); fields cleared. The password is kept only in component state; never logged, toasted or stored.
- **Step-up order for Change password:** (1) `usePasswordPrompt()` — the current password typed into the in-screen prompt (verified by `signInWithPassword`). `confirmMoneyAction` is deliberately not used because it accepts Face ID alone. (2) `supabase.auth.mfa.listFactors()`; if a verified TOTP factor exists, `useTotpPrompt()` (challenge-and-verify, refresh, aal2 check). The code must come after the password, because the password re-sign-in issues a new aal1 session. If the factor list can't be read, the change stops (fails closed). (3) `supabase.auth.updateUser({ password })`, once. Cancel at any step → "Not authorized. Your password was not changed."; `updateUser` is not called. `PasswordPromptContext` and `SettingsContext` are unchanged.
- **Error mapping gap (no shared change made):** `toUserMessage` has no password-change mappings and its fallback mentions money. The screen maps the auth codes `same_password` → "Choose a password that is different from your current one." and `weak_password` → "Use at least 10 characters with letters and numbers.", uses `toUserMessage` otherwise, and replaces its money fallback with "Could not change your password. Try again.". Offline still reads "You appear to be offline. Nothing was sent." (shared copy, deferred to 7B.7/7B.11). Suggest adding these mappings to `errors.ts` later.

Tests (RNTL, roles): new `profile_screen.test.tsx` (three group headers and every row, switches by role/name, Two-step On and Off + navigation, no floating two-step button, footer caption, Statements → `ExportStatement`, Change password → `ChangePassword`, Hide balances switch calls `toggleHideBalance`, App lock switch optimistic then reverts with the toast on failure); new `change_password_screen.test.tsx` (secure field props; too short / no digit / mismatch block submit with no prompt and no `updateUser`; cancelled password prompt and cancelled code prompt → no `updateUser`; success order `password → listFactors → totp → updateUser` once then Done → goBack; no-factor path skips the code; `same_password` and network errors mapped, raw text never shown). `profile_confirmation.test.tsx`: button name "Sign Out" → "Sign out" only. Fake passwords only (`Fakepass123`).

Checks (repo root):

```text
npm run typecheck   → admin, mobile, shared: tsc --noEmit, exit 0
npm run lint        → ✖ 64 problems (0 errors, 64 warnings)
npm run format:check→ All matched files use Prettier code style!
npm run test:unit   → Test Suites: 28 passed, 28 total
                      Tests:       221 passed, 221 total
```

Device and hosted: **NOT VERIFIED — captain runs it** (Profile layout at 375/402/440 and 1.4x, switch feel, VoiceOver; Change password end to end needs the owner to type the real current password and authenticator code). Maestro `e2e/mobile/main-customer-flow.yaml:108` still taps "Sign Out" (now "Sign out") — update at the 7B gate.

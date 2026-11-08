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

| Current Component | Current Implementation | Content / Complexity | Decision D4 Destination | Rationale |
|---|---|---|---|---|
| `TransferModal.tsx` | `<BottomSheet>` | 4-step wizard (Recipient, Amount, Review, Result) | **Full-Screen `FeatureScreen`** | High cognitive load, multi-step flow, sticky footer action. |
| `PayBillsModal.tsx` | `<BottomSheet>` | 6-step wizard (Biller, Reference, Amount, When, Review, Result) | **Full-Screen `FeatureScreen`** | Multi-step form with list selection and review steps. |
| `DepositModal.tsx` | `<BottomSheet>` | 3-step wizard (Amount, Review, Result) | **Full-Screen `FeatureScreen`** | Financial mutation requiring review and dedicated result screen. |
| `WithdrawModal.tsx` | `<BottomSheet>` | 3-step wizard (Amount, Review, Result) | **Full-Screen `FeatureScreen`** | Critical money out flow requiring clear authorization hierarchy. |
| `QRHubModal.tsx` | `<BottomSheet>` | 3 tabs (My QR, Scan QR, Request Money) | **Full-Screen `FeatureScreen`** | Camera viewport, large QR generation, and amount requests. |
| `ScheduledPaymentsModal.tsx` | `<BottomSheet>` | List of active schedules + sub-flow for creation | **Full-Screen `FeatureScreen`** | Scrollable schedule history and multi-field creation form. |
| `PaymentRequestsModal.tsx` | `<BottomSheet>` | List of incoming requests + pay/decline actions | **Full-Screen `FeatureScreen`** | List of pending transactions and review details. |
| `ExportStatementModal.tsx` | `<BottomSheet>` | Date range selection, preview, share | **Full-Screen `FeatureScreen`** | Multi-input filter and document preview. |
| `SavedRecipientsModal.tsx` | `<BottomSheet>` | List of recipients + add/edit/delete actions | **Full-Screen `FeatureScreen`** | Full CRUD list interface. |
| `PersonalDetailsModal.tsx` | `<BottomSheet>` | Profile editing form (name, phone) | **Full-Screen `FeatureScreen`** | Multi-field user details form. |
| `FXRatesModal.tsx` | RN `<Modal>` | Currency picker, chart periods, rate history list | **Full-Screen `FeatureScreen`** | Complex data visualization and scrolling rate table. |
| `TransactionDetailModal.tsx` | `<BottomSheet>` | Transaction receipt, metadata, and share action | **Full-Screen `FeatureScreen`** | Receipt layout with reference numbers and action buttons. |
| `TwoStepSetup.tsx` | In-line / Modal | TOTP QR code, secret key display, code input | **Full-Screen `FeatureScreen`** | 200 pt QR, security-critical key entry and verification. |
| `AboutModal.tsx` | `<BottomSheet>` | App metadata, version, academic disclaimer | **Full-Screen `FeatureScreen`** | Informational text and brand credits. |
| *Account Picker* | In-line / Modal | List of customer accounts (Savings, etc.) | **Stays a `Sheet`** | Single quick choice, 2–4 rows, contextual to active screen. |
| *Transaction Filter* | In-line / Sheet | Type chips (All, Transfers, Bills) | **Stays a `Sheet`** | Quick filter selection without leaving Activity list. |
| *Confirmations* | In-line / Alert | Discard dirty form, Cancel schedule, Sign out | **Stays a `Sheet`** | 1–2 action confirmation dialogs with clear destructive choices. |
| *Auth Overlays* | In-sheet prompt host | Password prompt, TOTP authenticator prompt | **In-window prompt host** | Rendered inside the active `FeatureScreen` or top-most `Sheet`. |
| `NotificationsModal.tsx` | Modal | Duplicate code of `InboxScreen.tsx` | **DELETE** | Dead, orphaned component; unimported in the project. |

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

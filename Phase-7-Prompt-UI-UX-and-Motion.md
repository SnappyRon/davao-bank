# Davao Bank — Phase 7 Implementation Prompt: UI/UX Refinement & Motion

**Give this entire file to your coding agent. It is self-contained.**

Phase 7 makes the mobile app consistent, accessible and responsive. It does that by fixing the type, color, spacing, wording, flow structure and motion across every screen. It adds **no banking features** and **no database changes**, except for one migration that only changes notification wording (7B, item 9).

**Prerequisite:** Phase 6 must be approved first. In particular, Stage 0.9 (the critical flow fixes) has to be merged. This phase builds on those fixes and doesn't redo them.

**Source:** the reviewer's UI/UX and motion audit (2026-11-03). Every finding was checked on an iPhone 17 Pro Max simulator or read in the code.

## Decisions this phase implements

The owner approved these on 2026-11-03. They replace earlier decisions.

| Decision                                 | What changes                                                                                                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **D1: illustrations allowed**            | Reverses the earlier "no mascot" rule. Illustrations are allowed in empty and recoverable-error states only.                                                                         |
| **D2: the characters are Kada and Duri** | **Kada** (Philippine eagle) and **Duri** (durian) are the characters. Kada replaces the name "Agi" from the proposal.                                                                |
| **D3: Home regroup**                     | The six action tiles become a compact 3×2 grid of white tiles with colored icon discs. This replaces the large solid-color tiles approved in Phase 5. The six Kadayawan colors stay. |
| **Libraries**                            | Add `react-native-reanimated` and `react-native-gesture-handler`, in the versions Expo SDK 58 bundles.                                                                               |

## How to run this phase

1. **Branch:** create `phase-7-ui-motion` from the approved Phase 6 branch.
2. **Stages:** 7A, 7B and 7C. Make one commit per stage, titled `Phase 7 · Stage X — <name>`, and stop if a stage's gate fails.
3. **Report:** append to `PHASE7_REPORT.md` after each stage. Include what was built, every command you ran with its full output, before/after screenshots and any deviations, with reasons.
4. **Screenshots:** for every changed screen, capture an iPhone simulator at 402 pt and 440 pt wide and an Android emulator at 360 dp. All three at 1.0× and 1.4× text size.
5. **Don't change behavior that Phase 6 fixed.** Keep the result screens, the dismissal locks, the idempotency handling and the error mapper as they are. Rebuild them on the new components without changing what they do.
6. **Conflicts:** if anything here conflicts with the code or an approved document, stop and flag it.

---

## Stage 7A — Foundations

### 1. Fix the typeface (highest priority)

`Text` and `TextField` set `fontFamily: 'PlusJakartaSans'`. That font name is never registered: `App.tsx` loads `PlusJakartaSans_500Medium`, `_600SemiBold`, `_700Bold` and `_800ExtraBold`. As a result, every screen renders in the system font.

- **Map weights to files.** In `packages/shared/src/theme/tokens.ts`, give each typography variant the family name for its weight:

  | Weight | Family                         |
  | ------ | ------------------------------ |
  | 500    | `PlusJakartaSans_500Medium`    |
  | 600    | `PlusJakartaSans_600SemiBold`  |
  | 700    | `PlusJakartaSans_700Bold`      |
  | 800    | `PlusJakartaSans_800ExtraBold` |

- **Remove `fontWeight` on iOS** wherever a family is set, so iOS doesn't apply a synthetic bold on top of the file.
- **Set the family everywhere.** That includes `AmountInput`'s `TextInput`, the tab bar labels and every place that uses the RN `Text` directly.
- **Verify on a device.** The rendered "Welcome back" heading must be Plus Jakarta Sans. Take a screenshot, compare it with the system font and include both in the report.

### 2. Token changes (`packages/shared/src/theme`)

| Token                 | Change                                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `colors.textMuted`    | `#8A877F` → `#6B6860`. Contrast rises to 5.11:1 on the canvas, from 3.29                                                    |
| `colors.borderStrong` | **New**, `#8E887B`. Used only for input outlines (3.5:1 on white)                                                           |
| `colors.scrim`        | **New**, `rgba(26, 26, 26, 0.5)`. Used by every sheet and modal backdrop                                                    |
| `typography.amount`   | **New**, 32/36, weight 800, tabular figures                                                                                 |
| `size.touch`          | **New**, `44` (the minimum hit area)                                                                                        |
| `size.control`        | **New**, `52` (button and input height)                                                                                     |
| `elevation.card`      | **New**. A static shadow: offset 0/2, opacity 0.06, radius 8, Android elevation 2. Used only by the balance card and sheets |
| `motion`              | Replace it with the table in 7C. **Delete `counterDuration`**                                                               |

- **Admin.** Admin's `globals.css` must still match `packages/shared`, and the drift check from Phase 5 must still pass.
- **Unused aliases.** Delete aliases that nothing uses, and rename `ActionTile`'s `'purple'` color key to `'primary'`.

### 3. Shared components

| Component                                | Status                 | What to do                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Pressable` (`components/Pressable.tsx`) | New                    | Wraps RN `Pressable`. **Requires** `accessibilityRole` and `accessibilityLabel`. Adds `hitSlop` so the hit area is at least 44 pt. Implements the press feedback from 7C (patterns 1 and 2). Every touchable in the app moves to this component; no `TouchableOpacity` remains                                                                                           |
| `Sheet` (`components/Sheet.tsx`)         | Replaces `BottomSheet` | Built with Reanimated and Gesture Handler. Details below                                                                                                                                                                                                                                                                                                                 |
| `ResultView`                             | New                    | One result layout used by every money flow. Details in 7B                                                                                                                                                                                                                                                                                                                |
| `Button`                                 | Change                 | Spec below                                                                                                                                                                                                                                                                                                                                                               |
| `TextField`, `AmountInput`               | Change                 | Remove `TextField`'s own `marginBottom`; the parent `gap: 16` provides the spacing. Use `borderStrong`, switching to `primary` on focus and `redText` on error. Link the error text to the field and announce it. `AmountInput` uses the `decimal-pad` keyboard and live grouping ("5,000.00"). Preset chips read "₱500" (no "+"), are 36 pt tall and **set** the amount |
| `Chip`                                   | Change                 | `minHeight: 36` plus `hitSlop`. Set `accessibilityRole="button"` and `accessibilityState={{ selected }}`                                                                                                                                                                                                                                                                 |
| `Badge`                                  | Change                 | 24 pt tall, sentence case, label 12/600. Use the status colors in 7B                                                                                                                                                                                                                                                                                                     |
| `Toast`                                  | Change                 | One queue at the app level. Calls `AccessibilityInfo.announceForAccessibility`. Uses motion pattern 12                                                                                                                                                                                                                                                                   |
| `EmptyState`                             | Change                 | Add an optional `illustration` prop (7C). It must be scrollable so pull-to-refresh works when the list is empty                                                                                                                                                                                                                                                          |
| `ListRow`                                | Change                 | The divider uses `border`, not `surfaceSubtle`, which is invisible at 1.18:1                                                                                                                                                                                                                                                                                             |
| `NotificationsModal.tsx`                 | Delete                 | It's an unused copy of Inbox. Nothing imports it                                                                                                                                                                                                                                                                                                                         |

**`Button`**

- Height is a `minHeight` of 52, with a pill radius and the label in `bodyStrong` (16/600).
- **Pressed:** primary uses `primaryPressed` plus scale 0.98; secondary uses `surfaceSubtle`.
- **Disabled:** `surfaceSubtle` background with `textMuted` text. Don't use opacity.
- **Loading:** keep the label and its width, and put a spinner in place of the icon, e.g. "Sending…". Set `accessibilityState={{ busy: true }}`.
- **Accessibility:** set `accessibilityRole="button"`.
- **Haptics:** no haptic by default. Remove today's haptic that fires on every press.
- **Sign out** becomes a secondary button with red text. The destructive variant is only for actions that can't be undone.

**`Sheet`**

- **Layout:**
  - A 36×4 drag handle.
  - A header with the title (`title`, 18/700), an optional step caption ("Step 2 of 3"), and a 44 pt close button labelled "Close".
  - A body that scrolls, with `keyboardShouldPersistTaps="handled"`.
  - A sticky footer for the actions, padded `16 + bottom safe-area inset`, that rides above the keyboard.
- **Height:** it fits its content up to 90%. Height changes between steps are animated (7C, pattern 7).
- **Props carried over from Phase 6:** `dismissible` and `onRequestDismiss`, with the same behavior.
- **New props:** `step` and `stepCount`.
- **Dismissal:** swipe down to dismiss works only when `dismissible` is true. Tapping the backdrop, the X, a swipe and Android back all go through the same guard.
- **Accessibility:** `accessibilityViewIsModal`. When the sheet opens or the step changes, focus moves to the title.

### 4. Install the libraries

- **Install:** run `npx expo install react-native-reanimated react-native-gesture-handler react-native-worklets`. The versions must match Expo SDK 58: Reanimated 4.7.1, worklets 0.13.0, Gesture Handler 3.3.0.
- **Configure:** add the Babel plugin those versions require, and wrap the app root in `GestureHandlerRootView`.
- **Verify:** it must run in **Expo Go**, with no development build.
- **Don't add** `@gorhom/bottom-sheet`, Lottie, Moti or any other animation library. If building `Sheet` yourself turns out to be impractical, stop and report back instead of adding a dependency.

**7A gate:**

- **Contrast:** a script over the token pairs passes. All text is at least 4.5:1, and controls and icons are at least 3:1.
- **Font:** the font check screenshot is in the report.
- **Touchables:** no `TouchableOpacity` remains (`grep`).
- **Builds:** typecheck, lint, format:check and `expo export` pass, and the app opens in Expo Go.
- **Regression:** the Phase 6 Maestro flows pass unchanged.

---

## Stage 7B — Screens, flows and wording

### Rules for every screen

- **Side margin.** 20 on every screen (Home currently uses 16).
- **Section spacing.** Sections stack with `gap: 24`, and nothing stacks its own vertical margins on top of that.
- **One strong surface per screen.** On Home that's the balance card, in Review the amount, and in Result the status icon. Everything else stays white or canvas with ink text.
- **Festival colors identify; they don't carry text.** Text sits only on surface, canvas or primary green.
- **Lists.** One grouped card per section (radius 16, 1 px border), with rows separated by hairlines inset 72. Never one card per row.
- **Accounts.** Always written the same way, "Savings •• 8921", with the type taken from the account. The full number appears only on My QR and on receipts.
- **Money.** Always "₱1,234.56". Never "PHP".

### 1. Home

| Element         | Spec                                                                                                                                                                                                                                                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header          | 56 pt tall. Logo mark 32. "Maayong adlaw," as a caption above the name in `title`. Avatar 40 inside a 44 hit area, labelled "Open profile"                                                                                                                                                                              |
| Balance card    | Radius 24, padding 20, `elevation.card`. The pill "Savings •• 8921 ▾" opens an account-picker sheet; it no longer cycles. Eyebrow "AVAILABLE BALANCE". The amount is in `amount`, or `display` on screens 400 pt or wider. With 2+ accounts, a secondary line reads "All accounts ₱X". The eye toggle has a 44 hit area |
| Actions         | A 3×2 grid with gap 12. Each tile: white surface, 1 px border, radius 16, padding 12, `minHeight: 96`, a 40 pt color disc with a white icon (ink on yellow), and an ink label (14/600). Colors: Transfer blue, Pay bills orange, QR primary, Add money green, Cash out red, Schedule yellow                             |
| Currency Watch  | One row, 64 pt tall: "USD/PHP ₱63.94" (2 decimals), a change chip and "Oct 26". When the latest rate is more than 3 days old, it reads "Not updated since Oct 26" in muted text                                                                                                                                         |
| Coming up       | Shown only when there are items. One grouped card with up to 3 rows, dated like "Nov 10 · Monthly"                                                                                                                                                                                                                      |
| Recent activity | One grouped card with 5 rows and "See all"                                                                                                                                                                                                                                                                              |
| Load error      | Show "Balance unavailable" with a retry button. Never show ₱0.00 when a load fails                                                                                                                                                                                                                                      |

### 2. Lists, rows and badges

- **Transaction row.**
  - Layout: `minHeight: 64`, padding 12×16, a 40 pt icon disc, then the title (`bodyStrong`) over the meta line (caption, muted), then the amount (`bodyStrong`, tabular).
  - Meta reads "To •• 7943 · 2:41 AM". On Activity, add the account in front: "Savings · To •• 7943".
  - The row reads `hideBalance` itself.
- **Reversals.** The reversal row reads "Reversal · Transfer to •• 8720". The original row shows its amount struck through in muted text, with a neutral "Reversed" badge, not red.
- **Badges.**

  | Status              | Text          | Background                                  |
  | ------------------- | ------------- | ------------------------------------------- |
  | Completed           | primary       | primaryTint (receipts only, never in lists) |
  | Pending             | orangeText    | tintOrange                                  |
  | Scheduled           | blueText      | tintBlue                                    |
  | Failed              | redText       | tintRed                                     |
  | Reversed, Cancelled | textSecondary | surfaceSubtle                               |

- **Activity.** Search by note or counterparty, plus an account filter. Chips are 36 pt. The empty state is scrollable.
- **Inbox.** Same row layout: an icon for the type, a sentence-case title, a two-line message and the time on the right. Unread items get an 8 pt green dot and a bold title; drop the left border. **A tap opens the related transaction or request.** The Inbox badge count loads when the app starts, not only after Inbox has been opened.
- **Receipt** (`TransactionDetailModal`).
  - The amount and the status badge are centred together.
  - Rows: Date & time, To/From, Note, Reference no.
  - The reference shows as "DB-8F04-3910" with a copy button. The full UUID appears only in Share receipt.
  - "Share receipt" uses `expo-sharing`, which is already installed.

### 3. Profile

- **Layout:** the profile card stays. Below it are two grouped cards:
  - **"Money":** Saved recipients, Scheduled payments, Payment requests, Statements.
  - **"Settings":** Personal details, Confirm with Face ID, Hide balances (new switch, using the existing setting), Change password, About.
- **Footer:** the Sign out button (secondary style), then the caption "Version 1.0.0 · Simulated prototype".
- **Change password** uses `supabase.auth.updateUser` after the password-confirmation step.

### 4. One sequence for every money flow

Every money flow follows: **Input → Review → Authorize → Processing → Result**.

- **Input.**
  - Uses the `Sheet` step caption.
  - If the user has 2+ accounts, the source account picker comes first.
  - The recipient or biller is shown as a chip at the top of the amount step.
  - Validation is inline, under the field.
- **Review.**
  - On `surfaceSubtle`, radius 16, padding 20.
  - The eyebrow ("You're sending") sits above the amount in `amount`, with **no sign**.
  - Then rows: From, To, Note, When, Fee "Free".
  - Then the footnote "Simulated money — no real funds move."
- **Commit button.** It names the money: "Send ₱500.00", "Add ₱500.00", "Cash out ₱500.00", "Pay ₱1,250.00", "Schedule ₱500.00". While processing it reads "Sending…", "Adding…" or "Paying…".
- **Pay Bills.** Merge Amount and When into one step, giving 5 steps instead of 6. In place of the reference regex, show a helper example: "e.g. 10 digits, on your bill".
- **Pay a request.** Uses the standard Review, with a source account picker. In the biometric prompt, the requester is masked as "•• 8921". Today the prompt shows a UUID.
- **Saved recipients.** Replace `Alert.prompt` (iOS only) with an inline edit field. Tapping a recipient opens Transfer with it pre-filled.
- **Export statement.** Show a toast, "Statement ready", before the share sheet opens.
- **Verify email.** Add an "I've verified my email" button that calls `supabase.auth.refreshSession()` and re-runs the gate. Resend has a 60 s cooldown.
- **Forgot password.** The copy says to finish the reset in the browser: "Open the link in the email to set a new password, then sign in here." Don't build an in-app reset screen in this phase.

### 5. `ResultView`

There are exactly four outcomes. Each has one icon, one title pattern and one haptic, and none borrows another's.

| Outcome           | Icon     | Title example                                                     | Haptic               |
| ----------------- | -------- | ----------------------------------------------------------------- | -------------------- |
| Completed         | Check    | Transfer sent / Money added / Cash-out complete / Bill paid       | Success notification |
| Scheduled         | Calendar | Transfer scheduled for Nov 10 / Bill payment scheduled for Nov 10 | Light impact         |
| Request sent      | Send     | Request sent                                                      | Light impact         |
| Failed (not sent) | Alert    | Not sent                                                          | Error notification   |

- **Layout:** a 64 pt icon, the title (`h2`), the amount (`amount`), a details card (Date & time, Reference no., To/From, Note), then the actions.
- **Actions:** Done (primary), Share receipt (secondary) and one action specific to the flow ("Send again").
- **Data:** everything shown comes from the server response, as Phase 6 required.

### 6. Responsive and accessibility

- **Layout widths.**
  - At 360 pt, tiles are about 101 wide, labels fit on 1 line at 14, and the balance uses `amount` 32.
  - At 400 pt and wider, the balance uses `display` 40.
- **Text scaling.** Amounts and tab labels are capped with `maxFontSizeMultiplier={1.4}`. Body text scales freely, and fixed heights become `minHeight`.
- **Labels.** Every touchable has a role and a label. A loading button announces "busy".
- **VoiceOver.** Do a pass on Login, Home, Activity, Transfer (all steps) and Profile. Record what you found and what you fixed.

### 7. Wording

Use sentence case everywhere. Uppercase is only for small section eyebrows. Apply these replacements **exactly**:

| Where                                       | Current                                                                                    | New                                                                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Login subtitle                              | Sign in to manage your simulated Davao Bank accounts.                                      | Sign in to your Davao Bank demo account.                                                                                      |
| Login labels                                | Email Address / Sign In / Sign Up                                                          | Email / Sign in / Create one                                                                                                  |
| Home card eyebrow                           | TOTAL AVAILABLE BALANCE                                                                    | AVAILABLE BALANCE                                                                                                             |
| Home tiles                                  | Pay Bills / Cash-in / Cash-out / Scheduled                                                 | Pay bills / Add money / Cash out / Schedule                                                                                   |
| Home sections                               | Recent Activity / Upcoming Payments                                                        | Recent activity / Coming up                                                                                                   |
| FX card                                     | ECB Reference Rate · 2026-10-26                                                            | Reference rate · Oct 26                                                                                                       |
| Transaction titles                          | Transfer out / Transfer in / Adjustment                                                    | Sent to •• 7943 / Received from •• 8921 / Bank credit                                                                         |
| Bill payment row                            | bill_payment                                                                               | Bill payment · Apo Fiber                                                                                                      |
| Activity empty                              | No transactions yet. Your completed money operations and ledger activity will appear here. | No activity yet. Money you send, receive and pay will show here.                                                              |
| Activity filtered empty                     | No activity found under bill_payment.                                                      | No bill payments yet.                                                                                                         |
| Receipt labels                              | Timestamp / Counterparty Account / Reference / Note / Transaction ID                       | Date & time / To / Note / Reference no.                                                                                       |
| Sheet titles                                | Transfer · Recipient / Cash-in · Add Money / Cash-out · Withdraw / Pay Bills               | Send money / Add money / Cash out / Pay bills (plus "Step n of m")                                                            |
| Amount label                                | Amount to Transfer / Deposit Amount / Withdrawal Amount                                    | Amount                                                                                                                        |
| Note label                                  | Note / Reference (Optional) / Reference / Source / Reference / Purpose                     | Note (optional). Leave it empty, with the placeholder "e.g. Rent". Remove the pre-filled "Online Top-up" and "ATM Withdrawal" |
| Forward buttons                             | Continue to Review / Review                                                                | Continue                                                                                                                      |
| Review eyebrow                              | TOTAL AMOUNT / TOTAL TO ADD / TOTAL TO WITHDRAW                                            | You're sending / You're adding / You're cashing out                                                                           |
| Review row                                  | Projected Balance / New Balance                                                            | Balance after                                                                                                                 |
| Request result                              | Request Sent! …They can review and authorize it with biometrics.                           | Request sent. We'll notify you in Inbox when •• 7943 pays or declines.                                                        |
| Auth cancelled (all flows, including bills) | …authorization was cancelled. You can retry whenever ready.                                | Not authorized. Nothing was sent.                                                                                             |
| Inbox titles                                | TRANSFER OUT / TRANSACTION REVERSED / BALANCE ADJUSTMENT / ACCOUNT ALERT                   | Money sent / Transfer reversed / Bank credit / Account update                                                                 |
| Inbox empty                                 | Inbox is clear                                                                             | You're all caught up                                                                                                          |
| Profile biometrics (unsupported)            | Device biometric hardware not enrolled                                                     | Set up Face ID or fingerprint in your phone's settings first.                                                                 |
| Sign out dialog                             | Sign Out · Are you sure you want to sign out of Davao Bank?                                | Sign out · Sign out of Davao Bank?                                                                                            |
| Verify email                                | Click the link inside the email to activate…                                               | Tap the link in the email, then come back and tap "I've verified".                                                            |
| Suspended                                   | Your account is suspended — contact Davao Bank for assistance…                             | Your account is on hold. You can't send or receive money until our team reviews it.                                           |
| About                                       | Version 1.0.0 · Phase 5 Build                                                              | Version 1.0.0                                                                                                                 |

In money flows: no exclamation marks, no IDs, no regexes and no raw status or enum values.

### 8. Copy audit script

Add `scripts/check-copy.mjs` and run it in CI. It **fails** on any of these in `apps/mobile/src`:

- `.toUpperCase()` applied to a type or status;
- `'PHP '` in a user-visible string;
- `!` in a user-visible string under `screens/` for the money flows;
- a UUID rendered without going through the reference formatter.

### 9. Notification wording (one migration, text only)

The Inbox messages are written by database functions, as "You transferred PHP 500.00 to account 1078957943 (Ref: …)". Add **one new migration** that changes only the message text those functions produce:

| Notification   | New text                                          |
| -------------- | ------------------------------------------------- |
| Money sent     | You sent ₱500.00 to •• 7943. Note: …              |
| Money received | You received ₱500.00 from •• 8921.                |
| Reversal       | Your transfer of ₱300.00 to •• 8720 was reversed. |
| Bank credit    | We added ₱500.00 to your account.                 |
| Account update | Your account is active again.                     |

- **Customers never see admin-only text.** Leave out internal reasons such as "Concurrent reversal call A" and "Signature verified, unfreezing".
- **Text only.** Don't change any logic, signature, grant or which events produce a notification.
- **Tests:** update the matching assertions in the live suites and in `test:db`.

**7B gate:**

- **Screenshots:** before/after for every screen at the three widths, at 1.0× and 1.4× text.
- **Scripts and tests:** `check-copy` passes, and the VoiceOver notes are in the report.
- **Regression:** the Phase 6 Maestro flows pass, updated only for the new labels.
- **Live suites:** they pass, each showing `✓ Connected to live database`.

---

## Stage 7C — Motion and illustrations

### Motion tokens (replace `motion` in `tokens.ts`)

| Token                 | Value                                               |
| --------------------- | --------------------------------------------------- |
| `duration.micro`      | 100 ms (press in)                                   |
| `duration.short`      | 150 ms (press out, color changes, fades, toggles)   |
| `duration.medium`     | 250 ms (step change, content entering, sheet close) |
| `duration.long`       | 320 ms (sheet open)                                 |
| `duration.expressive` | 480 ms (result icon only)                           |
| `easing.standard`     | `Easing.bezier(0.2, 0, 0, 1)`                       |
| `easing.enter`        | `Easing.bezier(0, 0, 0, 1)`                         |
| `easing.exit`         | `Easing.bezier(0.3, 0, 1, 1)`                       |
| `spring.sheet`        | damping 26, stiffness 260, mass 1                   |
| `spring.pop`          | damping 14, stiffness 180, mass 1                   |

The spring values are starting points. Tune them on the Android emulator and the iPhone simulator, and record the final values.

**Rules:**

- Exits take about 70% of the time of the matching entry.
- Only `transform` and `opacity` animate on the UI thread. Height uses Reanimated layout transitions, and never inside long lists.
- Every animation can be interrupted, and continues from its current value.
- Nothing blocks input, except the processing lock.
- Read Reduce Motion with Reanimated's `useReducedMotion`, so the setting is known before the first frame, and delete the old hook.

### The 12 patterns

| #   | Trigger → element                          | Animation                                                                                                                                                | Timing                         | Haptic                           | Reduce Motion                    |
| --- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | -------------------------------- | -------------------------------- |
| 1   | Press → button or tile                     | Scale 1 → 0.97. Primary background changes to `primaryPressed`                                                                                           | in micro / out short, standard | None, except commit buttons (#6) | Color change only                |
| 2   | Press → list row                           | Background changes to `surfaceSubtle`                                                                                                                    | in micro / out short           | None                             | Same                             |
| 3   | Tab change → screen                        | Cross-fade (React Navigation `animation: 'fade'`)                                                                                                        | short                          | Selection                        | `animation: 'none'`              |
| 4   | Open → sheet + scrim                       | Scrim opacity 0 → 0.5. Sheet slides up from translateY 100%                                                                                              | long, enter (scrim medium)     | None                             | Fade, short, no movement         |
| 5   | Close or swipe → sheet                     | Sheet slides down to 100%, scrim fades to 0. A swipe closes past 25% of the height or above 1000 pt/s; otherwise it springs back (`spring.sheet`)        | medium, exit                   | None                             | Fade, short                      |
| 6   | Commit tap → button                        | The label changes to "Sending…" with a spinner. The width stays fixed                                                                                    | instant                        | Light impact                     | Same                             |
| 7   | Step change → sheet body                   | Old content fades and shifts 16 pt left; new content fades in from 16 pt right (reversed for Back). Height uses a layout transition                      | medium, standard               | None                             | Cross-fade only                  |
| 8   | Confirmed result → icon and text           | Icon disc scales 0.6 → 1 (`spring.pop`). The check stroke draws 0 → 1 over 360 ms after an 80 ms delay. Title and amount fade and rise 8 pt, 60 ms apart | expressive in total            | Per the `ResultView` table       | Fade, short (haptics still fire) |
| 9   | Validation fails → field                   | Border changes to `redText`. The error text fades in. The first invalid field scrolls into view and takes focus                                          | short                          | Warning, once per submit         | Color only                       |
| 10  | Data arrives → skeleton                    | Cross-fade to the content. The skeleton pulses opacity 0.5 ↔ 0.9 on a 1.4 s cycle                                                                        | medium                         | None                             | No pulse                         |
| 11  | Balance hide/show, account switch → amount | Cross-fade. **No counting, no rolling digits**                                                                                                           | short                          | Selection                        | Instant                          |
| 12  | Toast → banner                             | Fade in and drop 12 pt. Auto-dismiss after 4 s; errors stay until dismissed                                                                              | medium, enter                  | None                             | Fade                             |

**Don't animate:**

- anything celebratory before a confirmed result;
- progress bars. If processing takes longer than 2 s, fade in "Still working — don't close the app.";
- shake, flash or bounce;
- staggered entrances on lists longer than 10 rows;
- looping or idle mascot animation;
- shadows or blur.

### Illustrations (D1, D2)

Use only the prepared files in `apps/mobile/assets/`. Read `apps/mobile/assets/source/README.md` first. Don't use anything in `source/` in the app, and don't regenerate or edit the artwork.

| File                                                             | Where                                                                                                                        |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `illustrations/duri-empty-state.png`                             | Inbox "You're all caught up". Activity with no transactions                                                                  |
| `illustrations/duri-error-state.png`                             | "Couldn't load your activity" (or balance), offline, search with no results                                                  |
| `illustrations/kada-not-found.png`                               | "We couldn't find that account" (Transfer and Pay request). Empty Saved recipients                                           |
| `icons/billers/biller-category-{electricity,water,internet}.png` | Pay Bills: biller rows and category chips, 40 pt. Keep the Lucide icon for Mobile and as the fallback for any other category |

- **Size:** illustrations display at 120 pt in empty states and 96 pt inline.
- **Accessibility:** set `accessible={false}`. The message underneath is live text.
- **Motion:** they fade in once on mount (medium) and never loop.
- **Never** use them in money flows (amount, review, processing, result), above the balance, in the tab bar, or as buttons.

**7C gate:**

- **Recordings:** screen recordings of sheet open, step change, result, swipe-dismiss of a clean sheet, a blocked dismiss of a dirty sheet, and Reduce Motion on vs off. All are in the report.
- **Frame rate:** the performance monitor shows 60 fps during sheet open, step change and result on the Android emulator and the iPhone simulator.
- **Activity:** with 100 rows, a filter change finishes in under 100 ms.
- **Regression:** the Maestro flows pass.

---

## Final completion criteria

1. The brand font renders on every screen, and every token pair passes the contrast script.
2. Every touchable uses `Pressable` with a role and a label, and every sheet uses `Sheet`.
3. Home, the lists, Receipt, Inbox, Profile and every money flow match 7B. Every string in the 7B table has been replaced, and `check-copy` passes.
4. The 12 motion patterns are in place, with Reduce Motion alternatives and the haptics policy.
5. The illustrations appear only where the 7C table puts them.
6. The Phase 6 Maestro and Playwright flows pass, and the live suites pass with the connection line.
7. Typecheck, lint, format:check, `build:admin`, `expo export` and the secret-leak check all pass.

## Do NOT

- **Change behavior:** no change to money logic, RPC signatures, RLS or grants. The only database change is the 7B item 9 wording migration.
- **Change navigation or features:** don't change the 4-tab navigation, and don't add banking features (savings goals, the security center and Phase 8–9 items are out of scope).
- **Animate money:** don't animate amounts to unconfirmed values, and don't add swipe-to-pay or swipe-to-confirm.
- **Add dependencies:** nothing beyond Reanimated, worklets and Gesture Handler.
- **Change the logo:** the Davao Bank logo is the Mt. Apo emblem adopted by the owner on 2026-11-04 (`packages/shared/assets/brand/davao-bank-mark.svg`, wired into `Logo.tsx`, the app icons and the admin console). Don't redraw or recolor it, and don't use the official Kadayawan festival logo. Update the About screen's brand credit, which still refers to the festival logo.
- **Change the artwork:** don't edit or regenerate any illustration.

_The reviewer will review each stage commit on the simulator and in the code, re-run the live suites and `test:db`, and check the recordings. The report alone isn't enough._

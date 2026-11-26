# Davao Bank — Phase 7 Implementation Prompt: UI/UX Refinement & Motion

**Give this entire file to your coding agent. It is self-contained.**

Phase 7 makes the mobile app consistent, accessible and responsive. It does that by fixing the type, color, spacing, wording, flow structure and motion across every screen. It adds **no banking features** and **no database changes**, except for one migration that only changes notification wording (7B, item 9).

**Owner direction (2026-11-08).** The app should feel polished, modern, interactive and practical, not like a collection of basic widgets. In practice:

- major features open as **full-screen pages**, not small pop-ups;
- spacing is clean, with **no dead gaps**;
- the bottom navigation is a **floating tab bar**;
- every action shows **visible status**;
- the visual identity, with the Kada and Duri mascots, tells the app's story;
- **translucent surfaces** are used selectively.

**Usability comes before visual effects.** Every design element must have a clear purpose.

**Read first:** `AGENTS.md` and `docs/agents/STATUS.md`. Follow their hard rules and the handoff protocol: update `STATUS.md` and commit after every completed step.

**Prerequisite:** Phase 6 **and Phase 6.5 (strong authentication)** are approved, and both are pushed. This phase builds on their fixes and doesn't redo them. In particular, it builds on:

- the Phase 6 Stage 0.9 flow fixes;
- the in-sheet password prompt;
- the Phase 6.5 authenticator step-up and app lock.

**Source:**

- the reviewer's UI/UX and motion audit (2026-11-03);
- the reviewer's iOS device checks of Phase 6 and Phase 6.5 (2026-11-08), which are in **"Carry-overs from the device checks"** below.

Every finding was checked on an iPhone 17 Pro Max simulator or read in the code.

## Decisions this phase implements

The owner approved D1–D3 on 2026-11-03 and D4–D7 on 2026-11-08. They replace earlier decisions.

| Decision                                 | What changes                                                                                                                                                                                                                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1: illustrations allowed**            | Reverses the earlier "no mascot" rule. Illustrations are allowed in empty and recoverable-error states. **D6 extends this.**                                                                                                                                                                |
| **D2: the characters are Kada and Duri** | **Kada** (Philippine eagle) and **Duri** (durian) are the characters. Kada replaces the name "Agi" from the proposal.                                                                                                                                                                       |
| **D3: Home regroup**                     | The six action tiles become a compact 3×2 grid of white tiles with colored icon discs. This replaces the large solid-color tiles approved in Phase 5. The six Kadayawan colors stay.                                                                                                        |
| **D4: full-screen features**             | Every major feature opens as a full-screen page with a header, title and back action: money flows, QR, schedules, requests, recipients, statements, receipts, FX, two-step setup, personal details and About. Sheets are only for quick actions and confirmations. Details in 7A.3 and 7B.0 |
| **D5: floating tab bar**                 | The same 4 tabs (Home, Activity, Inbox, Profile), shown as a floating, translucent bar with clear icons, labels and active states. Details in 7B.0                                                                                                                                          |
| **D6: mascots tell the story**           | Kada and Duri may also appear in first-launch onboarding, empty and error states, and short guidance moments. **Never** in money flows, on the balance card or in the tab bar. Details in 7C                                                                                                |
| **D7: selective translucency**           | Background blur and translucent surfaces only on the floating tab bar, screen headers when content scrolls under them, and overlay backdrops. Contrast, readability, Reduce Transparency and performance always win. Details in 7C                                                          |
| **Libraries**                            | Add `react-native-reanimated`, `react-native-gesture-handler` and `react-native-worklets`, and **`expo-blur`** for D7, in the versions Expo SDK 58 bundles. `@react-navigation/native-stack` is already installed; use it for the full-screen pages                                         |

## How to run this phase

1. **Branch:** create `phase-7-ui-motion` from the tip of `phase-6-5-strong-auth`. It already contains all of Phase 6. If both have been merged into `main` by the time you start, branch from `main` instead.
2. **Stages:** 7A, 7B and 7C. Run each stage with the **work loop** below. Make one commit per stage, titled `Phase 7 · Stage X — <name>`. **Stop after each stage** and report to the owner. Don't start the next stage until the reviewer has approved this one.
3. **Report:** append to `PHASE7_REPORT.md` after each stage. Include what was built, every command you ran with its full output, before/after screenshots and any deviations, with reasons.
4. **Screenshots:** for every changed screen, capture iPhone simulators at three widths, each at 1.0× and 1.4× text size:
   - **375 pt** (iPhone SE or 16e): the narrow-screen check. It replaces the Android 360 dp check, because the owner skipped Android for now;
   - **402 pt**;
   - **440 pt** (iPhone 17 Pro Max).

   An Android emulator is optional. Use it if one is available.

5. **Don't change behavior that Phase 6 or 6.5 fixed.** Rebuild these on the new components without changing what they do:
   - the result screens and the dismissal locks;
   - the idempotency handling and the error mapper;
   - the confirmation order for every money action: **biometrics or password, then the authenticator code, then the server call**;
   - the 2-minute app lock.
6. **Conflicts:** if anything here conflicts with the code or an approved document, stop and flag it.

## Work loop (use it for every stage)

Keep working through this loop until the stage's gate passes, or a stop condition below applies. Don't hand back half-finished work, and don't stop just because one attempt failed.

**A. Plan the stage.**

- Copy every numbered item and every gate line of the stage into `docs/agents/STATUS.md` as a checklist.
- Do this before writing any code.
- This checklist is your definition of done.

**B. Loop over the steps.** For each unticked item:

1. **Build** the smallest complete version of the item.
2. **Check** it straight away:
   - run `npm run typecheck`, `npm run lint`, and the tests that touch it (`npm run test:unit`; `npm run test:db` if it touches SQL);
   - for anything visible, open it on the iPhone simulator and look at it.
3. **Fix** whatever the checks report:
   - read the actual error message;
   - fix the cause, not the symptom;
   - run the same checks again.
4. **Repeat** steps 2–3 until the item's checks pass.
5. **Record and commit:**
   - tick the item in `STATUS.md` and write the exact next step;
   - commit, staging files by name.

   If you run out of credits, the next agent continues from here.

**C. Run the gate.** When every item is ticked:

- Run the stage's full gate.
- Paste the real outputs into `PHASE7_REPORT.md`.
- If any gate line fails, go back to B for that item.

**D. Final self-review.** Re-read the stage section of this prompt, line by line. For each requirement, write in the report whether it's **done**, **not verified** (with the reason), or a **deviation** (with the reason).

- Anything you skipped by accident: go back to B.
- Only then make the stage commit with the exact title, and report to the owner.

**Stop conditions.** Stop the loop and report, with the details in `STATUS.md` under Blockers, when:

| Condition           | What it means                                                                                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Done**            | Every gate line passes, and D is complete.                                                                                                                                                                                            |
| **Stuck**           | The same failure is still there after **3 different fix attempts**. Describe what you tried. Don't keep trying variations.                                                                                                            |
| **Needs the owner** | A sign-in, a password, an authenticator code, a decision, or anything you're not allowed to do (see `AGENTS.md`). Mark that item "NOT VERIFIED — needs owner" and continue with the other items. Stop only when nothing else is left. |
| **Rule conflict**   | The only fix would break a "Do NOT" rule here or a hard rule in `AGENTS.md`.                                                                                                                                                          |

**Never fake progress.**

- Don't claim a check passed if it didn't run.
- Don't weaken a test, a security check or a "NOT VERIFIED" stop to make a gate pass.
- Don't mark an item done because the code looks right. It needs its check.

---

## Stage 7A — Foundations

### 0. Audit the current app first (before any code)

Inspect the current design, navigation structure, components and theme. Then add an **"Audit"** section to `PHASE7_REPORT.md` with:

- **Baseline screenshots:** every main screen and every feature at 375 pt and 440 pt.
- **Every `BottomSheet` / modal use:** what it contains, and whether it becomes a full-screen page or stays a quick-action sheet under D4.
- **The causes of the cramped widgets and the empty gaps**, with file and line. For example:
  - sheets limited to their content height;
  - `marginBottom` stacking on top of parent gaps;
  - `flex: 1` spacers pushing buttons far down;
  - hard-coded heights;
  - inconsistent side margins.
- **Every interaction that doesn't respond immediately**, or that could be triggered twice.

Fix the causes you list. Don't patch the symptoms one screen at a time.

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

| Component                                        | Status                 | What to do                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Pressable` (`components/Pressable.tsx`)         | New                    | Wraps RN `Pressable`. **Requires** `accessibilityRole` and `accessibilityLabel`. Adds `hitSlop` so the hit area is at least 44 pt. Implements the press feedback from 7C (patterns 1 and 2). Every touchable in the app moves to this component; no `TouchableOpacity` remains                                                                                           |
| `FeatureScreen` (`components/FeatureScreen.tsx`) | New                    | The full-screen page used by every major feature (D4). Details below                                                                                                                                                                                                                                                                                                     |
| `Sheet` (`components/Sheet.tsx`)                 | Replaces `BottomSheet` | **Quick actions and confirmations only** (D4). Built with Reanimated and Gesture Handler. Details below                                                                                                                                                                                                                                                                  |
| `FloatingTabBar`                                 | New                    | A custom `tabBar` for the bottom-tab navigator (D5). Spec in 7B.0                                                                                                                                                                                                                                                                                                        |
| `ResultView`                                     | New                    | One result layout used by every money flow. Details in 7B                                                                                                                                                                                                                                                                                                                |
| `Button`                                         | Change                 | Spec below                                                                                                                                                                                                                                                                                                                                                               |
| `TextField`, `AmountInput`                       | Change                 | Remove `TextField`'s own `marginBottom`; the parent `gap: 16` provides the spacing. Use `borderStrong`, switching to `primary` on focus and `redText` on error. Link the error text to the field and announce it. `AmountInput` uses the `decimal-pad` keyboard and live grouping ("5,000.00"). Preset chips read "₱500" (no "+"), are 36 pt tall and **set** the amount |
| `Chip`                                           | Change                 | `minHeight: 36` plus `hitSlop`. Set `accessibilityRole="button"` and `accessibilityState={{ selected }}`                                                                                                                                                                                                                                                                 |
| `Badge`                                          | Change                 | 24 pt tall, sentence case, label 12/600. Use the status colors in 7B                                                                                                                                                                                                                                                                                                     |
| `Toast`                                          | Change                 | One queue at the app level. Calls `AccessibilityInfo.announceForAccessibility`. Uses motion pattern 12                                                                                                                                                                                                                                                                   |
| `EmptyState`                                     | Change                 | Add an optional `illustration` prop (7C). It must be scrollable so pull-to-refresh works when the list is empty                                                                                                                                                                                                                                                          |
| `ListRow`                                        | Change                 | The divider uses `border`, not `surfaceSubtle`, which is invisible at 1.18:1                                                                                                                                                                                                                                                                                             |
| `NotificationsModal.tsx`                         | Delete                 | It's an unused copy of Inbox. Nothing imports it                                                                                                                                                                                                                                                                                                                         |

**`Button`**

- Height is a `minHeight` of 52, with a pill radius and the label in `bodyStrong` (16/600).
- **Pressed:** primary uses `primaryPressed` plus scale 0.98; secondary uses `surfaceSubtle`.
- **Disabled:** `surfaceSubtle` background with `textMuted` text. Don't use opacity.
- **Loading:** keep the label and its width, and put a spinner in place of the icon, e.g. "Sending…". Set `accessibilityState={{ busy: true }}`.
- **Accessibility:** set `accessibilityRole="button"`.
- **Haptics:** no haptic by default. Remove today's haptic that fires on every press.
- **Sign out** becomes a secondary button with red text. The destructive variant is only for actions that can't be undone.

**`FeatureScreen`** (full-screen page, D4)

- **Navigation:** a root native stack (`@react-navigation/native-stack`) holds the tab navigator plus every feature screen. Feature screens **push** over the tabs with the platform slide animation and `presentation: 'card'`. The floating tab bar is hidden on them.
- **Header:**
  - a 44 pt back button labelled "Back";
  - the title (`title`, 18/700) and an optional step caption ("Step 2 of 4");
  - an optional trailing action.

  When content scrolls underneath, the header turns translucent (D7).

- **Body:** scrolls, with `keyboardShouldPersistTaps="handled"`. It uses the 7B side margins and gaps. **No fixed-height spacers.**
- **Footer:** sticky, padded `16 + bottom safe-area inset`, holding the primary action. It rides above the keyboard.
- **Steps:** multi-step flows (Transfer, Pay bills and so on) stay on **one** screen and change steps inside it (7C pattern 7). Back moves to the previous step first, and leaves the screen only from step 1.
- **Phase 6 guards carried over:**
  - **Dirty form:** back, the swipe-back gesture and Android back all go through one guard: `usePreventRemove` from `@react-navigation/native`. It shows the existing discard confirmation.
  - **Processing:** while a money action is processing, back and the gesture are disabled completely (`gestureEnabled: false`). Nothing can leave the screen until there is a result.
  - **Result:** the result screen replaces the flow. Done returns to where the user started.
- **Confirmation prompts (critical, Phase 6 device fix):**
  - Each `FeatureScreen` registers a prompt host with `usePasswordPromptHost(isFocused)`, and renders `<PasswordPromptHost hostId=… ready=… />`, exactly like `BottomSheet` does today.
  - The password prompt and the authenticator-code prompt therefore always appear over the active feature screen, or over a sheet if one is open on top of it.
  - Prove it on the iOS simulator with a ₱1 cash-out: the password prompt, then the code prompt, then the result.
- **Accessibility:**
  - When the screen opens or the step changes, focus moves to the title.
  - Back is the first focusable element.

**`Sheet`** (quick actions and confirmations only)

- **Used for:** the account picker, frequency and date pickers, filters, discard and cancel confirmations, the sign-out confirmation, and short forms of one or two fields. **Never** for a feature with more than one step or a scrolling list of content.
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
- **Confirmation prompts (critical, Phase 6 device fix).**
  - The password prompt and the authenticator-code prompt render **inside the top-most sheet**, through `usePasswordPromptHost(visible)` and `<PasswordPromptHost hostId=… ready=… />` from `PasswordPromptContext`.
  - `Sheet` must keep that host exactly as `BottomSheet` does today.
  - If the host is missing, iOS cannot show the prompt, and every money action fails closed after 2 seconds.
  - Prove it on the iOS simulator with a ₱1 cash-out: the password prompt appears, then the code prompt, both over the sheet.

### 4. Install the libraries

- **Install:** run `npx expo install react-native-reanimated react-native-gesture-handler react-native-worklets expo-blur`. The versions must match Expo SDK 58: Reanimated 4.7.1, worklets 0.13.0, Gesture Handler 3.3.0, and the `expo-blur` version that `expo install` picks.
- **Configure:** add the Babel plugin those versions require, and wrap the app root in `GestureHandlerRootView`.
- **Verify:** it must run in **Expo Go**, with no development build.
- **Don't add** `@gorhom/bottom-sheet`, Lottie, Moti or any other animation library. If building `Sheet` yourself turns out to be impractical, stop and report back instead of adding a dependency.

**7A gate:**

- **Contrast:** a script over the token pairs passes. All text is at least 4.5:1, and controls and icons are at least 3:1.
- **Font:** the font check screenshot is in the report.
- **Touchables:** no `TouchableOpacity` remains (`grep`).
- **Foundations work end to end:**
  - `FeatureScreen`, `Sheet` and `FloatingTabBar` exist;
  - one flow (Cash out) runs end to end as a `FeatureScreen` on the iOS simulator: password, then code, then result, with the back button blocked during processing;
  - the audit section is in the report.
- **Builds:** typecheck, lint, format:check and `expo export` pass, and the app opens in Expo Go.
- **Regression:** the Phase 6 Maestro flows pass, updated only for the new navigation (feature screens instead of sheets) and labels. Money flows assert the code prompt, then Cancel (see the 7B gate).

---

## Stage 7B — Screens, flows and wording

### Rules for every screen

- **Side margin.** 20 on every screen (Home currently uses 16).
- **Section spacing.** Sections stack with `gap: 24`, and nothing stacks its own vertical margins on top of that.
- **Spacing scale.** Use only these values: 4 / 8 / 12 / 16 / 20 / 24 / 32. No one-off values.
- **No dead space.**
  - Content starts directly under the header.
  - Primary actions sit in the sticky footer, not pushed down by spacers.
  - A screen with little content stays compact and fills the space with purpose (a helpful hint, recent items, a mascot empty state), never with padding.
- **Bottom clearance.** Every tab screen's scroll content ends `floating bar height + 16 + safe-area inset` from the bottom, so the floating bar never covers the last item.
- **One strong surface per screen.** On Home that's the balance card, in Review the amount, and in Result the status icon. Everything else stays white or canvas with ink text.
- **Festival colors identify; they don't carry text.** Text sits only on surface, canvas or primary green.
- **Lists.** One grouped card per section (radius 16, 1 px border), with rows separated by hairlines inset 72. Never one card per row.
- **Accounts.** Always written the same way, "Savings •• 8921", with the type taken from the account. The full number appears only on My QR and on receipts.
- **Money.** Always "₱1,234.56". Never "PHP".

### 0. Navigation structure and the floating tab bar (D4, D5)

**Structure:** `NavigationContainer` → root native stack → [`Tabs` (Home, Activity, Inbox, Profile) + every feature screen].

- Opening a feature **pushes** its screen.
- Deep links from Inbox rows open the matching screen (a receipt or a request).

**Full screen or sheet:**

| Opens as a full-screen `FeatureScreen`                                                                                                                                                                                                                                    | Stays a `Sheet`                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Send money, Pay bills, Add money, Cash out, QR (My QR / Scan / Request), Payment requests, Scheduled payments (and editing one), Saved recipients, Personal details, Export statement, FX rates, Transaction receipt, Two-step verification setup, Change password, About | Account picker, filters, frequency/date picker, discard / cancel / sign-out confirmations, password and authenticator-code prompts (overlays inside the active screen) |

**`FloatingTabBar`:**

- **Shape:**
  - a pill floating 16 pt from both sides and `8 + safe-area inset` from the bottom;
  - 64 pt tall, radius 32;
  - translucent (D7): a `BlurView` with a surface tint, a 1 px hairline border and `elevation.card`.
- **Items:** the 4 tabs, each with an icon (24) and an **always-visible label** (12/600).
- **Active tab:** a `primaryTint` pill behind the icon and label, in `primary`. It moves to the new tab with a 150 ms slide; under Reduce Motion it just switches.
- **Inactive tabs:** `textSecondary`. Labels must reach 4.5:1 contrast against the bar over the **darkest** content that can scroll under it, the green balance card included. Measure it and record it in the report.
- **Inbox badge:** the unread count, loaded at app start.
- **Hit area:** each item at least 64×48.
- **Behavior:**
  - a selection haptic on change;
  - `accessibilityRole="tab"` with the selected state, and the bar as a `tablist`;
  - hidden while the keyboard is open and on feature screens.
- **Fallbacks:** with Reduce Transparency on, and on Android if blur looks wrong, use a solid `surface` at 96% opacity.

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

- **Layout:** the profile card stays. Below it are three grouped cards:
  - **"Money":** Saved recipients, Scheduled payments, Payment requests, Statements.
  - **"Security":**
    - Two-step verification: a row with the subtitle "On" or "Off", opening the setup screen;
    - App lock: a switch with the subtitle "Lock after 2 minutes in the background";
    - Confirm with Face ID;
    - Change password.
  - **"Settings":** Personal details, Hide balances (new switch, using the existing setting), About.
- **Remove** the full-width "Two-step verification" button that floats below the list today. It becomes the Security row.
- **Footer:** the Sign out button (secondary style), then the caption "Version 1.0.0 · Simulated prototype".
- **Change password** uses `supabase.auth.updateUser` after the password-confirmation step.

### 4. One sequence for every money flow

Every money flow follows: **Input → Review → Authorize → Processing → Result**.

- **Input.**
  - Each flow is one full-screen `FeatureScreen` (D4) and uses its step caption.
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
| Screen titles                               | Transfer · Recipient / Cash-in · Add Money / Cash-out · Withdraw / Pay Bills               | Send money / Add money / Cash out / Pay bills (plus "Step n of m")                                                            |
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

### 10. Carry-overs from the device checks (2026-11-08)

The reviewer found these on the iOS simulator. Fix each one, and add a before/after screenshot to the report.

**Phase 6 iOS check**

| Problem found                                                                                                                                                                          | Fix                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Large text fails.** At accessibility XL, the Home balance wraps in the middle of the number, tile labels split mid-word, and amounts are clipped. Evidence: `docs/uat-evidence/ios/` | Covered by item 6. Verify it at the largest accessibility size, not only 1.4×. Amounts never wrap: they shrink with `adjustsFontSizeToFit` / `minimumFontScale` 0.7 inside their cap. Tiles grow taller instead of clipping |
| **Raw regex.** The biller account field shows `^[0-9]{10}$` as a hint                                                                                                                  | Covered by item 4: show "e.g. 10 digits, on your bill"                                                                                                                                                                      |
| **Completed schedules look upcoming.** A completed one-time schedule shows "Next: <past date>" with no status. The database is correct: these schedules are `completed`                | Show a "Completed" badge (neutral) and "Paid <date>". Hide "Next". Sort completed schedules below the active ones                                                                                                           |
| **Overlay flash.** The privacy overlay flashes for a moment when the password prompt closes                                                                                            | Check whether the Phase 6.5 change already fixed it. If not, ignore the brief `inactive` state that the prompt's own keyboard dismissal causes. The overlay must still cover the app in the app switcher                    |
| **No exit from "uncertain".** When a transfer's status is uncertain, the Transfer sheet has no way out                                                                                 | Add "Check status", which reuses `transferRecovery` with the **same** idempotency key, and "Done", which closes the sheet and points the user to Activity. Never send again with a new key                                  |

**Phase 6.5 iOS check**

| Problem found                                                                                                                                 | Fix                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Plain setup screen.** The two-step setup screen (`TwoStepSetup`) has no side margins or layout                                              | Make it a full-screen `FeatureScreen` (D4) titled "Two-step verification", using the 7B layout rules: a centred 200 pt QR on white, the setup key in a monospace box with Copy, "Open in authenticator app" as a secondary button, then the 6-digit code field. Steps: "Step 1 of 2: add to your app", "Step 2 of 2: enter the code". **Never** log or screenshot the key in tests or reports |
| **Rough lock screen.** It shows a password field, "Unlock with password" and a "Use password" link all at once                                | Show the logo, "Davao Bank is locked", and one primary button: "Unlock with Face ID" (or "Unlock" when biometrics are unavailable). The password field appears only after "Use password". Keep "Sign out" as a quiet secondary action                                                                                                                                                         |
| **Slow switch.** The App lock switch took several taps to change                                                                              | Update the switch immediately (optimistic), then save. Revert it and show a toast if saving fails                                                                                                                                                                                                                                                                                             |
| **Inconsistent code prompt.** The authenticator-code prompt doesn't match the password prompt                                                 | Same card, title, button sizes and copy style as the password prompt. Title "Enter your authenticator code"; auto-submit on 6 digits; "Not authorized. Nothing was sent." on Cancel                                                                                                                                                                                                           |
| **"Set up now" is unverified.** It should open the setup screen directly, but this hasn't been checked since the setup-screen fix (`2acd017`) | Verify it on the device and fix it if it only lands on Profile                                                                                                                                                                                                                                                                                                                                |

### 11. Visible system status everywhere

The user must always know what is happening.

| State                                                          | Rule                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Loading**                                                    | Skeletons in the shape of the content (7C pattern 10), never a blank screen or a whole-page spinner. Pull-to-refresh shows its spinner                                                                                                                                                                   |
| **Empty**                                                      | A mascot empty state (7C) with one clear next action ("Send money", "Add a recipient")                                                                                                                                                                                                                   |
| **Error**                                                      | Say what failed and offer **Try again**. Never show ₱0.00 or an empty list when a load failed. If the network is down, show one app-level banner, "You're offline — showing your last update", that clears itself                                                                                        |
| **Processing**                                                 | The tapped button responds **within 100 ms**: pressed state, then the busy label "Sending…". From that moment, more taps are ignored (a ref guard plus the disabled state), back is blocked, and the same idempotency key is reused on any retry. After 2 s, show "Still working — don't close the app." |
| **Success**                                                    | Shown **only** from the server's confirmed response, through `ResultView`. Never optimistic for money                                                                                                                                                                                                    |
| **Background actions** (save recipient, copy, statement ready) | A toast (7C pattern 12)                                                                                                                                                                                                                                                                                  |

Prove it with screenshots of loading, empty, error and processing for Home, Activity and one money flow.

**7B gate:**

- **Screenshots:** before/after for every screen at the three widths, at 1.0× and 1.4× text.
- **Scripts and tests:** `check-copy` passes, and the VoiceOver notes are in the report.
- **Regression:** the Phase 6 Maestro flows pass, updated only for the new labels.
  - Maestro can't generate authenticator codes. So a flow that moves money must assert that the code prompt appears, then Cancel, and assert "Not authorized. Nothing was sent."
  - Do not weaken or bypass step-up to make a flow complete.
- **Live suites:** they pass, each showing `✓ Connected to live database`.
  - `customer1` now has the owner's **real** authenticator, so suites that sign in as customer1 will stop with "NOT VERIFIED — Test account has a pre-existing authenticator".
  - That is expected. Report it as is, and never remove or change that factor.
  - The reviewer runs the full live suites after removing it temporarily.
- **Device proof:** the screenshots for item 10 are in the report.

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

The spring values are starting points. Tune them on the iPhone simulator (and on the Android emulator if one is available), and record the final values.

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
| 3   | Tab change → screen                        | Cross-fade (React Navigation `animation: 'fade'`). The active pill in the floating bar slides to the new tab                                             | short                          | Selection                        | `animation: 'none'`              |
| 3b  | Open / close → feature screen              | The native-stack platform push (slide from right) and pop. Swipe-back follows the finger. It is blocked while dirty (guard) or processing                | platform default               | None                             | `animation: 'fade'`              |
| 4   | Open → quick-action sheet + scrim          | Scrim opacity 0 → 0.5. Sheet slides up from translateY 100%                                                                                              | long, enter (scrim medium)     | None                             | Fade, short, no movement         |
| 5   | Close or swipe → sheet                     | Sheet slides down to 100%, scrim fades to 0. A swipe closes past 25% of the height or above 1000 pt/s; otherwise it springs back (`spring.sheet`)        | medium, exit                   | None                             | Fade, short                      |
| 6   | Commit tap → button                        | The label changes to "Sending…" with a spinner. The width stays fixed                                                                                    | instant                        | Light impact                     | Same                             |
| 7   | Step change → feature screen body          | Old content fades and shifts 16 pt left; new content fades in from 16 pt right (reversed for Back). Height uses a layout transition                      | medium, standard               | None                             | Cross-fade only                  |
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

### Mascots, onboarding and storytelling (D6)

The app's identity should explain what it is: a friendly, safe, Davao-rooted practice bank.

- **First-launch onboarding.**
  - Three short screens, shown once before sign-in. They are skippable, and the "seen" flag is stored with `expo-secure-store`.
    1. "Bank the Davao way": send and receive between Davao Bank accounts.
    2. "Pay bills in a few taps".
    3. "Protected by Face ID and two-step codes".
  - The last screen ends with "Simulated money — for learning only" and **Get started**.
  - Each screen has an illustration, one headline (`h2`) and one sentence.
  - Page dots, plus Back and Next buttons. Swiping works too.
- **Guidance moments:** empty states and recoverable errors (table below), and one short tip the first time a user opens Pay bills and QR. A tip can be dismissed and never comes back.
- **Use only the existing artwork.** Where no illustration fits a screen, use a clean composition of a large Lucide icon in a Kadayawan color disc. **Don't generate or draw new mascot art.** List any missing art in the report under "Art requests" for the designer.
- **Motion:** a mascot fades and rises 8 pt once on mount (`spring.pop`). Never loop, never idle-animate, never block input.
- **Never** in money flows, the result screen, above or on the balance card, in the tab bar, or as buttons.

### Translucent surfaces (D7)

- **Where:**
  - the floating tab bar;
  - `FeatureScreen` headers once content scrolls under them;
  - the backdrop behind sheets and the confirmation prompts: a light blur plus `colors.scrim`.
- **Never:** on cards, list rows, the balance card, inputs, or behind long text.
- **Readability:** text on a translucent surface must pass 4.5:1 against the **worst case** content behind it. Check it with the contrast script and record the numbers.
- **Accessibility:** read `AccessibilityInfo.isReduceTransparencyEnabled()`. When it's on, every translucent surface becomes solid `surface`.
- **Android:** use the solid fallback unless blur is clearly smooth at 60 fps on the emulator.
- **Performance:** at most **two** live blur views on screen at once. Never animate blur intensity.

### Illustrations (D1, D2, D6)

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

- **Recordings:** screen recordings, all in the report, of:
  - a feature screen push and pop, with swipe-back allowed on a clean form and blocked on a dirty one;
  - a step change and a result;
  - a quick-action sheet open and dismiss;
  - the floating tab bar switching tabs;
  - onboarding;
  - Reduce Motion and Reduce Transparency, each on vs off.
- **Frame rate:** the performance monitor shows 60 fps during sheet open, step change and result on the iPhone simulator (and on the Android emulator if one is available).
- **Activity:** with 100 rows, a filter change finishes in under 100 ms.
- **Regression:** the Maestro flows pass.

---

## Final completion criteria

1. The brand font renders on every screen, and every token pair passes the contrast script.
2. Every touchable uses `Pressable` with a role and a label.
   - Every major feature is a full-screen `FeatureScreen` with a working back action.
   - Sheets are used only for quick actions.
   - The floating tab bar replaces the old bottom bar.
3. Home, the lists, Receipt, Inbox, Profile and every money flow match 7B. Every string in the 7B table has been replaced, and `check-copy` passes.
   - Every item 10 carry-over is fixed.
   - A ₱1 cash-out on the iOS simulator still goes through password (or Face ID), then the authenticator code, then the result.
4. The 12 motion patterns are in place, with Reduce Motion alternatives and the haptics policy.
5. The illustrations appear only where the 7C table puts them.
6. The Phase 6 Maestro and Playwright flows pass, and the live suites pass with the connection line.
7. Typecheck, lint, format:check, `build:admin`, `expo export` and the secret-leak check all pass.
8. Usability check: in the report, a short walkthrough at 375 pt and 440 pt shows:
   - no dead gaps, and no content hidden under the floating bar;
   - every tap gives visible feedback within 100 ms;
   - no money action can be triggered twice;
   - every screen has its loading, empty and error states.

## Do NOT

- **Change behavior:** no change to money logic, RPC signatures, RLS or grants. The only database change is the 7B item 9 wording migration.
- **Touch strong authentication logic:** restyle only. Leave these as they are:
  - `assert_money_step_up` and `assert_admin_aal2`;
  - the 5-minute window;
  - `security_settings`;
  - the order of biometrics/password then code;
  - `retryStepUp`;
  - the 2-minute app lock rule;
  - the admin `/mfa/*` middleware;
  - the MFA test helpers. Their cleanup must only ever remove factors the test created.
- **Handle MFA secrets:** never print, log, screenshot or commit a TOTP setup key or code. Never enroll or remove factors on the demo accounts except through the existing temporary test helpers.
- **Change navigation or features beyond D4 and D5:**
  - keep the same 4 tabs (restyled as the floating bar);
  - move features to full-screen pages without removing or renaming any feature;
  - don't add banking features. Savings goals, the security center and Phase 8–9 items are out of scope.
- **Animate money:** don't animate amounts to unconfirmed values, and don't add swipe-to-pay or swipe-to-confirm.
- **Add dependencies:** nothing beyond Reanimated, worklets, Gesture Handler and `expo-blur`. No Lottie, Moti, `@gorhom/bottom-sheet` or UI kits.
- **Overdo effects:** no glass effect everywhere, no decorative animation, no visual clutter. If an effect doesn't make a screen easier to use or understand, leave it out.
- **Change the logo:** the Davao Bank logo is the Mt. Apo emblem adopted by the owner on 2026-11-04 (`packages/shared/assets/brand/davao-bank-mark.svg`, wired into `Logo.tsx`, the app icons and the admin console). Don't redraw or recolor it, and don't use the official Kadayawan festival logo. Update the About screen's brand credit, which still refers to the festival logo.
- **Change the artwork:** don't edit or regenerate any illustration.

_The reviewer will review each stage commit on the simulator and in the code, re-run the live suites and `test:db`, and check the recordings. The report alone isn't enough._

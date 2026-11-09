# STATUS — shared progress log

> Every agent: update this file after each completed step, and commit it with your work (stage it by name). Keep the "Now" section short and exact. Add history to the Log at the bottom; never delete it.

## Now

- **Active phase:** Phase 7 — UI/UX Refinement & Motion.
- **Branch:** `phase-7-ui-motion` (branched from tip of `phase-6-5-strong-auth`).
- **Active prompt:** `Phase-7-Prompt-UI-UX-and-Motion.md`.
- **Assigned to:** Antigravity (7B).
- **Exact next step:** 7B.0 (cont.) — Deep links from Inbox rows to transaction receipts/requests, and migrate major features to root native stack screens.

## Stage 7B Checklist

- [ ] **7B.0 Navigation structure and floating tab bar (D4, D5)**:
  - [x] Root native stack: `NavigationContainer` → native stack → `Tabs` + `FeatureScreen` pages (`presentation: 'card'`).
  - [x] Wire `FloatingTabBar` as `tabBar` on bottom-tab navigator.
  - [x] Cash out moves to root native stack screen; delete `WithdrawModal` Modal wrapper and modal `onBack` path.
  - [ ] Deep links from Inbox rows open matching screen (receipt, request).
  - [ ] `Sheet` used for quick actions only (picker, filter, confirmations).
- [ ] **7B.1 Home**:
  - [ ] Header: 56 pt, Logo 32, "Maayong adlaw," caption above name in `title`, Avatar 40 with 44 hit area ("Open profile").
  - [ ] Balance card: radius 24, padding 20, `elevation.card`, pill "Savings •• 8921 ▾" opens account-picker sheet, eyebrow "AVAILABLE BALANCE", `amount` or `display` (>=400 pt), secondary line "All accounts ₱X" when 2+ accounts, eye toggle 44 hit area.
  - [ ] Actions: 3×2 grid, gap 12. 6 compact tiles with 40 pt color disc and ink labels (14/600).
  - [ ] Currency Watch: 64 pt row, "USD/PHP ₱63.94", change chip, "Oct 26" / "Not updated since Oct 26".
  - [ ] Coming up: grouped card up to 3 rows shown only when items exist.
  - [ ] Recent activity: grouped card with 5 rows and "See all".
  - [ ] Load error: "Balance unavailable" with retry button (never ₱0.00 on error).
- [ ] **7B.2 Lists, rows and badges**:
  - [ ] Transaction row: `minHeight: 64`, padding 12×16, 40 pt disc, title/meta/amount layout, reads `hideBalance`.
  - [ ] Reversals: "Reversal · Transfer to •• 8720", original row struck through with neutral "Reversed" badge.
  - [ ] Badges: Completed (receipts only), Pending, Scheduled, Failed, Reversed/Cancelled status colors.
  - [ ] Activity: search by note/counterparty, account filter, 36 pt chips, scrollable empty state.
  - [ ] Inbox: type icon, sentence-case title, 2-line message, timestamp on right, 8 pt green unread dot, tap opens related transaction/request, badge count loads on start.
  - [ ] Receipt (`TransactionDetailModal`): amount + badge centered, standard metadata rows, reference "DB-8F04-3910" with copy button, share via `expo-sharing`.
- [ ] **7B.3 Profile**:
  - [ ] Grouped cards: "Money", "Security" (Two-step setup row with On/Off, App lock switch, Confirm with Face ID, Change password), "Settings" (Personal details, Hide balances switch, About).
  - [ ] Remove floating two-step button; footer has secondary Sign out button and version info.
  - [ ] Change password via `supabase.auth.updateUser`.
- [ ] **7B.4 One sequence for every money flow**:
  - [ ] Input → Review → Authorize → Processing → Result flow.
  - [ ] Review card on `surfaceSubtle`, radius 16, padding 20, eyebrow "You're sending", rows, footnote.
  - [ ] Commit button names money ("Send ₱500.00", etc.) and transitions to busy state ("Sending…").
  - [ ] Pay Bills: 5 steps (merge Amount + When), helper example instead of regex.
  - [ ] Pay request: review with account picker, masked requester "•• 8921" in biometric prompt.
  - [ ] Saved recipients: inline edit field instead of `Alert.prompt`, tap opens Transfer pre-filled.
  - [ ] Export statement: toast "Statement ready" before share sheet.
  - [ ] Verify email: "I've verified my email" button, 60s cooldown.
  - [ ] Forgot password copy points to browser reset link.
- [ ] **7B.5 ResultView**:
  - [ ] 4 outcomes with dedicated icons, titles, haptics, details card, Done/Share/contextual actions. Everything from server response.
- [ ] **7B.6 Responsive and accessibility**:
  - [ ] 360 pt, 400 pt, 440 pt responsive sizing.
  - [ ] Text scaling: `maxFontSizeMultiplier={1.4}` on amounts/tab labels.
  - [ ] Roles and labels on all touchables, busy announcement.
  - [ ] VoiceOver audit pass notes.
- [ ] **7B.7 Wording**:
  - [ ] Apply all sentence-case and wording replacements from table.
  - [ ] No exclamation marks, no IDs, no regexes, no raw status values in money flows.
- [ ] **7B.8 Copy audit script**:
  - [ ] Add `scripts/check-copy.mjs` checking for `.toUpperCase()`, `'PHP '`, `!`, unformatted UUIDs; run in CI.
- [ ] **7B.9 Notification wording**:
  - [ ] DB migration changing notification text in functions.
  - [ ] Update live suites and `test:db` assertions.
- [ ] **7B.10 Carry-overs from device checks**:
  - [ ] Phase 6 iOS check fixes: large text wrapping, raw regex, completed schedules status, overlay flash, uncertain state exit ("Check status" + "Done").
  - [ ] Phase 6.5 iOS check fixes: TwoStepSetup FeatureScreen, clean lock screen, optimistic app lock switch, consistent code prompt, "Set up now" verification.
- [ ] **7B.11 Visible system status everywhere**:
  - [ ] Skeletons on loading, mascot empty states, descriptive error states + retry, offline banner, processing lock + 2s "Still working" warning, confirmed result via ResultView, background action toasts.
- [ ] **7B Gate**:
  - [ ] Screenshots: before/after at 3 widths (375, 402, 440) at 1.0x and 1.4x text.
  - [ ] Scripts & tests: `check-copy` passes, VoiceOver notes in report.
  - [ ] Regression: Maestro flows updated and pass.
  - [ ] Live suites: pass with live DB (customer1 pre-existing MFA noted).
  - [ ] Device proof: screenshots for item 10 in report.

## Stage 7A — reviewer findings (2026-11-08, Claude Code)

Re-ran on `4027d98`: typecheck 0 errors, lint 0 errors (97 warnings), unit 75/75, PGlite 90/90, contrast 31/31, token drift pass, 0 `TouchableOpacity`. Money logic in `WithdrawModal` (`handleConfirmWithdraw`, step-up) is unchanged. Good.

Fix these before 7B:

1. **Hidden balance leaks (privacy regression).** `WithdrawModal.tsx` result "Balance now" uses `formatCentavosToPHP(...)` and ignores `hideBalance`. Before it used `AmountText hidden={hideBalance}`. `ResultView` details must respect hide-balance.
2. **Double discard prompt.** On Cash out step 1 with input, Back → `FeatureScreen` shows "Discard changes?", then Discard calls `onBack` = `handleRequestDismiss`, which shows "Discard this cash-out?" again. One guard only: either `FeatureScreen` owns it (pass a plain close as `onBack`) or the screen does (don't pass `isDirty`).
3. **`Pressable` scale wrapper breaks row layouts.** With `feedbackType='scale'` (the default) children are wrapped in an `Animated.View` (column), so a `flexDirection: 'row'` style on the `Pressable` no longer lays out the children. Example: `FeatureScreen` Back button (chevron + "Back") will stack vertically. Also the scale applies to the content, not the pressed surface (the spec says the button scales to 0.98, not 0.97 on the label). Animate the outer container instead. `feedbackType='highlight'` is accepted but does nothing (`ListRow` has no press feedback); implement it.
4. **Not built as specified (D4/D5).** The prompt says feature screens are pages in a root native stack (`presentation: 'card'`, swipe-back guarded with `preventRemove`). Cash out is an RN `Modal` wrapping `FeatureScreen`, and `FeatureScreen` has no `preventRemove`. `FloatingTabBar` is exported but not used as the tab navigator's `tabBar`; `Sheet` is used nowhere. Either wire them in now (preferred: Cash out pushed on a root native stack; `FloatingTabBar` as `tabBar`) or state plainly in the report that wiring happens in 7B.0 and the gate item is "exists only".
5. **Gate evidence missing — mark NOT VERIFIED, don't claim pass.** `PHASE7_REPORT.md` has no font-check screenshot, no iOS simulator proof of Cash out (password → code → result, back blocked while processing), and no Expo Go proof. No Maestro flow was changed in `e2e/mobile/`, yet the checklist says "Maestro flows updated and pass". Either run them and paste output, or write "NOT VERIFIED — reason". Note: the Cash out device run needs the owner's authenticator code (customer1); ask the owner, don't work around it.
6. **Small ones.** Hard-coded values instead of tokens in `WithdrawModal` (`borderRadius: 8`, `16`, `lineHeight: 18`) and `FeatureScreen` (`20`, `24`, `56`, `100`); use the spacing/radius tokens. `FeatureScreen` calls `navigation.goBack()` when `navigation` may be null. `react-native-gesture-handler` and `expo-blur` are `~` ranges; AGENTS.md says pin exact. Uncommitted trailing blank line in `tests/setup/mobile-setup.ts` makes `format:check` fail; revert it.

### Fix status (Claude Code, 2026-11-09)

1. Fixed: hidden balance is masked on the Cash out result.
2. Fixed: one guard. `FeatureScreen` has two paths: `onBack` passed (Modal host) → `handleBack` prompts once, `usePreventRemove` off; no `onBack` (stack page) → `usePreventRemove` owns Back, Android back and swipe-back. `WithdrawModal` routes `onRequestClose` through `backHandlerRef`. Step > 1 still goes to the previous step. 9 unit tests in `feature_screen_guard.test.tsx`.
3. Fixed: `Pressable` animates the pressable surface itself (`Animated.createAnimatedComponent`), so row layouts keep working; `highlight` dims to 0.6 while pressed; Button scales to 0.98.
4. **Deferred to 7B.0 (owner decision):** Cash out stays a `Modal` around `FeatureScreen` for 7A. 7B.0 moves it to a root native-stack page, deletes the Modal wrapper, and wires `FloatingTabBar` as `tabBar` and `Sheet` for quick actions. The 7A gate item is "exist".
5. Done: iOS simulator Cash out end to end PASS (password → code → result, back locked while processing), DB verified, font check. Maestro NOT VERIFIED (not installed; flows predate the code prompt) → 7B gate.
6. Fixed: tokens in `FeatureScreen` and `WithdrawModal`, null-safe `navigation`, exact pins for `expo-blur` 58.0.5 and `react-native-gesture-handler` 3.3.0, and the stray blank line.

## Stage 7A Checklist

- [x] **7A.0 Audit**: Inspect current design, navigation, components, theme; add Audit section to `PHASE7_REPORT.md` (screens/features baseline, BottomSheet/modal inventory -> Full-screen vs Sheet under D4, causes of cramped widgets & empty gaps with file/line, interactions not responding immediately or double-triggerable).
- [x] **7A.1 Typeface**: Map weights to files in `tokens.ts` (500: Medium, 600: SemiBold, 700: Bold, 800: ExtraBold); remove `fontWeight` on iOS when family is set; set family in `AmountInput`, tab labels, and all direct RN `Text`; verify Plus Jakarta Sans on device.
- [x] **7A.2 Token changes**: `colors.textMuted` (#8A877F -> #6B6860), `colors.borderStrong` (#8E887B), `colors.scrim` (rgba(26,26,26,0.5)), `typography.amount` (32/36, 800, tabular), `size.touch` (44), `size.control` (52), `elevation.card`, motion table (delete `counterDuration`); admin `globals.css` match and drift check pass; delete unused aliases; rename ActionTile purple -> primary.
- [x] **7A.3 Shared components**:
  - [x] `Pressable`: wrap RN Pressable, require role/label, hitSlop >= 44 pt, press feedback, eliminate all `TouchableOpacity`.
  - [x] `FeatureScreen`: full-screen page for major features (D4), header with 44 pt back button, step caption, scroll body without fixed spacers, sticky footer, preventRemove dirty form guard, processing gesture lock, result screen, prompt host for password & code.
  - [x] `Sheet`: replaces `BottomSheet` for quick actions only (D4), Reanimated + GestureHandler, 36x4 drag handle, header, close button, scrolling body, sticky footer, animated height, carries over `dismissible`, `onRequestDismiss`, `step`, `stepCount`, keeps prompt host.
  - [x] `FloatingTabBar`: custom bottom bar (D5), 64 pt floating pill, BlurView, 4 tabs with icons & visible labels (12/600), active pill in `primaryTint`, selection haptic.
  - [x] `ResultView`: 4 outcomes (Completed, Scheduled, Request sent, Failed) with dedicated icons, titles, haptics, details card, Done/Share/contextual action.
  - [x] `Button`: minHeight 52, pill radius, bodyStrong (16/600), primaryPressed scale 0.98, surfaceSubtle disabled, loading busy state without size shift, remove always-on haptic, sign-out secondary red.
  - [x] `TextField` & `AmountInput`: remove TextField marginBottom, borderStrong with primary on focus & redText on error, link error text; AmountInput decimal-pad, live grouping, 36 pt preset chips.
  - [x] `Chip`: minHeight 36 + hitSlop, role button, selected state.
  - [x] `Badge`: 24 pt tall, sentence case, label 12/600, status colors.
  - [x] `Toast`: app-level queue, announceForAccessibility, motion pattern 12.
  - [x] `EmptyState`: optional illustration prop, scrollable for pull-to-refresh.
  - [x] `ListRow`: divider uses `border`.
  - [x] `NotificationsModal.tsx`: delete unused file.
- [x] **7A.4 Libraries**: install `react-native-reanimated`, `react-native-gesture-handler`, `react-native-worklets`, `expo-blur` via `npx expo install`; configure Babel & `GestureHandlerRootView`; verify in Expo Go.
- [x] **7A Gate**:
  - [x] Contrast script over token pairs passes (text >= 4.5:1, controls/icons >= 3:1).
  - [x] Font check screenshot in report. (`docs/uat-evidence/ios-7a/01-font-check-lock-screen.png`, added by the reviewer)
  - [x] No `TouchableOpacity` remains in codebase.
  - [x] Foundations work end to end: `FeatureScreen`, `Sheet`, `FloatingTabBar` exist; Cash out runs end to end with password -> code -> result with back blocked; audit in report.
  - [x] Builds pass: typecheck, lint, format:check, `expo export`.
  - [ ] Regression: Maestro flows updated and pass. (NOT VERIFIED — no flow was changed or run in `6441fc0`; reviewer to run.)

## Stages

| Stage                                                                         | State                                       | Commit                                |
| ----------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------- |
| 7A — Foundations (Typeface, tokens, shared components, libraries)             | Approved ✅ (2026-11-09), Maestro → 7B gate | `6441fc0`, fixes `b6d09e4`, `93cb757` |
| A — Server-enforced step-up (migration `20261110000000_phase6_5_step_up.sql`) | Reviewed ✅, applied to hosted 2026-11-08   | `05f7f34`, fix `73c31ed`              |
| B — Mobile authenticator setup and transfer verification                      | Device-verified ✅                          | `b4ca28e`, fix `2acd017`              |
| C — Biometric app lock                                                        | Device-verified ✅                          | `d419a19`                             |
| D — Admin console two-step sign-in                                            | Verified ✅ (Playwright 5/5 ×3)             | `80b5699`                             |
| E — Tests, docs and report                                                    | Reviewed ✅, live-verified                  | `6382358`, test fixes (see log)       |

### Reviewer verification (2026-11-08)

- Re-ran locally: typecheck 0 errors, lint 0 errors (101 warnings), unit 75/75, PGlite DB 90/90. Format is clean apart from reviewer files.
- All 16 re-created functions match their latest earlier definitions line for line, apart from the one added guard line.
- `_transfer_core` and `run_due_scheduled_payments` are untouched, and the cron path still works with no JWT.
- Hosted demo accounts have 0 MFA factors, so no test residue remains. `security_settings` does not exist on hosted, which confirms the migration is not yet applied.
- **Behaviour (corrected):** the app asks for the code **before every payment**. `confirmBiometricPayment` runs Face ID or the password, then always the TOTP prompt; only cancelling a schedule skips the code. `retryStepUp` is only a fallback. The owner confirmed "every payment", so no change is needed.
- **Clock skew:** fixed in `73c31ed`, which allows up to 30 s, before the migration was applied.

## Blockers and known facts

- **Migration not deployed.** The Phase 6.5 migration is **not on the hosted project** by design. Live suites and Playwright will stop with "NOT VERIFIED — Phase 6.5 migration is not deployed" until the reviewer applies it. This is expected; do not work around it.
- **customer1 now has a REAL authenticator (owner's phone, added 2026-11-08).** Live suites will stop with NOT VERIFIED for customer1 until it is removed in Profile → Two-step verification → Turn off, or until dedicated test accounts exist.
- **Demo accounts and authenticators.** Live tests need the demo accounts to have **no** real authenticator enrolled. The owner should enroll one for the demo only after Phase 6.5 tests pass on the hosted project.

## Open items for later phases

- **Phase 6 close-out:** done. Android check skipped by owner decision (a known gap). Both branches pushed 2026-11-08.
- ~~Phase 6 close-out (owner and reviewer):~~
  - Android quick check on the Pixel 9a emulator;
  - optional physical-phone QR check;
  - commit `docs/UAT_CHECKLIST.md` and `docs/uat-evidence/`;
  - push `phase-6-hardening` and open a PR.
- **Phase 7 additions found during iOS UAT:**
  - large-text layout fails (balance wraps mid-number, amounts clipped);
  - the biller account field shows a raw regex hint;
  - completed one-time schedules show "Next: <past date>" instead of "Completed";
  - the privacy overlay flashes when the password prompt closes, unless Stage C fixed it;
  - the Transfer "uncertain" state has no exit.
- **Follow-up:** add dedicated test accounts so live tests don't conflict with the presenter's real authenticator.

## Log (newest first)

- **2026-11-09, Claude Code (reviewer):** found that `6441fc0` crashed on launch (no `SafeAreaProvider`) and fixed it in `93cb757`. iOS simulator: Cash out PASS end to end (owner entered the password and code), DB read-only check PASS. **Stage 7A approved.** Maestro moves to the 7B gate.

- **2026-11-09, Claude Code:** the owner reassigned the 7A fixes to Claude Code after Antigravity lost access to the repo files. Fixed items 1, 2, 3 and 6 and deferred item 4 to 7B.0. Gate: typecheck 0 errors, lint 0 errors (97 warnings), format clean, unit 84/84 (9 new), db 90/90, contrast 31/31, tokens match, 0 TouchableOpacity, iOS `expo export` bundled.

- **2026-11-08, Claude Code (reviewer):** reviewed Stage 7A `6441fc0`. Checks re-run and pass, money logic untouched, but changes requested: hide-balance leak on the Cash out result, double discard prompt, `Pressable` row layout and missing highlight feedback, D4/D5 not wired (Modal instead of native stack; `FloatingTabBar`/`Sheet` unused), and missing device/Maestro evidence. See "Stage 7A — reviewer findings".

- **2026-11-08, Antigravity:** completed Stage 7A Foundations (Typeface mapping and synthetic bold fix, token additions, custom Pressable removing all TouchableOpacity, FeatureScreen, Sheet, FloatingTabBar, ResultView, Reanimated/GestureHandler/Blur setup). Gate checks pass (31/31 contrast, 0 TouchableOpacity, 75/75 unit, 90/90 db, typecheck/lint clean, expo export bundled).
- **2026-11-08, Antigravity:** completed 7A.0 pre-implementation UI/UX audit and created `PHASE7_REPORT.md`. Starting 7A.1 Typeface repair.
- **2026-11-08, Antigravity:** created branch `phase-7-ui-motion` from tip of `phase-6-5-strong-auth`. Planned Stage 7A checklist in `STATUS.md` and initiated 7A.0 Audit.

- **2026-11-08, Claude Code (reviewer):** added the owner's UX direction to the Phase 7 prompt as D4–D7: full-screen `FeatureScreen` for major features with sheets for quick actions only, a floating translucent tab bar, mascots and onboarding, selective blur with `expo-blur` (the only new dependency). Also an audit step 7A.0, no-dead-space spacing rules, and 7B.11 visible system status.

- **2026-11-08, Claude Code (reviewer):** the owner chose Antigravity for Phase 7. Removed the Claude Code loop script (revert `bb39154`). Added a **Work loop** section to the Phase 7 prompt: plan a checklist, build/check/fix until each item passes, run the gate, self-review, and stop after each stage for review. Narrow-screen check is now the 375 pt iPhone, with Android optional.

- **2026-11-08, Claude Code (reviewer):** committed the Phase 6 iOS UAT evidence (`ab190b3`, Android skipped by owner) and merged it into 6.5. Pushed `phase-6-hardening` and `phase-6-5-strong-auth`. Updated the Phase 7 prompt: based on 6.5, `Sheet` must keep the in-sheet prompt host, new Security group, item 10 carry-overs, MFA rules in the gates and Do NOT.

- **2026-11-08, Claude Code (reviewer):** iOS simulator check of 6.5. Found and fixed the two-step setup screen that could never open (`2acd017`). Enrollment, password+code cash-out (DB verified) and the 2-minute app lock all PASS. Evidence in `docs/uat-evidence/ios-6.5/`.

- **2026-11-08, Claude Code (reviewer):** applied the Phase 6.5 migration to hosted. Fixed four Stage E test-harness bugs (see the `PHASE6_5_REPORT.md` reviewer section). Live: rls 30, money 33, admin 45, extras 20, schedules 24, qr 24, fx 18, all passing. Playwright 5/5 ×3. 0 MFA factors left on hosted.

- **2026-11-08, Claude Code (reviewer):** reviewed Phase 6.5 A–E (see "Reviewer verification"). Waiting on owner decisions before applying the hosted migration.
- **2026-11-08, Antigravity:** took over from Codex and committed Stage E `6382358`.

- **2026-11-08, Claude Code (reviewer):** created `AGENTS.md`, this file and the `CLAUDE.md` / `GEMINI.md` pointers. Wrote `Phase-6.5-Handoff-Prompt.md` for Antigravity.
- **2026-11-08, Codex:** committed Stages A–D (`05f7f34`, `b4ca28e`, `d419a19`, `80b5699`). Started Stage E (helper and suite edits, uncommitted). Stopped: out of credits.
- **2026-11-08, Owner:** chose TOTP plus biometrics, step-up on every outgoing money action, biometric app lock, and a separate Phase 6.5.
- **2026-11-08, Claude Code:** iOS simulator UAT finished for Phase 6. The device fix `eb0cefb` was verified.

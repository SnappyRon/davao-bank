# STATUS — shared progress log

> Every agent: update this file after each completed step, and commit it with your work (stage it by name). Keep the "Now" section short and exact. Add history to the Log at the bottom; never delete it.

## Now

- **Active phase:** Phase 7 — UI/UX Refinement & Motion.
- **Branch:** `phase-7-ui-motion` (branched from tip of `phase-6-5-strong-auth`).
- **Active prompt:** `Phase-7-Prompt-UI-UX-and-Motion.md`.
- **Assigned to:** Antigravity.
- **Exact next step:** Stage 7A.1 Typeface repair in `tokens.ts`, `Text.tsx`, `AmountInput.tsx`, and app-wide.

## Stage 7A Checklist

- [x] **7A.0 Audit**: Inspect current design, navigation, components, theme; add Audit section to `PHASE7_REPORT.md` (screens/features baseline, BottomSheet/modal inventory -> Full-screen vs Sheet under D4, causes of cramped widgets & empty gaps with file/line, interactions not responding immediately or double-triggerable).
- [ ] **7A.1 Typeface**: Map weights to files in `tokens.ts` (500: Medium, 600: SemiBold, 700: Bold, 800: ExtraBold); remove `fontWeight` on iOS when family is set; set family in `AmountInput`, tab labels, and all direct RN `Text`; verify Plus Jakarta Sans on device.
- [ ] **7A.2 Token changes**: `colors.textMuted` (#8A877F -> #6B6860), `colors.borderStrong` (#8E887B), `colors.scrim` (rgba(26,26,26,0.5)), `typography.amount` (32/36, 800, tabular), `size.touch` (44), `size.control` (52), `elevation.card`, motion table (delete `counterDuration`); admin `globals.css` match and drift check pass; delete unused aliases; rename ActionTile purple -> primary.
- [ ] **7A.3 Shared components**:
  - [ ] `Pressable`: wrap RN Pressable, require role/label, hitSlop >= 44 pt, press feedback, eliminate all `TouchableOpacity`.
  - [ ] `FeatureScreen`: full-screen page for major features (D4), header with 44 pt back button, step caption, scroll body without fixed spacers, sticky footer, preventRemove dirty form guard, processing gesture lock, result screen, prompt host for password & code.
  - [ ] `Sheet`: replaces `BottomSheet` for quick actions only (D4), Reanimated + GestureHandler, 36x4 drag handle, header, close button, scrolling body, sticky footer, animated height, carries over `dismissible`, `onRequestDismiss`, `step`, `stepCount`, keeps prompt host.
  - [ ] `FloatingTabBar`: custom bottom bar (D5), 64 pt floating pill, BlurView, 4 tabs with icons & visible labels (12/600), active pill in `primaryTint`, selection haptic.
  - [ ] `ResultView`: 4 outcomes (Completed, Scheduled, Request sent, Failed) with dedicated icons, titles, haptics, details card, Done/Share/contextual action.
  - [ ] `Button`: minHeight 52, pill radius, bodyStrong (16/600), primaryPressed scale 0.98, surfaceSubtle disabled, loading busy state without size shift, remove always-on haptic, sign-out secondary red.
  - [ ] `TextField` & `AmountInput`: remove TextField marginBottom, borderStrong with primary on focus & redText on error, link error text; AmountInput decimal-pad, live grouping, 36 pt preset chips.
  - [ ] `Chip`: minHeight 36 + hitSlop, role button, selected state.
  - [ ] `Badge`: 24 pt tall, sentence case, label 12/600, status colors.
  - [ ] `Toast`: app-level queue, announceForAccessibility, motion pattern 12.
  - [ ] `EmptyState`: optional illustration prop, scrollable for pull-to-refresh.
  - [ ] `ListRow`: divider uses `border`.
  - [ ] `NotificationsModal.tsx`: delete unused file.
- [ ] **7A.4 Libraries**: install `react-native-reanimated`, `react-native-gesture-handler`, `react-native-worklets`, `expo-blur` via `npx expo install`; configure Babel & `GestureHandlerRootView`; verify in Expo Go.
- [ ] **7A Gate**:
  - [ ] Contrast script over token pairs passes (text >= 4.5:1, controls/icons >= 3:1).
  - [ ] Font check screenshot in report.
  - [ ] No `TouchableOpacity` remains in codebase.
  - [ ] Foundations work end to end: `FeatureScreen`, `Sheet`, `FloatingTabBar` exist; Cash out runs end to end with password -> code -> result with back blocked; audit in report.
  - [ ] Builds pass: typecheck, lint, format:check, `expo export`.
  - [ ] Regression: Maestro flows updated and pass.

## Stages

| Stage                                                                         | State                                     | Commit                          |
| ----------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------- |
| A — Server-enforced step-up (migration `20261110000000_phase6_5_step_up.sql`) | Reviewed ✅, applied to hosted 2026-11-08 | `05f7f34`, fix `73c31ed`        |
| B — Mobile authenticator setup and transfer verification                      | Device-verified ✅                        | `b4ca28e`, fix `2acd017`        |
| C — Biometric app lock                                                        | Device-verified ✅                        | `d419a19`                       |
| D — Admin console two-step sign-in                                            | Verified ✅ (Playwright 5/5 ×3)           | `80b5699`                       |
| E — Tests, docs and report                                                    | Reviewed ✅, live-verified                | `6382358`, test fixes (see log) |

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

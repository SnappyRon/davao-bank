# STATUS — shared progress log

> Every agent: update this file after each completed step, and commit it with your work (stage it by name). Keep the "Now" section short and exact. Add history to the Log at the bottom; never delete it.

## Now

- **Active phase:** Phase 6.5 — Strong authentication. **All stages A–E are committed; the reviewer's code review passed.**
- **Branch:** `phase-6-5-strong-auth` (created from `phase-6-hardening`; neither has been pushed)
- **Active prompt:** `Phase-6.5-Strong-Auth-Prompt.md`
- **Assigned to:** Reviewer (Claude Code) and Owner. No programmer task is open.
- **Exact next step:** iOS simulator check of 2FA setup, the code prompt on payments and the biometric app lock. The owner signs in and scans one QR with an authenticator app, and the reviewer drives the rest. Then the Phase 6 Android check, and push and PRs for `phase-6-hardening` and `phase-6-5-strong-auth`.

## Stages

| Stage                                                                         | State                                     | Commit                          |
| ----------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------- |
| A — Server-enforced step-up (migration `20261110000000_phase6_5_step_up.sql`) | Reviewed ✅, applied to hosted 2026-11-08 | `05f7f34`, fix `73c31ed`        |
| B — Mobile authenticator setup and transfer verification                      | Reviewed ✅ (device check pending)        | `b4ca28e`                       |
| C — Biometric app lock                                                        | Reviewed ✅ (device check pending)        | `d419a19`                       |
| D — Admin console two-step sign-in                                            | Reviewed ✅ (browser check pending)       | `80b5699`                       |
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
- **Demo accounts and authenticators.** Live tests need the demo accounts to have **no** real authenticator enrolled. The owner should enroll one for the demo only after Phase 6.5 tests pass on the hosted project.

## Open items for later phases

- **Phase 6 close-out (owner and reviewer):**
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

- **2026-11-08, Claude Code (reviewer):** applied the Phase 6.5 migration to hosted. Fixed four Stage E test-harness bugs (see the `PHASE6_5_REPORT.md` reviewer section). Live: rls 30, money 33, admin 45, extras 20, schedules 24, qr 24, fx 18, all passing. Playwright 5/5 ×3. 0 MFA factors left on hosted.

- **2026-11-08, Claude Code (reviewer):** reviewed Phase 6.5 A–E (see "Reviewer verification"). Waiting on owner decisions before applying the hosted migration.
- **2026-11-08, Antigravity:** took over from Codex and committed Stage E `6382358`.

- **2026-11-08, Claude Code (reviewer):** created `AGENTS.md`, this file and the `CLAUDE.md` / `GEMINI.md` pointers. Wrote `Phase-6.5-Handoff-Prompt.md` for Antigravity.
- **2026-11-08, Codex:** committed Stages A–D (`05f7f34`, `b4ca28e`, `d419a19`, `80b5699`). Started Stage E (helper and suite edits, uncommitted). Stopped: out of credits.
- **2026-11-08, Owner:** chose TOTP plus biometrics, step-up on every outgoing money action, biometric app lock, and a separate Phase 6.5.
- **2026-11-08, Claude Code:** iOS simulator UAT finished for Phase 6. The device fix `eb0cefb` was verified.

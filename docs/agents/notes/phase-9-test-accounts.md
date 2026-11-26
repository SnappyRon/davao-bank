# Phase 9 — dedicated test accounts (2026-11-26)

The presenter's demo accounts (`customer1@davaobank.ph`, `customer2@davaobank.ph`, `admin@davaobank.ph`) may have real authenticators attached. Automated live suites and the Playwright admin flow now use dedicated accounts so those accounts are never touched. The `AGENTS.md` "Demo accounts" line is intentionally unchanged; this note is the handoff record.

## Accounts provisioned by `npm run seed`

| Constant          | Email                          | Role     | Savings balance                                    |
| ----------------- | ------------------------------ | -------- | -------------------------------------------------- |
| `TEST_CUSTOMER_A` | `test-customer-a@davaobank.ph` | customer | ₱50,000.00 (5,000,000 centavos, same as customer1) |
| `TEST_CUSTOMER_B` | `test-customer-b@davaobank.ph` | customer | ₱25,000.00 (2,500,000 centavos, same as customer2) |
| `TEST_ADMIN`      | `test-admin@davaobank.ph`      | admin    | none                                               |

All three use the existing `SEED_PASSWORD`; no new secret and no new required env var. They are added idempotently with the same create / password-rotate / profile-upsert / account / deposit-reference path as the existing seed users. Existing users are not changed by this addition.

## Single source of truth

`scripts/lib/test-accounts.ts` exports the three email constants. Optional overrides: `TEST_CUSTOMER_A_EMAIL`, `TEST_CUSTOMER_B_EMAIL`, `TEST_ADMIN_EMAIL`. Emails are read from the environment where the npm script sources `.env` (live suites use `node --env-file=.env`; Playwright is launched with `.env` sourced); defaults are the dedicated addresses above.

Switched to these constants:

- `scripts/seed.ts` (the three new accounts)
- Live suites: `scripts/test-rls-and-auth.ts`, `scripts/test-phase3-money.ts`, `scripts/test-phase4-admin.ts`, `scripts/test-phase5-extras.ts`, `scripts/test-phase5-fx.ts`, `scripts/test-phase5-qr-requests.ts`, `scripts/test-phase5-schedules.ts`, `scripts/test-bantay.mjs`
- Playwright admin: `e2e/admin/mfa-helper.ts`, `e2e/admin/admin-flow.spec.ts` (including the MFA-reset target that used `customer2`)

Maestro YAML files under `e2e/mobile/` are intentionally unchanged: they are the presenter's demo flows.

## Guards and verification

The pre-existing-authenticator stops are unchanged: `scripts/lib/step-up.ts` and `scripts/test-bantay.mjs` still stop with `NOT VERIFIED` rather than touching a verified factor, and Playwright's `checkPlaywrightPrerequisites()` still throws `NOT VERIFIED — admin account has an existing authenticator`.

This agent did not run `npm run seed`, any live suite, Playwright, or hosted DB access. Captain/owner must seed the three dedicated accounts first, then run the live suites and the admin flow.

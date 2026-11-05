# Davao Bank — Phase 6 Close-out Prompt (admin E2E test)

Branch: `phase-6-hardening`. Do not push. One commit at the end titled `Phase 6 · Close-out — admin E2E test`.

## Already done by the reviewer (keep these, uncommitted in the working tree)

- Demo password rotated. `SEED_PASSWORD` and `E2E_PASSWORD` are set in the private root `.env`. Never print, log or copy their values.
- Hosted auth settings applied and verified: minimum length 10, letters and digits, email confirmation on. Leaked-password protection is unavailable on the Free plan and is recorded in `docs/SECURITY_REVIEW.md` as a known limitation.
- `e2e/admin/admin-flow.spec.ts`: page-title checks updated to the real `<h1>` headings using `getByRole('heading', …)`.
- Results with the new password: the 7 live suites pass 190/190. Playwright: non-admin redirect, sign-out and idle sign-out pass.

## Task

The test `Admin logs in, manages users, adjusts balance, reverses transaction, and inspects audit logs` has never run before (it used to skip). It now fails on outdated selectors. The first failure is `input[placeholder*="Search users"]`; the real placeholder is `Search by name, email, phone, or ID...`.

1. Run the admin console (`npm run dev:admin`) and walk the same flow by hand. Check every selector in that test against the real UI: search boxes, Suspend/Reactivate buttons, the confirm dialog, the reason fields, Adjust Balance / Apply Adjustment, Reverse / Confirm Reversal, and the audit row.
2. Prefer `getByRole` / `getByLabel` over placeholder or text matching. Where a control has no accessible name, add an `aria-label` in the component. Do not change behaviour.
3. Leave the data clean when the test finishes: customer 2 ends **active**. The balance adjustment must be one small amount, then reversed or balanced by a matching opposite adjustment, so customer balances end where they started. Assert both at the end.
4. Make the test independent of the others: the sign-out test must pass whether it runs before or after this one.
5. Run the full Playwright suite **3 times in a row**. Load the env first with `set -a; . ./.env; set +a; npx playwright test`. All 4 tests must pass all 3 times.
6. Clean up two leftovers:
   - Remove the old demo password literal from `supabase/seed.sql`. This file is only for the local database: read a placeholder or generate a random value, and update the header comment.
   - In `scripts/test-rls-and-auth.ts`, use a random password for the throwaway trigger-test user, and confirm that user is deleted at the end of the test.
7. Re-run `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:db` and `npm run test:rls`. Then add a short "Close-out" section to `PHASE6_REPORT.md` with the real outputs (no passwords).

## Do NOT

- Do not change any app behaviour, migrations or database functions.
- Do not touch `.env` or rotate the password again.
- Do not mark Stage C or the UAT checklist as complete. The reviewer is doing the device checks separately.

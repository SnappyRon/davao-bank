# Phase 8 · Stage 8H — Bantay live suite and CI

- **Taken over by be-opencode-3 from tool-copy-check (tool-ci).**
- **Branch:** `phase-8-bantay-tests` · **Worktree:** `/Users/ronalbert/Personal Projects/davao-bank-tests`
- **Base:** `1eb4d13` (the 8A/8D branch point named in the hand-off brief).
- **Brief:** `Phase-8-Bantay-AI-Prompt.md` §Stage 8H (frozen 8D contract in the same file).

## State found on takeover

`git status --short`, `git diff --stat` and `git log --oneline -3` were run in the new
worktree: no tracked changes, no uncommitted work from the previous agent, and
HEAD `1eb4d13 Phase 8 · Stage A — Bantay security center (backend)`. Nothing was
reverted or redone. As with the other worktrees, `node_modules`,
`apps/mobile/node_modules` and `apps/admin/node_modules` are untracked symlinks
to the main checkout; they were not staged or committed. Untracked files listed
in the hand-off (`ONBOARDING.md`, `scripts/agent-usage.py`,
`.codex/agents/frontend-developer-2.toml`, `.browserslistrc`) were left alone.
`docs/agents/STATUS.md` and `PHASE7_REPORT.md` were not edited.

## What was finished

1. `scripts/test-bantay.mjs` + `npm run test:bantay` (the path and command from
   the Stage 8H brief). The suite:
   - probes the 8D RPCs/tables anon-first and stops with
     `NOT VERIFIED — Phase 8D migration is not deployed (… is missing)` when any
     are absent (PGRST202 / missing-table code);
   - checks customer1 (and admin) MFA factors **before** enrolling a temporary
     authenticator and stops with `NOT VERIFIED — customer1 has a real
authenticator. …` when one exists; no existing factor is ever changed;
   - uses `register_device`, `prepare_risk_challenge` (the persisted-challenge
     RPC added by the in-progress 8D migration), an aal1 reject,
     `confirm_risky_payment` with and without step-up, the same idempotency key
     for reject → confirm → success → replay, timeline assertions, and a guard
     that refuses to continue when the demo data cannot score ≥ 70;
   - locks with `lock_my_account()` at aal1, verifies transfer/withdraw are
     blocked, calls `request_unlock`, proves `complete_unlock` cannot skip the
     one-hour wait, and releases the lock only through `admin_unlock_user`
     (no test-only bypass, no shortened timer);
   - checks customer-to-customer event isolation, direct writes to
     `security_events` / `security_limits`, admin RPC misuse and anon reads;
   - removes both temporary authenticators through `withStepUpCleanup`.
   - Exit codes: 0 PASS, 1 FAIL, 2 NOT VERIFIED (a distinct third state; no
     check is skipped as a pass). No secrets, codes or tokens are logged; error
     details use PostgREST codes only.
2. `.github/workflows/ci.yml`: added an explicit named step for the Stage 8E
   shared Jest tests under `packages/shared/src/__tests__/bantay/`, guarded by
   `hashFiles` so branches merged before 8E do not fail. `test:db` was already
   present and was left unchanged; `test:bantay` was **not** wired into CI.
3. `e2e/mobile/bantay-lock-and-challenge.yaml`: Maestro flow using text/accessibility
   labels for the challenge sheet, cancel-sends-nothing check, one-tap lock,
   locked money entry and the unlock request. The one-hour wait is a documented
   manual checkpoint.
4. `eslint.config.mjs`: the existing JS override now also covers `**/*.mjs`, so
   the new `.mjs` suite lints with the same no-undef exception as the other
   scripts. No dependency changes.

## Real check output

Run from `/Users/ronalbert/Personal Projects/davao-bank-tests`:

```
$ npm run typecheck
> admin@0.1.0 typecheck / > mobile@1.0.0 typecheck / > @davao-bank/shared@0.1.0 typecheck
exit 0

$ npm run lint
✖ 63 problems (0 errors, 63 warnings)

$ npm run format:check
All matched files use Prettier code style!

$ npm run test:unit
Test Suites: 38 passed, 38 total
Tests:       334 passed, 334 total

$ npm run test:db
166 passed, 0 failed

$ npx prettier --check scripts/test-bantay.mjs e2e/mobile/bantay-lock-and-challenge.yaml .github/workflows/ci.yml
All matched files use Prettier code style!
```

Preflight branches were exercised locally against throwaway localhost HTTP
stubs (no hosted access, no `.env` read, no secrets):

```
$ env -u SEED_PASSWORD -u E2E_PASSWORD … node --import tsx scripts/test-bantay.mjs
NOT VERIFIED — set SEED_PASSWORD or E2E_PASSWORD for authenticated live checks.
Suite stopped; no check was skipped as a pass.
exit 2

$ SEED_PASSWORD=<dummy> SUPABASE_URL=http://127.0.0.1:54321 … node --import tsx scripts/test-bantay.mjs
NOT VERIFIED — database unreachable (127.0.0.1:54321)
Suite stopped; no check was skipped as a pass.
exit 2

$ node <temp>/fake-bantay-postgrest.mjs   # all RPC probes answer PGRST202
NOT VERIFIED — Phase 8D migration is not deployed (get_security_timeline is missing)
Suite stopped; no check was skipped as a pass.
exit 2

$ node <temp>/fake-bantay-mfa.mjs   # sign-in user has a verified TOTP factor
[1/5] Checking demo accounts and authenticators...
NOT VERIFIED — customer1 has a real authenticator. Use dedicated test accounts or remove it in Two-step verification.
Suite stopped; no check was skipped as a pass.
exit 2
```

The stub harnesses live outside the repo under the OpenCode temp folder and are
not committed.

## NOT VERIFIED

- `npm run test:bantay` was **not** run against hosted: the 8D migration is not
  deployed and customer1 has a real authenticator ( hand-off rule: no hosted
  writes, never read `.env`). The end-to-end PASS path is therefore unproven;
  only its guard/stop paths were exercised locally.
- Maestro `bantay-lock-and-challenge.yaml` was not run — no Expo Go / Metro
  device session in this environment. Its labels follow the app copy in the
  frozen prompt and the 8C screens; 8F may rename a control before the gate.
- CI named 8E step is conditional because 8E has not landed yet; `npm run
test:unit` already covers any tests added there.
- Deposits/incoming transfers while locked and cron-path lock behaviour were
  left to the 8D PGlite suite (`test:db`), not re-tested live here.

## Observation for the captain / reviewer (not changed here)

The in-progress 8D migration in `davao-bank-bantay` adds
`prepare_risk_challenge(uuid, bigint, text)` (needed because a RAISE rolls back
the challenge row) and emits a `risky_payment_warning` event. Neither name is in
the frozen contract's table/RPC lists. The live suite calls
`prepare_risk_challenge` so it works with that implementation; if the captain
freezes the contract differently, the suite call must be updated. No migration
or SQL function was written or edited by this stage.

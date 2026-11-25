# Phase 8 · Stage 8D — Bantay risk engine, events and lock

Taken over by be-bantay-security (OpenCode backup backend agent) from the original 8D agent. The worktree was at `1eb4d13 Phase 8 · Stage A — Bantay security center (backend)` with no tracked changes; no prior 8D work was present. The untracked `node_modules` symlinks were left alone.

## What was already done

- Stage 8A had created the Bantay security-center tables, daily-limit RPCs and the `_transfer_core` daily-limit guard (`20261126000000_phase8_bantay.sql`).
- The Phase 8 plan, D12 (guard-only changes to four protected functions) and D15 (`jwt_expiry = 900`) were already approved by the owner.

## What I finished

- Added `supabase/migrations/20261127000000_phase8_bantay_risk.sql` (new migration; no applied migration edited):
  - `security_events`, `user_devices`, `device_sessions`, `risk_challenges`, `trusted_payees`, `security_cases` and the internal `bantay_step_up_failures` counter. RLS on all tables, customer `select` scoped to `auth.uid()` (admins can read events and cases), no client writes, `service_role` full access.
  - `security_limits` gains `locked_at`, `unlock_after`, `pending_limit_centavos`, `pending_limit_effective_at`. `scheduled_payments.status` now accepts `paused` so a locked customer's schedules can be paused without deleting them.
  - Score function with the frozen weights, `_bantay_band()` thresholds, guards `assert_not_locked` and `assert_payment_risk`, and customer/admin RPCs with audit writes on every state change.
  - `mfa_changed` trigger on `auth.mfa_factors` (installed defensively inside a `DO` block that warns instead of failing if the migration role cannot alter the auth schema), `register_password_change()` for `password_changed`, and a step-up failure counter with a `code_failures` event.
  - 12-hour delayed limit raises; `apply_due_security_limits()` and a new `davao-apply-pending-security-limits` hourly job added inside `register_cron_jobs()` without changing the existing jobs.
  - `supabase/config.toml`: `jwt_expiry = 3600` → `900` (D15).
- Added `scripts/review/pglite-phase8-bantay-risk.mjs` and wired it into `scripts/review/pglite-behavior.mjs`. Existing 8A checks keep their assertions; the harness now seeds trusted payees/devices and clears setup-generated MFA events because those fixtures predate the risk engine. It also fast-forwards the pending-limit timestamp to exercise the same cron apply step (no test-only guard bypass).

### Deviations forced by PostgreSQL transaction semantics (recorded as requested by the brief)

- A `RAISE` rolls back writes made earlier in the same transaction. Therefore the challenge row inserted by `assert_payment_risk` disappears when `'Confirmation required'` reaches the client, and the failure counter written in `assert_money_step_up`'s exception handler disappears with the re-raised error. I added two ordinary, audited customer RPCs so the app can commit those facts in their own request:
  - `prepare_risk_challenge(p_to_account uuid, p_amount bigint, p_idempotency_key text)` — computes the same score, inserts the challenge/event, returns `{challenge_required, score, facts, idempotency_key}`. The client calls it before the money RPC; after `confirm_risky_payment(key)` the original RPC is retried with the same key. No guard is weakened: an unconfirmed challenge still raises `'Confirmation required'`.
  - `record_step_up_failure()` — appends one failure and emits `code_failures` at ≥3 in 10 minutes after a client-visible TOTP failure. No security check is bypassed; the internal call in the guard remains best-effort.
- The frozen `kind` list has no warning event name. Warning-band events use `kind = 'risky_payment_challenged'` with `severity = 'warning'` and `facts.band = 'warning'`, keeping the allowed values exactly as frozen.
- The cron lock failure cannot be paused by editing `run_due_scheduled_payments`; a deferred constraint trigger on `scheduled_payment_runs` sets the schedule to `paused` after the executor's own status update. The executor itself is byte-identical.

## D12 diffs (exactly as generated from the latest definitions)

### _transfer_core

```diff
--- original/_transfer_core
+++ 8D/_transfer_core
@@ -152,4 +152,8 @@
   perform public.assert_daily_transfer_limit(p_actor, p_amount, p_idempotency_key);

+  -- 5c. Bantay lock and payment-risk guards (Phase 8 D)
+  perform public.assert_not_locked(p_actor);
+  perform public.assert_payment_risk(p_actor, p_to, p_amount, p_idempotency_key);
+
   v_clean_ref := coalesce(
     nullif(trim(p_reference), ''),
```

### withdraw

```diff
--- original/withdraw
+++ 8D/withdraw
@@ -38,4 +38,7 @@
     raise exception 'Idempotency key is required';
   end if;
+
+  -- Bantay lock guard (Phase 8 D); idempotent replay returns above.
+  perform public.assert_not_locked(v_caller_id);

   -- 2. Basic Validation & Authorization
```

### create_scheduled_payment

```diff
--- original/create_scheduled_payment
+++ 8D/create_scheduled_payment
@@ -32,4 +32,7 @@
   end if;

+  -- Bantay lock guard (Phase 8 D)
+  perform public.assert_not_locked(v_caller_id);
+
   if exists (
     select 1 from public.profiles where id = v_caller_id and status <> 'active'
@@ -137,4 +140,12 @@
     end if;
   end if;
+
+  -- Bantay risk score at schedule creation (Phase 8 D)
+  perform public.assert_payment_risk(
+    v_caller_id,
+    coalesce(p_to_account, (select account_id from public.billers where id = p_biller_id)),
+    p_amount,
+    public._schedule_risk_key(v_caller_id, p_kind, coalesce(p_to_account, p_biller_id), p_amount, p_start_date)
+  );

   insert into public.scheduled_payments (
```

### create_scheduled_transfer_to_number

```diff
--- original/create_scheduled_transfer_to_number
+++ 8D/create_scheduled_transfer_to_number
@@ -18,4 +18,7 @@
 begin
   perform public.assert_money_step_up();
+
+  -- Bantay lock guard (Phase 8 D)
+  perform public.assert_not_locked(auth.uid());
   if p_to_account_number is null or trim(p_to_account_number) = '' then
     raise exception 'Recipient account number not found';
```

Idempotency remains step 1 in `_transfer_core` and `withdraw`; a completed replay returns before either guard.

## Checks (real output)

```
$ npm run typecheck
> admin@0.1.0 typecheck
> tsc --noEmit
> mobile@1.0.0 typecheck
> tsc --noEmit
> @davao-bank/shared@0.1.0 typecheck
> tsc --noEmit
(exit 0)

$ npm run lint
✖ 63 problems (0 errors, 63 warnings)
  0 errors and 1 warning potentially fixable with the `--fix` option.

$ npm run format:check
Checking formatting...
All matched files use Prettier code style!

$ npm run test:unit
Test Suites: 38 passed, 38 total
Tests:       334 passed, 334 total
Snapshots:   0 total
Time:        5.081 s
Ran all test suites in 3 projects.

$ npm run test:db
235 passed, 0 failed
```

The DB run includes all 166 pre-existing checks plus the new score/challenge/lock/limit/RLS/admin checks and both double-entry reconciliation assertions. Several intermediate runs failed (`159 passed, 7 failed`, then `222 passed, 12 failed`, then `232 passed, 3 failed`); each cause was fixed in the migration or in the test fixtures and the final run above is clean.

## NOT VERIFIED — reason

- Hosted Supabase auth internals: `npx supabase db query --linked --read-only "select extname from pg_extension order by extname"` returned `ProjectRefNotLinkedError: Cannot find project ref. Have you run supabase link?` in this worktree. I could not inspect or write hosted `auth.sessions`, `auth.refresh_tokens` or `auth.mfa_factors`; the lock and trigger code is written against the documented Supabase Auth schema, guarded with `to_regclass`/exception handling, and its hosted behaviour is **NOT VERIFIED**. No hosted writes were attempted.
- No hosted migration was applied and `.env` was never read or printed; `test:bantay`/Playwright/live auth flows remain for the reviewer.
- Actual session revocation after `lock_my_account` and the real MFA trigger installation depend on hosted privileges and are NOT VERIFIED locally.

## QA fix round — `182505a` (expired / cross-user risk challenges)

Implemented the accepted Medium finding in the **unapplied** migration `20261127000000_phase8_bantay_risk.sql` (no applied migration was edited):

- `risk_challenges` now has `unique (user_id, idempotency_key)` instead of a global unique key. The same key can belong to two different customers without one borrowing the other's confirmation.
- `assert_payment_risk` and `prepare_risk_challenge` now look up challenges by `(p_user_id/user_id, idempotency_key)`. A confirmed, unexpired row still short-circuits for that same customer only.
- An expired row is now **renewed with the same key**: `score`, `facts` and `expires_at` are refreshed and `confirmed_at` is cleared, so a fresh aal2 confirmation is required. This also covers a row that was confirmed but expired before the money RPC ran, which previously stayed stuck at `Challenge expired`.
- Because PostgreSQL rolls back writes made before `RAISE`, the renewal inside `assert_payment_risk` is not committed; the client must call `prepare_risk_challenge(key)` again. That RPC commits the renewal and writes a `risk_challenge_refreshed` audit row (new rows in the money RPC still produce 'Confirmation required' as before).
- D12 is untouched: `_transfer_core`, `withdraw`, `create_scheduled_payment` and `create_scheduled_transfer_to_number` keep exactly the same guard lines from `182505a`. `run_due_scheduled_payments` and the ledger are unchanged.
- Info finding applied: `set search_path = ''` added to `_bantay_band` and `_schedule_risk_key` for uniformity.

**Captain decision recorded:** `prepare_risk_challenge` and the `risky_payment_warning` event kind are **ratified as contract additions** to 8D; both are kept. Warning-band events continue to use `kind = 'risky_payment_warning'` with `severity = 'warning'`.

New PGlite cases in `scripts/review/pglite-phase8-bantay-risk.mjs`:

- expired key → `confirm_risky_payment` still returns `Challenge expired` → money RPC returns `Confirmation required` → re-prepare returns a fresh challenge with a future expiry and cleared confirmation → confirm succeeds → payment with the same key succeeds;
- another customer reusing an already-confirmed key gets their own unconfirmed challenge, and two separate rows exist for the same key;
- an initial attempt to exercise the cross-user case through the money RPC was removed because money idempotency keys are global by design (`transactions.idempotency_key`), so the second customer's call short-circuits as a replay before the risk guard. Scoping is verified at the challenge layer instead.

Checks after the fix (real output):

```
$ npm run typecheck
(exit 0; admin, mobile and shared tsc --noEmit all clean)

$ npm run lint
✖ 63 problems (0 errors, 63 warnings)

$ npm run format:check
Checking formatting...
All matched files use Prettier code style!

$ npm run test:unit
Test Suites: 38 passed, 38 total
Tests:       334 passed, 334 total
Snapshots:   0 total
Time:        6.662 s
Ran all test suites in 3 projects.

$ npm run test:db
242 passed, 0 failed
```

Intermediate `test:db` run was `242 passed, 1 failed` (the invalid cross-user money-RPC assertion described above); it was replaced with the challenge-layer assertions and the final run above is clean. Hosted verification remains NOT VERIFIED for the reasons recorded earlier; no hosted access was used in this fix round.

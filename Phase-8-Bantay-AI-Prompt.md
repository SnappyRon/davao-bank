# Phase 8 · Bantay AI (Stages 8D–8H)

> **State: plan approved (D11, 2026-11-25). D12 approved 2026-11-25: 8D–8F may start; the Gemini call works only after D14 (template fallback until then).**
> Read first: `AGENTS.md`, `docs/agents/ROADMAP.md`, `docs/agents/WORKFLOW.md`, and the 8A/8C notes in `docs/agents/notes/phase-8-bantay-backend.md` and `phase-8-frontend.md`.

## Goal

Bantay becomes an active security agent. Server-side rules and a per-user baseline score every outgoing payment. High-risk payments must be confirmed again. The customer can lock their account in one tap. An LLM only explains events in plain words and never decides or moves money.

## Principles (apply to every stage)

1. **The server decides.** Scores, challenges and locks are enforced in SQL. The app only displays them.
2. **No money is reserved or held.** A high-risk payment raises an error before any write. Confirming it re-runs the same RPC with the same idempotency key. The ledger, `_transfer_core` logic and `run_due_scheduled_payments` stay unchanged apart from the approved guard lines (D12).
3. **The AI is optional.** Every event has a template message. With no `GEMINI_API_KEY` set, or on timeout, quota or error, the template is shown.
4. **Data minimisation.** The AI receives only masked, structured facts (amount band, "new payee", "6× usual", hour, signal names). It never receives names, full account numbers, note text, emails or ids.
5. **Attackers can't lock out the owner.** "Lock" freezes outgoing money and revokes sessions. Sign-in still works so the owner can see what happened.

## Frozen 8D contract (8E, 8F, 8G and 8H build against this)

**Tables** (RLS on; customers can select their own rows only; no client insert/update/delete):

- `security_events(id uuid pk, user_id uuid fk profiles, kind text, severity text check in ('info','warning','high'), score int null, facts jsonb, explanation text null, explanation_source text null check in ('ai','template'), status text default 'open' check in ('open','confirmed_me','reported_not_me','dismissed'), related_transaction_id uuid null, created_at timestamptz)`
  - `kind` is one of: `risky_payment_challenged`, `risky_payment_confirmed`, `new_device`, `signin_failures`, `code_failures`, `mfa_changed`, `password_changed`, `limit_changed`, `account_locked`, `account_unlocked`, `risky_payment_warning` (added 2026-11-26: score band 40–69, severity `warning`).
- `user_devices(id uuid pk, user_id, install_id text, label text, first_seen_at, last_seen_at, trusted boolean default false, unique(user_id, install_id))`
- `device_sessions(session_id uuid pk, user_id, device_id fk user_devices)` maps the JWT `session_id` claim to a device.
- `risk_challenges(id uuid pk, user_id, idempotency_key text unique, score int, facts jsonb, expires_at timestamptz, confirmed_at timestamptz null)`
  - Added 2026-11-26 (captain-ratified after the 8D review): `prepare_risk_challenge(...)` creates or refreshes the caller's challenge before the money RPC raises 'Confirmation required' (a RAISE rolls back an insert made inside the guard). An expired, unconfirmed challenge with the same key is refreshed, and lookups are scoped to `(user_id, idempotency_key)`.
- `trusted_payees(user_id, account_number text, created_at, pk(user_id, account_number))`
- `security_limits` (from 8A) gains: `locked_at timestamptz null`, `unlock_after timestamptz null`, `pending_limit_centavos bigint null`, `pending_limit_effective_at timestamptz null`.

**Customer RPCs** (all `security definer set search_path = ''`, `authenticated` only):

| RPC                                                | Behaviour                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `register_device(p_install_id text, p_label text)` | Upserts the device and links `auth.jwt()->>'session_id'`. Writes a `new_device` event the first time.                                                                                                                                                                                                                                |
| `get_security_timeline(p_limit int default 50)`    | Caller's events, newest first.                                                                                                                                                                                                                                                                                                       |
| `confirm_risky_payment(p_idempotency_key text)`    | Needs `assert_money_step_up()` (aal2 + fresh code). Marks the challenge confirmed if it is not expired (30 min). Returns ok. The client then repeats the original money RPC with the same key.                                                                                                                                       |
| `mark_event(p_event_id uuid, p_status text)`       | `confirmed_me` or `reported_not_me`. For `confirmed_me` on a payment event, adds the payee to `trusted_payees`; for a new-device event, sets `trusted`. `reported_not_me` locks the account (same as `lock_my_account`) and opens a `security_cases` row.                                                                            |
| `lock_my_account()`                                | No step-up (it must be easy for the owner). Sets `locked_at`, pauses the caller's active scheduled payments (status `paused`, no deletes), revokes all the caller's refresh tokens (`auth.refresh_tokens` / `auth.sessions` for the user — 8D verifies the exact hosted mechanism read-only first), writes `account_locked` + audit. |
| `request_unlock()`                                 | Needs `assert_money_step_up()`. Sets `unlock_after = now() + 1 hour`.                                                                                                                                                                                                                                                                |
| `complete_unlock()`                                | Needs `assert_money_step_up()` and `now() >= unlock_after`. Clears the lock and writes `account_unlocked`. Paused schedules stay paused and the customer resumes them one by one.                                                                                                                                                    |
| `get_security_settings()` (8A)                     | Also returns `locked`, `unlock_after`, `pending_limit_centavos`, `pending_limit_effective_at`.                                                                                                                                                                                                                                       |
| `set_daily_limit()` (8A)                           | Lowering is immediate (unchanged). Raising sets the pending fields, takes effect after 12 h, and writes `limit_changed`.                                                                                                                                                                                                             |

**Admin RPCs** (`is_admin()` + `assert_admin_aal()`): `admin_list_security_cases(p_status)`, `admin_get_security_case(p_id)`, `admin_update_security_case(p_id, p_status, p_note)`, `admin_unlock_user(p_user_id, p_note)`. Freezing a receiving account uses the existing `admin_set_account_status`, with the case id in the audit metadata.

- `security_cases(id, user_id, opened_by text check in ('customer','system','staff'), event_id, status check in ('open','investigating','resolved'), staff_note, created_at, updated_at)`. Customers can select their own; admins can select all.

**Guards** (D12):

- `public.assert_not_locked(p_user_id)` raises `'Account locked'`. It is called in `_transfer_core` (step 5c, right after the 8A daily-limit guard), in `withdraw` and in the two schedule-creation functions. Deposits and incoming transfers are not blocked.
- `public.assert_payment_risk(p_user_id, p_to_account, p_amount, p_idempotency_key)` runs in `_transfer_core` step 5c, after the lock guard.
  - Computes the score (below). A score of 70 or more with no confirmed, unexpired challenge for this key inserts a challenge and an event, then raises `'Confirmation required'`.
  - It is skipped when `auth.uid()` is null (the cron path). Scheduled payments are scored once, at creation, instead.

**Score** (0–100, capped; weights are constants in the migration):

| Signal                                                                                                     | Points |
| ---------------------------------------------------------------------------------------------------------- | ------ |
| Payee never paid before by this user and not in `trusted_payees`                                           | 30     |
| Amount > 3× the user's 90-day median outgoing amount (needs ≥ 5 past payments; otherwise amount > ₱10,000) | 30     |
| ≥ 3 outgoing payments in the last 10 minutes                                                               | 20     |
| Current session's device first seen < 24 h ago and not trusted                                             | 25     |
| `mfa_changed` or `password_changed` event in the last 24 h                                                 | 25     |
| Local hour (Asia/Manila) between 00:00 and 05:00                                                           | 10     |

Bands: below 40 allow; 40–69 allow and write a `warning` event; 70 or more challenge.

**Error strings** (mapped in `packages/shared/src/utils/errors.ts` by 8E): `'Account locked'` → "Your account is locked. Unlock it in Bantay to send money."; `'Confirmation required'` → handled by the UI (challenge sheet), never shown raw.

---

## Stage 8D — Risk engine, events, devices and lock (backend + database)

**Agent:** `be-bantay-security` · **Branch:** `phase-8-bantay-risk` from `phase-8-bantay-backend` · **Migration:** `20261127000000_phase8_bantay_risk.sql`

Tasks:

1. Create the tables, RLS, grants and revokes from the contract.
2. Create the guards and the score function. Re-create `_transfer_core` from its 8A definition with **only** the step 5c lines added. Re-create `withdraw`, `create_scheduled_payment` and `create_scheduled_transfer_to_number` with only the lock guard added. Schedule creation also runs the risk score and raises `'Confirmation required'` the same way.
3. Create the customer RPCs and admin RPCs. Every state change writes `audit_logs`.
4. Write events for `mfa_changed`, `password_changed` and `code_failures`:
   - `mfa_changed` from the existing MFA paths (an `auth.mfa_factors` trigger, verified read-only on hosted first);
   - `password_changed` via a `register_password_change()` RPC that the app calls after `updateUser` succeeds;
   - `code_failures` when `assert_money_step_up` fails 3 or more times in 10 minutes.
5. Extend `set_daily_limit` with the 12-hour delay for raises. A cron step applies due pending limits; register it in `register_cron_jobs` without changing existing jobs.

Acceptance criteria:

- The `_transfer_core` diff against `20261126000000_phase8_bantay.sql` is exactly the added step 5c lines. Diffs for `withdraw` and the two schedule-creation functions are exactly the added guard lines. Paste all diffs into the notes file.
- `run_due_scheduled_payments` is unchanged, and cron runs with no JWT still succeed when the user is not locked. When the user is locked they fail with `'Account locked'`, are recorded as a failed run, and the schedule is paused.
- An idempotent replay of a completed payment still returns the replay. Idempotency is checked before the guards, as in today's step 1.
- A customer cannot read another customer's events, devices, challenges or cases. A customer cannot write any of these tables directly.
- `lock_my_account` still works when the caller is aal1 (password only).

Tests (`scripts/review/pglite-phase8-bantay-risk.mjs`, wired into `test:db`):

- Each score signal alone, plus the band edges at 39, 40, 69 and 70.
- Challenge flow: raises → confirm without aal2 fails → confirm with aal2 → the same key succeeds once → a reused key replays → an expired challenge raises again.
- Lock blocks transfer, bill payment, pay request, withdraw, schedule creation and a cron run. It does not block deposits or incoming transfers. Unlock before `unlock_after` fails; after it, unlock succeeds.
- Raising the limit is delayed and lowering is immediate. `trusted_payees` removes the new-payee points.
- All 166 existing checks still pass, plus the double-entry reconciliation.

## Stage 8E — Edge Functions and shared copy (integration)

**Agent:** `be-bills-summary` · **Branch:** `phase-8-bantay-edge` from `phase-8-bills-backend`

Tasks:

1. `supabase/functions/bantay-explain`. The app sends `{ event_id }` with the user JWT.
   - The function verifies the JWT, loads the event as the caller (RLS), and builds masked facts with the shared builder.
   - It calls Gemini Flash (exact model id taken from Google's current docs at build time) with a 4-second timeout and a fixed system prompt: explain in 1–2 sentences, give one action, never ask for codes or passwords, no links.
   - It writes `explanation` and `explanation_source` back through a service-role update limited to those two columns, then returns the text.
   - On a missing key, timeout or error it returns the template text and stores it with `explanation_source = 'template'`. It never returns the raw model error.
2. Sign-in failure signal. First, query hosted `auth.audit_log_entries` read-only to see whether failed password sign-ins are recorded; paste the evidence into the notes.
   - If they are recorded: add a cron SQL function that turns 5 or more failures in 15 minutes into a `signin_failures` event.
   - If not: add `supabase/functions/signin-signal`, which the app calls after a failed sign-in with `{ email }`. It is rate-limited per IP and per email, stores only a hash of the email, never says whether the account exists, and writes the event for the matching user.
3. In `packages/shared`:
   - `bantay/facts.ts`, a pure masking builder used by the function and by the tests;
   - `bantay/templates.ts`, one template per event `kind`, in sentence case, ₱, "•• 1234";
   - the error mappings from the contract.

Acceptance criteria:

- Jest tests for the masking builder: no name, email, full account number, note text or uuid ever appears in the output (fuzz with seeded profiles).
- The system prompt and facts are tested as fixtures. A note containing "ignore previous instructions" never reaches the prompt.
- With no key set, the function returns the template (test with mocked fetch). With a key and a mocked 429 or timeout, it also returns the template.
- The key is read only from `Deno.env` and never logged. CI and tests never need the real key.

## Stage 8F — Mobile Bantay UI (frontend)

**Agent:** `fe-phase8-screens` · **Branch:** `phase-8-bantay-ui` from `phase-8-frontend`

Tasks (extend `BantaySecurityScreen`, do not replace it):

1. A status card at the top:
   - "Protected" or "Locked since 2:41 PM";
   - a **Lock my account** destructive button with a confirm sheet;
   - the unlock flow: request (password + code) → a "You can unlock at 3:41 PM" countdown → unlock (password + code).
2. A security timeline (`get_security_timeline`) on a `GroupedList`, with icon by kind, explanation (fetched from `bantay-explain` once and cached), time, and "It was me" / "Not me" on open events. "Not me" uses a confirm sheet, then locks the account.
3. Risk challenge in Transfer, Pay bills, Pay request and Schedule. When the money RPC fails with `'Confirmation required'`:
   - show a challenge sheet with the reasons (template text from facts) and "Confirm it's me";
   - run the existing step-up order, then `confirm_risky_payment(key)`, then call the same commit handler again with the **same** idempotency key.
   - Handler bodies stay byte-identical. The retry is wired at the call site, as `useInFlightGuard` was.
4. Device registration: generate an `install_id` once (SecureStore) and call `register_device` after every sign-in or session restore. Call `register_password_change()` after a successful password change.
5. Realtime: subscribe to the caller's `security_events` inserts. Show a toast plus an Inbox badge for `high` severity. Unsubscribe on sign-out.
6. Locked state across the app: money tiles and commit buttons show "Account locked — Unlock in Bantay" instead of failing late. The server stays the source of truth.

Acceptance criteria:

- The money handler comparison against the previous commit is byte-identical (paste it into the notes).
- The same idempotency key is used on the confirm retry (assert in tests). Cancelling the challenge sends nothing.
- `hideBalance` masks amounts in the timeline and challenge. Every control has a role and label. Copy follows the wording rules.
- RNTL tests: lock/unlock flow, countdown, challenge confirm and cancel, "Not me" locks, timeline with an AI explanation, timeline with the template fallback, device registration called once per session, Realtime toast.

## Stage 8G — Admin security cases (frontend, admin)

**Agent:** `fe-general-codex` · **Branch:** `phase-8-admin-cases` · Read `apps/admin/AGENTS.md` first.

Tasks:

1. A Security cases page with a list filtered by status, using sentence-case badges.
2. Case detail: the event timeline, a masked customer summary, and actions to set status, add a note, unlock the user, and freeze or unfreeze the receiving account through the existing `admin_set_account_status`, recording the case id.
3. A dashboard stat card showing open cases.

Acceptance criteria:

- All actions need an aal2 admin session; reuse the existing guard.
- Playwright specs for list, detail, status change and unlock (they run once the owner signs in; until then write NOT VERIFIED).
- No raw uuids are shown; use `formatReferenceId`.

## Stage 8H — Tests, CI and live suite

**Agent:** `tool-copy-check` (renamed `tool-ci`) · **Branch:** `phase-8-bantay-tests`

Tasks:

1. `scripts/test-bantay.mjs` (`npm run test:bantay`) runs live against hosted after the migration is applied. It creates a high-risk payment → challenge → confirm → success, locks → blocked → unlocks with `admin_unlock_user` (no test-only shortcut for the 1-hour wait), checks RLS isolation, and cleans up.
2. Add `test:db` (already in CI) and the 8E Jest tests to CI. `test:bantay` stays manual (it needs hosted access and `.env`).
3. A Maestro flow `e2e/mobile/bantay-lock-and-challenge.yaml`.

Acceptance criteria: the suite stops with NOT VERIFIED (not a failure, not a skip-as-pass) when the migration is missing or customer1 has a real authenticator. No secrets are printed.

## Commit titles

- `Phase 8 · Stage 8D — Bantay risk engine, events and lock (backend)`
- `Phase 8 · Stage 8E — Bantay explain and sign-in signal (edge functions)`
- `Phase 8 · Stage 8F — Bantay timeline, lock and risk challenge (mobile)`
- `Phase 8 · Stage 8G — Security cases (admin)`
- `Phase 8 · Stage 8H — Bantay live suite and CI`

## Do NOT

- Do not add a trained model, embeddings or any AI tool that can call RPCs.
- Do not send PII or note text to Gemini.
- Do not hold or reserve money, and do not change ledger math.
- Do not block sign-in when an account is locked.
- Do not add any test-only bypass of a guard.
- Do not edit `STATUS.md` or `docs/agents/ROADMAP.md`. Write `docs/agents/notes/<branch>.md` instead.

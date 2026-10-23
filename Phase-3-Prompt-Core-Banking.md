# Davao Bank — Phase 3 Implementation Prompt

**Hand this entire file to your coding agent.** Phase: **3 of 7 — Core Banking (Mobile).** Phases 1 (setup) and 2 (database & auth) are **approved**. Build on them without regressing anything.

This is the **most safety-critical phase**: it adds the actual movement of (simulated) money. The golden rule from the proposal (§6.1) governs everything here: **the server is the only authority on money.** Clients call server-side functions; they never write to money tables and never compute authoritative balances.

---

## 0. Pre-step — required Phase 2 security fix (new migration, do this first)

Phase 2 review found that a customer can change their own `profiles.status` (e.g., un-suspend themselves). Add a **new migration** (do not edit Phase 2's migration) with a guard trigger so only admins can change `role` or `status`:

```sql
create or replace function public.guard_profile_self_update()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then
    if new.role is distinct from old.role or new.status is distinct from old.status then
      raise exception 'Only admins may change role or status';
    end if;
  end if;
  return new;
end; $$;

create trigger trg_guard_profile_self_update
  before update on public.profiles
  for each row execute function public.guard_profile_self_update();
```

## 1. What to review before starting

- Proposal **§7.2 Transaction Integrity and the Ledger Model** (atomic transfers, idempotency, safe money representation, balanced entries), **§5.1 Key Capabilities**, **§6.1 Architectural Principles**.
- Existing code: the Phase 2 migration (schema, RLS, `is_admin()`, `account_balances`), `packages/shared/src/supabase/client.ts` (client + helpers like `fetchAccountBalances`), the mobile app (`apps/mobile` — auth, navigation, `HomeScreen`), and `packages/shared` types.
- If anything here conflicts with the proposal or existing code, **stop and flag it**.

## 2. Scope boundary

**In scope (Phase 3):**

- Server-side **money functions** (atomic, idempotent, `SECURITY DEFINER`): transfer, deposit (simulated), withdrawal (simulated).
- A **transaction-history read model** for the mobile UI.
- **Mobile UI**: accounts/balances dashboard, transaction history + detail, transfer flow, deposit/withdraw flow, in-app notifications, with full error handling.

**NOT in scope (do not build):**

- Admin management features — user/account/transaction management, reversals, manual adjustments, audit viewer UI (Phase 4).
- Integration/notifications polish beyond in-app notifications already modeled (Phase 5).
- Anything that weakens Phase 2 RLS or lets clients write money tables directly.

## 3. Server-side money logic (new migration with `SECURITY DEFINER` functions)

All money movement happens here, never in the client. Each function runs atomically (a Postgres function is one transaction), sets a fixed `search_path`, is `SECURITY DEFINER`, and is granted `execute` to `authenticated`. **Because `SECURITY DEFINER` bypasses RLS, each function MUST explicitly verify ownership via `auth.uid()`** — do not assume RLS protects these writes.

### 3.1 `public.transfer(p_from_account uuid, p_to_account uuid, p_amount bigint, p_idempotency_key text, p_reference text default null)`

- **Idempotency first:** if a `transactions` row already exists with `p_idempotency_key`, return it (do **not** create a second). Also handle the race: on `unique_violation`, fetch and return the existing transaction.
- **Authorization:** the caller (`auth.uid()`) must own `p_from_account`. Reject otherwise.
- **Validation:** `p_amount > 0`; `from <> to`; both accounts exist and are `status = 'active'`; same currency; sufficient funds in the source.
- **Concurrency safety:** lock the involved account rows with `SELECT ... FOR UPDATE` in a **deterministic order** (e.g., by `id`) before computing balance and writing, so concurrent transfers cannot overdraw or deadlock. Compute the source balance from `ledger_entries` inside the lock.
- **Effect (all-or-nothing):** insert one `transactions` row (`type='transfer'`, `status='completed'`, `initiated_by`, `idempotency_key`, `reference`); insert the `transfers` row; insert **two** balanced `ledger_entries` (debit source, credit destination, equal `amount`); call `write_audit(...)`; insert `notifications` for both parties.
- Return the transaction (id/status) so the client can confirm.

### 3.2 `public.deposit(p_account uuid, p_amount bigint, p_idempotency_key text, p_reference text default null)` — simulated

- Idempotency + ownership (caller owns `p_account`) + validation (`amount > 0`, account active).
- Insert `transactions` (`type='deposit'`), one **credit** `ledger_entry`, audit, notification.

### 3.3 `public.withdraw(p_account uuid, p_amount bigint, p_idempotency_key text, p_reference text default null)` — simulated

- Idempotency + ownership + validation + **sufficient-funds check under `FOR UPDATE` lock**.
- Insert `transactions` (`type='withdrawal'`), one **debit** `ledger_entry`, audit, notification.

### 3.4 Transaction-history read model

- Add a view or function (`security_invoker = true`, or a function that filters by `auth.uid()`) returning, per account the caller owns, a history row: transaction id, type, **signed** amount (credit positive / debit negative) for that account, status, reference, counterparty (for transfers: the other account number), and `created_at`. This feeds the mobile history screen without exposing other users' data.

### 3.5 Money representation & limits

- Amounts are **integer centavos** everywhere; never floats. Validate inputs are positive integers. Apply a sane per-transaction max for the prototype (e.g., reject absurd amounts) and reject non-active source/destination accounts.

## 4. Mobile UI (`apps/mobile`) — consume the server functions

Build these screens, styled with the shared `@davao-bank/shared` palette (no hardcoded hex):

- **Dashboard / Accounts:** show the customer's account(s) with **balance from `account_balances`** (never computed client-side), account number, type, status.
- **Transaction history:** list from the §3.4 read model, with filtering (by type/date) and a **detail view**; show signed amounts and counterparty.
- **Transfer flow:** choose source account → enter recipient **account number** + amount → **confirmation step** → call `transfer` via `supabase.rpc(...)` with a **client-generated idempotency key** (reused on retry) → show success/failure and the updated balance.
- **Deposit / Withdraw flow:** simulated; call `deposit` / `withdraw` RPCs with idempotency keys; withdraw must surface "insufficient funds".
- **Notifications:** list the customer's in-app notifications and allow marking them read.
- **Error handling:** clearly handle insufficient funds, invalid/not-found recipient, frozen/closed account, network errors, and double-submit (disabled button + idempotency).

## 5. Technical standards & security

- **Server-authoritative:** clients call RPCs only; **no direct client writes** to `transactions`/`ledger_entries`/`transfers` (Phase 2 RLS already denies this — keep it that way).
- **Atomicity:** each money operation is all-or-nothing within its function.
- **Idempotency:** a repeated call with the same key yields exactly one transaction.
- **Concurrency:** `FOR UPDATE` row locks in deterministic order; no overdraft under parallel calls; no deadlocks.
- **Balanced books:** every transaction's ledger entries net to zero; system-wide sum(credits) = sum(debits).
- **Auditability:** every money movement writes an `audit_log` row and relevant `notifications`.
- **Money as integer centavos**; `amount > 0` enforced in both constraints and function logic.
- **Secrets:** anon key only in the mobile client; service-role key never shipped. Functions set fixed `search_path`, grant `execute` narrowly.
- Migrations additive and ordered; must apply cleanly with `supabase db reset`. Do not edit earlier migrations.

## 6. Completion criteria (all must hold — and this phase MUST be verified against a live database)

1. `supabase db reset` applies all migrations (including the §0 guard trigger and the new functions) cleanly and runs the seed.
2. **Transfer**: moves funds atomically; both ledger entries written; balances update correctly; audit + notifications created.
3. **Insufficient funds / inactive account / self-transfer / wrong-owner** are rejected with clear errors and **no** partial writes.
4. **Idempotency**: calling transfer/deposit/withdraw twice with the same key creates exactly **one** transaction.
5. **Concurrency**: N parallel transfers from the same account cannot overdraw it (verified with a concurrent-call test); no deadlocks.
6. **Reconciliation**: for every account, `account_balances` equals the ledger sum; system-wide credits equal debits.
7. **RLS integrity preserved**: a client still cannot directly write any money table; customers still cannot read others' data.
8. **Mobile**: dashboard balance, history, transfer, deposit, withdraw all work end to end on a device/emulator with graceful error handling.
9. Repo-wide `npm run typecheck`, `lint`, `format:check` pass; `build:admin` and `expo export` succeed; secret-leak check clean.

## 7. Tests & verification (run against a live local Supabase and report output)

- **Migration:** `supabase db reset` succeeds; list the new functions and the guard trigger.
- **Function tests** (SQL or a `scripts/` TS suite using per-user sessions): successful transfer; insufficient funds; self-transfer blocked; non-owner blocked; frozen/closed account blocked; deposit; withdraw; idempotent repeat → one transaction.
- **Concurrency test:** fire many simultaneous transfers/withdrawals from one account totaling more than its balance; assert it never goes negative and the number of successful debits matches available funds.
- **Reconciliation test:** after the suite, assert per-account balance = ledger sum and global credits = debits.
- **Mobile E2E/manual:** register → deposit → transfer to the other seeded customer → see updated balances and history on both → withdraw → insufficient-funds error path. Describe or screenshot.
- **Quality:** typecheck, lint, format:check, admin build, expo export, secret-leak grep — all shown passing.

## 8. What to preserve / avoid changing

- Do not edit earlier migrations; add new ones only. Do not weaken or remove any Phase 2 RLS policy.
- Do not change the approved palette or the monorepo/shared structure; extend, don't rebuild.
- Keep money as integer centavos; keep the `server-only` service-role boundary intact.
- Stay in scope: **no admin management UI, no reversals/adjustments** (Phase 4). Adding later-phase work will be rejected in review.

## 9. Report back for review

Provide: the new migration(s) (guard trigger + money functions + history read model), the mobile screens and the RPC call sites (showing idempotency keys), the test scripts, and the **output of the live verification in §7** (especially the concurrency and reconciliation results). Note anything you changed from this prompt and why.

_Reminder: the reviewer will run `supabase db reset`, the function/concurrency/reconciliation tests, the builds, and the secret-leak check against the actual code — not just your summary — before approving Phase 3. Because this is the money phase, the concurrency and reconciliation evidence is mandatory for sign-off._

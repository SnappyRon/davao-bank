# Davao Bank — Phase 4 Follow-Up (Fixes) Prompt

**Hand this entire file to your coding agent.** This is a correction pass on Phase 4, not a new phase. The admin functions, UI, attribution (cookie-session server actions) and CSV route are good — keep them. Fix only the items below, using a **new migration** (do not edit earlier migrations).

---

## Fix 1 — HIGH: double reversal is possible under concurrency

**Problem.** `admin_reverse_transaction` reads the original transaction (`select * into v_orig_tx ... where id = p_transaction_id`) **without a lock**, checks `status`, then locks the accounts. Two concurrent reversals of the same transaction (double-click, or two admins) both read `status = 'completed'`, serialize on the account locks, and **both** insert compensating entries. The admin UI makes this reachable because it generates a **new idempotency key on every submit** (`TransactionsClient.tsx` line ~71), so idempotency does not catch it. Result: money is moved twice and the original sender is credited twice.

**Fix.**

- Lock the original transaction row first: `select * into v_orig_tx from public.transactions where id = p_transaction_id for update;` and perform the `reversed` / `completed` / `reversal`-type checks **after** acquiring that lock.
- Add a structural guard so a second reversal is impossible even if logic regresses: add a nullable `reverses_transaction_id uuid references public.transactions(id)` column on `transactions` with a **unique** index; set it on the reversal row.

## Fix 2 — MEDIUM-HIGH: user suspension has no effect

**Problem.** `admin_set_user_status` sets `profiles.status = 'suspended'`, but nothing reads it. The Phase 3 money functions check only `accounts.status`, the mobile app does not check it at login, and `is_admin()` ignores it. A suspended customer can still log in and transfer, deposit and withdraw; a suspended admin keeps full admin powers.

**Fix.**

- In `transfer`, `deposit`, `withdraw` (and `transfer_by_account_number` via `transfer`): reject if the caller's `profiles.status <> 'active'` with a clear error (`'Your profile is suspended'`). Replace these functions with `create or replace` in the new migration — keep all existing logic identical otherwise.
- Update `public.is_admin()` to require `role = 'admin' and status = 'active'`.
- Mobile: after login, if the profile is suspended, show a clear "Your account is suspended — contact Davao Bank" screen and do not show money actions.

## Fix 3 — MEDIUM: the audit log can be forged by any user

**Problem.** Phase 2 runs `grant execute on function public.write_audit(...) to authenticated`, and Supabase's default privileges very likely also grant it to `anon`. Any client can therefore call `supabase.rpc('write_audit', ...)` and insert arbitrary audit entries (e.g., a fake `transaction_reversed`); `anon` calls are recorded with role `system`. That breaks the "tamper-evident audit trail" requirement.

**Fix.** `revoke execute on function public.write_audit(text, text, text, jsonb) from public, anon, authenticated;` — the `SECURITY DEFINER` functions that call it run as the owner and keep working. Apply the same revoke to any other internal-only helper that clients should not call directly.

## Fix 4 — MEDIUM: admin forms are not idempotent across double-submit

**Problem.** The reversal and balance-adjustment forms generate a fresh idempotency key **per submit**, so a double-click or a retry after a timeout creates two operations.

**Fix.** Generate the idempotency key **once when the modal opens** (store it in state), reuse it for every submit/retry of that modal, and only discard it after success or when the modal is closed. Disable the submit button synchronously while in flight.

## Fix 5 — LOW (cleanup)

- `admin_set_account_status`: reject a no-op change (`p_status = current status`) instead of writing an audit entry and notification.
- Account status changes are audited twice (Phase 2 trigger + Phase 4 function). Keep one: drop the redundant Phase 2 account-status trigger **or** skip the function's own audit — pick one and document it.

---

## Re-verification (run against a live database and report the output)

1. `npx supabase db push` (or `db reset` locally) applies all migrations including the new one.
2. **Double reversal:** fire two concurrent `admin_reverse_transaction` calls on the same transaction with **different** keys → exactly one succeeds; balances reflect one reversal; reconciliation holds.
3. **Suspension:** suspend customer1 → their `transfer`/`deposit`/`withdraw` calls are rejected; the mobile app shows the suspended screen; reactivate → works again. A suspended admin → `admin_*` calls rejected.
4. **Audit forgery:** a customer session and an anon client calling `rpc('write_audit', ...)` are **rejected**; admin actions still write audit rows.
5. **Idempotent forms:** double-submitting the reversal and adjustment modals produces one operation.
6. `npm run test:rls`, `test:money`, `test:admin` all pass — include the full output and state **which database** they ran against (local URL or hosted project).
7. typecheck, lint, format:check, `build:admin`, `expo export`, secret-leak check — all pass.

## Preserve

- Don't edit earlier migrations; don't weaken any RLS policy; keep money as integer centavos, audit append-only, admin calls via the admin's cookie session, palette and shared structure unchanged.
- No Phase 5+ work.

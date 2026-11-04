# Davao Bank — Phase 6 Report: Testing & Security Hardening

## Overview

Phase 6 establishes an automated testing safety net, hardens security across mobile, admin, and backend layers, and verifies quality invariants on real hardware and test environments.

Branch: `phase-6-hardening`  
Target Remote Database: `qomxlzvrovwsfneqsfej.supabase.co`  
Date: 2026-11-04

---

## Stage 0 — Carry-overs from Phase 5

### What Was Built & Fixed

1. **Reviewer Carry-overs Cleaned & Committed (§0.1):**
   - Retained reviewer's server-rendered table fix in `apps/admin/src/components/ui/Table.tsx`.
   - Formatted `PHASE5_REPORT.md` with Prettier.
   - Retained `react-native-safe-area-context` migration in `apps/mobile/src/components/Screen.tsx`.
   - Tracked all organized mobile assets in `apps/mobile/assets/` (`illustrations/`, `icons/billers/`, `source/`).

2. **Admin Console Biller Creation Repaired (§0.2):**
   - Updated `apps/admin/src/app/billers/BillersClient.tsx` to invoke `adminCreateBillerAction` server action (which safely calls `admin_create_biller`) instead of the non-existent `admin_register_biller` RPC.

3. **Live Test Suites Hardened & Verified (§0.3):**
   - `test:rls`: Updated admin DELETE test on `audit_logs` to assert row count invariance (0 rows deleted due to append-only RLS).
   - `test:money`: Adjusted withdrawal overdraft test to test an amount above balance but below the ₱5,000,000 max transaction cap, asserting "Insufficient funds".
   - `test:admin`: Asserted balance adjustment creates an `adjustment` transaction, a `credit` ledger entry, and increases account balance. Handled pre-funding active accounts for non-zero close and reversal checks.
   - `test:extras`: Added pre-cleanup deletion of existing recipient before testing `add_saved_recipient`.
   - `test:schedules`: Fixed naive debit=credit sum assertion by validating per-account balance = ledger sum and balanced transfers/reversals/bills net to zero. Added Philippine Time (`Asia/Manila`) date handling.
   - `test:qr`: Corrected parameter names (`p_requester_account`, `p_from_account`) and funded payer account.
   - `test:fx`: Replaced brittle string searches with live customer read and write/update rejection assertions.

4. **5-Minute Recurrent Scheduler (§0.4):**
   - In migration `20261103000000_phase6_stage0_carryovers.sql`, re-registered `davao-run-schedules` with schedule `*/5 * * * *`.

5. **Secure Daily FX Sync via Vault (§0.5):**
   - Edge function `supabase/functions/fx-sync/index.ts` secured with `x-fx-sync-secret` header (rejects unauthorized callers with 401).
   - Generated cryptographically secure 256-bit secret, set in Supabase Function Secrets (`FX_SYNC_SECRET`) and stored in Supabase Vault (`vault.create_secret`).
   - Re-registered cron job `davao-daily-fx-sync` to dynamically fetch the secret from `vault.decrypted_secrets` at run-time, ensuring zero plaintext secrets in `cron.job.command`.

6. **Role Guard Security Invoker Fix (§0.6):**
   - Recreated `guard_profile_self_update()` as `SECURITY INVOKER`.
   - Permitted trusted backend roles (`service_role`, `postgres`, `supabase_admin`) or callers passing `public.is_admin()`.

7. **Profile Repair & Self-Heal (§0.7):**
   - Idempotently backfilled missing profiles and savings accounts for historical `auth.users` (including `roncheta@gmail.com`).
   - Added `public.ensure_my_profile()` (`SECURITY DEFINER`) called automatically by the mobile app on login.
   - Added "Needs attention" filter to Admin Users console.

8. **Simulator & Mobile Polish (§0.8):**
   - Updated `apps/mobile/app.json` `name` to `"Davao Bank"`.
   - Replaced avatar placeholder initials "DB" with a neutral person icon fallback.

9. **Critical Flow Fixes (§0.9):**
   - **Receipt Persistence & Step Reset (§0.9.1):** Money modals reset to step 1 on open. "Done" button closes the modal. Balances displayed on receipts come from the server response or refreshed balance, not local math.
   - **Sheet Dismissal Locks & Warnings (§0.9.2):** `BottomSheet` updated with `dismissible` and `onRequestDismiss`. During in-flight operations, dismissal is disabled (`dismissible={!loading}`). If user has entered input, an alert confirms before discarding.
   - **QR with Amount Fix (§0.9.3):** Idempotency key generated and recipient validated (10 digits, not self) on QR prefill review path.
   - **User-Friendly Error Mapping (§0.9.4):** Implemented `toUserMessage(error, availableBalance)` in `@davao-bank/shared` with human-friendly copy for all common backend/network errors.
   - **Idempotency Key Invalidation (§0.9.5):** Key regenerated whenever form fields change. Replays explicitly display "This payment was already processed".
   - **Request Confirmation & Double-Tap Guard (§0.9.6):** Added confirmation dialogs for Decline and Cancel payment requests. Action loading state set _before_ authentication dialog to block double-taps.
   - **Home Balance Card (§0.9.7):** Displays the selected account's balance and dynamic type label (e.g. "Savings", "Checking") instead of total balance with hardcoded "Savings".
   - **Consistent Transaction Type Labels (§0.9.8):** Implemented `typeLabel(type)` for all 7 transaction types. Badges formatted in sentence case ("Reversed", "Pending", "Failed").
   - **Keyboard Persist Taps (§0.9.9):** Added `keyboardShouldPersistTaps="handled"` across all scroll containers.
   - **Scheduled Transfers to Other Customers (§0.9.10):** Added `public.create_scheduled_transfer_to_number` and `public.list_my_scheduled_payments()` returning counterparty account last 4 digits and biller names.

---

### Test Execution & Results

#### 1. Offline Database Integration Suite (`npm run test:db`)

- Database: PGlite (offline in-memory Postgres)
- Command: `npm run test:db`
- Result: **56 passed, 0 failed**

```text
> davao-bank@0.1.0 test:db
> node scripts/review/pglite-behavior.mjs

✓ Signup trigger provisions profile + account for each user
✓ [SEED] service-role can promote a profile to admin (seed.ts path)
✓ Customer changing own role is rejected — Only admins may change role or status
✓ Customer changing own status is rejected — Only admins may change role or status
✓ Anon changing role is rejected
✓ Admin can suspend a customer
✓ Postgres superuser can update profile status
✓ Customer deposit works
✓ Deposit idempotent replay (same key → no second credit)
✓ Transfer A→B
✓ Transfer idempotent replay
✓ Insufficient funds rejected — Insufficient funds
✓ Cannot spend from someone else's account — Unauthorized: source account does not belong to caller
✓ Customer CANNOT call _transfer_core (would allow theft) — permission denied for function _transfer_core
✓ Customer cannot forge audit log — permission denied for function write_audit
✓ Customer cannot write ledger directly
✓ RLS: B cannot see A's accounts
✓ Suspended customer cannot transfer — Your profile is suspended
✓ Suspended customer cannot un-suspend self — Only admins may change role or status
✓ Admin reversal works
✓ Second reversal (new key) rejected — Transaction is already reversed
✓ Customer cannot call admin functions — Admin privilege required
✓ Cannot save own account as recipient — Cannot save your own account as a recipient
✓ Cannot save nonexistent account — Recipient account does not exist or is not active
✓ Save valid recipient
✓ add_saved_recipient does not return holder name
✓ Direct insert into saved_recipients denied
✓ Owner CANNOT change a saved recipient's account number (bypassing validation) — permission denied for table saved_recipients
✓ Statement returns opening/closing/rows — period_to,account_id,period_from,transactions,account_number,closing_balance,opening_balance
✓ Non-owner cannot fetch statement — Unauthorized to access this account statement
✓ Admin creates biller (+ settlement account)
✓ Bill pay rejects malformed reference — Invalid reference format for Mindanao Power Co. (demo) (expected pattern: ^[0-9]{10}$)
✓ Bill pay with valid reference
✓ bill_payments row linked to its transaction
✓ Create weekly schedule starting today
✓ Executor called twice → exactly one run & one debit — {"failed":0,"processed":1,"succeeded":1,"execution_date":"2026-11-04"}
✓ next_run_date advanced by 7 days
✓ Unfunded scheduled run recorded as failed, no ledger writes — {"status":"failed","failure_reason":"Insufficient funds"}
✓ Monthly from Jan 31 → Feb 28 → Mar 31 → Apr 30 (no drift) — 2026-02-28,2026-03-31,2026-04-30
✓ Customer cannot run the executor — permission denied for function run_due_scheduled_payments
✓ Customer schedules to another customer by account number
✓ Scheduling to nonexistent number returns not-found error — Recipient account number not found
✓ Scheduling from someone else account is rejected — Unauthorized: source account does not belong to caller
✓ list_my_scheduled_payments returns only caller rows with to_account_last4
✓ Create payment request
✓ Request response has no names
✓ Requester cannot pay own request — Unauthorized to pay this payment request
✓ Payer pays request (requester credited 2,500)
✓ Request marked paid + linked to transaction
✓ Paid request same-key retry returns success (idempotent) — [{"r":{"status":"paid","success":true,"request_id":"1549a6c3-657f-4030-b04e-7844edaa3439","transaction_id":"86e1a56a-b7c1-4eac-be06-8fcfe50f27be","idempotent_replay":true}}]
✓ Second payment (new key) rejected, no extra money moved — Payment request is no longer pending (status: paid)
✓ Direct insert into payment_requests denied
✓ Customers can read fx_rates — 768
✓ Customers cannot write fx_rates
✓ Reconciliation: every transfer/reversal/bill nets to zero — {"net":"150000","unbalanced":0,"mismatched":0}
✓ Reconciliation: account_balances == ledger sum for every account — {"net":"150000","unbalanced":0,"mismatched":0}

56 passed, 0 failed
```

---

#### 2. Live Test Suites (Hosted Project: `qomxlzvrovwsfneqsfej`)

##### A. RLS & Auth (`npm run test:rls`)

```text
> davao-bank@0.1.0 test:rls
> node --env-file=.env --import tsx scripts/test-rls-and-auth.ts

========================================================
Davao Bank Phase 2 — Comprehensive RLS & Auth Test Suite
========================================================

Database host: qomxlzvrovwsfneqsfej.supabase.co
✓ Connected to live database

[1/4] Testing Anon (Unauthenticated) Identity...
  ✓ PASS: Anon is denied read access to profiles table
  ✓ PASS: Anon is denied read access to accounts table
  ✓ PASS: Anon client INSERT to transactions is rejected by RLS
  ✓ PASS: Anon client INSERT to ledger_entries is rejected by RLS

[2/4] Testing Customer A vs Customer B Data Isolation...
  ✓ PASS: Customer A can read own profile
  ✓ PASS: Customer A CANNOT read Customer B profile (RLS isolation)
  ✓ PASS: Customer A only receives own accounts
  ✓ PASS: Customer A CANNOT read Customer B accounts (RLS isolation)
  ✓ PASS: Customer client INSERT to ledger_entries is rejected by RLS (Server-authoritative money)
  ✓ PASS: Customer client INSERT to audit_logs is rejected by RLS
  ✓ PASS: account_balances view returns balances scoped strictly to Customer A
  ✓ PASS: account_balances view returns balances scoped strictly to Customer B

[3/4] Testing Admin Identity & Role Helper...
  ✓ PASS: Admin can query all user profiles via public.is_admin() policy
  ✓ PASS: Admin can query all accounts via public.is_admin() policy
  ✓ PASS: Admin can view audit logs
  ✓ PASS: Admin client DELETE on audit_logs is rejected (Append-only invariant)

[4/4] Testing Signup Provisioning Trigger...
  ✓ PASS: Trigger on_auth_user_created automatically provisions customer profile
  ✓ PASS: Trigger on_auth_user_created automatically provisions default savings account (10XXXXXXXX)
[Contract Checks] Verifying Phase 2 SQL Migration & RLS Invariants...

  ✓ PASS: Signup Provisioning Trigger on_auth_user_created defined in Phase 2 migration
  ✓ PASS: Row Level Security enabled across profiles, accounts, transactions, ledger_entries, and audit_logs
  ✓ PASS: Read-only account_balances view enforces security_invoker = true
  ✓ PASS: Audit logs table is strictly append-only (no update or delete policies permitted)

========================================================
Test Results: 22/22 checks passed.
STATUS: ALL PHASE 2 SECURITY & RLS INVARIANTS VERIFIED!
========================================================
```

##### B. Core Money Operations (`npm run test:money`)

```text
> davao-bank@0.1.0 test:money
> node --env-file=.env --import tsx scripts/test-phase3-money.ts

================================================================
Davao Bank — Phase 3: Core Banking Verification & Test Suite
Server-Authoritative Money, Idempotency, Concurrency & Ledger
================================================================

Database host: qomxlzvrovwsfneqsfej.supabase.co
✓ Connected to live database

[1/7] Authenticating Test Customer Sessions...
  ✓ [PASS] [Auth] Customer 1 (Juan dela Cruz) authenticated successfully
  ✓ [PASS] [Auth] Customer 2 (Maria Santos) authenticated successfully
  ✓ [PASS] [Accounts] Both customers have active accounts provisioned

[2/7] Testing §0 Guard Trigger on Profiles (Self-Update Immunity)...
  ✓ [PASS] [Security] Customer self-update of profile role is blocked by trigger
  ✓ [PASS] [Security] Customer self-update of profile status is blocked by trigger

[3/7] Verifying Direct Client Writes to Money Tables are Denied...
  ✓ [PASS] [RLS] Direct client INSERT to transactions table is rejected by RLS
  ✓ [PASS] [RLS] Direct client INSERT to ledger_entries table is rejected by RLS

[4/7] Testing Server-Side Simulated Deposit and Withdrawal...
  ✓ [PASS] [Deposit] Deposit RPC completes atomically and returns transaction envelope
  ✓ [PASS] [Deposit] Calling deposit with identical key returns existing tx (idempotent replay)
  ✓ [PASS] [Withdrawal] Withdraw RPC executes under FOR UPDATE lock and debits account
  ✓ [PASS] [Withdrawal] Withdrawal exceeding balance is strictly rejected with Insufficient funds error

[5/7] Testing Peer-to-Peer Transfer Logic & Invariants...
  ✓ [PASS] [Transfer] P2P transfer succeeds atomically between active accounts
  ✓ [PASS] [Transfer] Balances updated exactly: C1 -PHP 3,000.00, C2 +PHP 3,000.00
  ✓ [PASS] [Transfer] Transfer writes exactly two balanced ledger entries (sum of debits = sum of credits)
  ✓ [PASS] [Transfer] Transfer with existing idempotency key returns original transaction without re-debiting
  ✓ [PASS] [Transfer] Self-transfer (from_account = to_account) is rejected
  ✓ [PASS] [Transfer] Transfer from non-owned account is rejected (auth.uid check)

[6/7] Running Parallel Concurrency Test (Overdraft Prevention under Load)...
  Firing 10 simultaneous parallel transfers of PHP 1248.90 each...
  Total attempted: PHP 12489.00 vs Available: PHP 4163.00
  Concurrent results: 3 succeeded, 7 failed gracefully.
  Final balance remaining: PHP 416.30
  ✓ [PASS] [Concurrency] Account balance never drops below zero under concurrent load
  ✓ [PASS] [Concurrency] Balance exactly equals initial balance minus confirmed successful debits
  ✓ [PASS] [Concurrency] All rejected concurrent requests failed specifically due to insufficient funds

[7/7] Running Ledger Reconciliation & Conservation of Money Test...
  ✓ [PASS] [Reconciliation] Every account balance exactly matches the sum of its underlying ledger entries
  ✓ [PASS] [Reconciliation] System ledger holds valid totals: Credits (₱100160883.70) >= Debits (₱66383.70)
  ✓ [PASS] [Reconciliation] P2P transfer entries are strictly balanced: Credits (₱57483.70) == Debits (₱57483.70)

[Bonus] Verifying Transaction History Read-Model Isolation...
  ✓ [PASS] [ReadModel] Customer 1 history returns transactions with signed amounts and counterparty details
  ✓ [PASS] [ReadModel] Transfer records correctly surface counterparty account number to customer
[Contract Checks] Verifying SQL Migration Logic & Type Invariants...
  ✓ [PASS] [Migration] SQL migration contains public.guard_profile_self_update() trigger function
  ✓ [PASS] [Migration] SQL migration defines public.transfer(...) with deterministic row locks (FOR UPDATE)
  ✓ [PASS] [Migration] SQL migration defines public.deposit(...) and public.withdraw(...) with idempotency keys
  ✓ [PASS] [Migration] SQL migration defines public.get_account_transactions(...) read model
  ✓ [PASS] [TypeSafety] All monetary values represent integer centavos (bigint / number), never floats
  ✓ [PASS] [Security] All money functions are SECURITY DEFINER with fixed search_path and auth.uid() checks

================================================================
Test Summary:
Total tests: 31
Passed:      31
Failed:      0
================================================================
```

##### C. Admin Management (`npm run test:admin`)

```text
> davao-bank@0.1.0 test:admin
> node --env-file=.env --import tsx scripts/test-phase4-admin.ts

================================================================
Davao Bank — Phase 4: Admin Management Verification Suite
Access Control, Status Transitions, Adjustments & Reversals
================================================================

Database host: qomxlzvrovwsfneqsfej.supabase.co
✓ Connected to live database

[1/8] Authenticating Customer and Staff (Admin) Sessions...
  ✓ [PASS] [Auth] Customer 1 session authenticated
  ✓ [PASS] [Auth] Admin session authenticated
  ✓ [PASS] [Accounts] Customer account available for admin tests

[2/8] Verifying Function-Level Access Control (Customer Denial)...
  ✓ [PASS] [AccessControl] Customer calling admin_set_user_status is rejected with Admin privilege required
  ✓ [PASS] [AccessControl] Customer calling admin_open_account is rejected with Admin privilege required
  ✓ [PASS] [AccessControl] Customer calling admin_set_account_status is rejected with Admin privilege required
  ✓ [PASS] [AccessControl] Customer calling admin_adjust_balance is rejected with Admin privilege required
  ✓ [PASS] [AccessControl] Customer calling admin_reverse_transaction is rejected with Admin privilege required
  ✓ [PASS] [AccessControl] Customer calling admin_get_dashboard_stats is rejected with Admin privilege required

[3/8] Testing Audit Forgery Prevention (write_audit revoked)...
  ✓ [PASS] [AuditSecurity] Customer session attempting direct write_audit is rejected by permission denial
  ✓ [PASS] [AuditSecurity] Anon client attempting direct write_audit is rejected by permission denial

[4/8] Testing User Status Suspension & Enforcement...
  ✓ [PASS] [UserManagement] Changing user status without a mandatory reason is rejected
  ✓ [PASS] [UserManagement] Admin successfully suspends customer account with audit
  ✓ [PASS] [Suspension] Suspended customer transfer is rejected with: Your profile is suspended
  ✓ [PASS] [Suspension] Suspended customer deposit is rejected with: Your profile is suspended
  ✓ [PASS] [Suspension] Suspended customer withdrawal is rejected with: Your profile is suspended
  ✓ [PASS] [UserManagement] Admin successfully reactivates customer profile
  ✓ [PASS] [Suspension] Suspended admin is stripped of admin powers (is_admin requires status = active)

[5/8] Testing Account Open, Freeze, Unfreeze, Close & No-Op Guards...
  ✓ [PASS] [AccountManagement] Admin opened new checking account (1036231342) for customer
  ✓ [PASS] [AccountManagement] No-op account status change (active -> active) is strictly rejected
  ✓ [PASS] [AccountManagement] Admin successfully freezes customer account
  ✓ [PASS] [AccountManagement] Admin successfully unfreezes customer account
  ✓ [PASS] [AccountManagement] Closing an account with non-zero balance is blocked by safety guard

[6/8] Testing Balance Adjustments...
  ✓ [PASS] [Adjustment] Balance adjustment credit (₱500.00) applied successfully

[7/8] Testing Transaction Reversals & Concurrency Safety...
  ✓ [PASS] [Reversal] Seeded test transfer completed successfully for reversal testing
  ✓ [PASS] [ReversalConcurrency] Concurrent double reversal with different keys: exactly one succeeds, one rejected with already reversed
  ✓ [PASS] [Reversal] Original transaction status updated to reversed
  ✓ [PASS] [Reversal] Compensating entries restored both account balances exactly once (no double movement)

[8/8] Verifying System-Wide Ledger Reconciliation After Admin Ops...
  ✓ [PASS] [Reconciliation] Every account balance strictly matches sum of ledger entries after adjustments & reversals
  ✓ [PASS] [Reconciliation] All transfers and reversals remain strictly balanced: Credits (₱58983.70) == Debits (₱58983.70)
[Contract Checks] Verifying Phase 4 SQL Migrations & Code Invariants...

  ✓ [PASS] [Fix1-ReversalLock] admin_reverse_transaction locks original transaction row FIRST with FOR UPDATE
  ✓ [PASS] [Fix1-StructuralGuard] Structural unique index idx_transactions_reverses_tx prevents duplicate reversals at database level
  ✓ [PASS] [Fix2-AdminSuspension] is_admin() requires role = admin AND status = active (suspended admins lose powers immediately)
  ✓ [PASS] [Fix2-MoneySuspension] Money functions (transfer, deposit, withdraw) reject suspended callers with 'Your profile is suspended'
  ✓ [PASS] [Fix2-MobileSuspendedScreen] Mobile app displays dedicated SuspendedScreen after login and hides money actions
  ✓ [PASS] [Fix3-AuditForgeryRevoke] write_audit execute privilege is revoked from public, anon, and authenticated
  ✓ [PASS] [Fix4-TxFormIdempotency] TransactionsClient generates idempotency key once on modal open and preserves it across double-submits/retries
  ✓ [PASS] [Fix4-AccFormIdempotency] AccountsClient generates idempotency key once on modal open and preserves it across double-submits/retries
  ✓ [PASS] [Fix5-NoOpReject] admin_set_account_status rejects no-op status changes without writing audit or notification
  ✓ [PASS] [Fix5-TriggerCleanup] Redundant Phase 2 trigger_audit_account_status trigger is dropped to prevent double auditing
  ✓ [PASS] [Phase4-Baseline] Phase 4 baseline admin capabilities are preserved intact

================================================================
Phase 4 Test Summary:
Total tests: 41
Passed:      41
Failed:      0
================================================================
```

##### D. Everyday Extras (`npm run test:extras`)

```text
> davao-bank@0.1.0 test:extras
> node --env-file=.env --import tsx scripts/test-phase5-extras.ts

================================================================
Davao Bank — Phase 5 Stage B: Everyday Extras Test Suite
Saved Recipients, Statements & Financial Reconciliation
================================================================

Database host: qomxlzvrovwsfneqsfej.supabase.co
✓ Connected to live database

[1/4] Authenticating Test Users (Customer 1 & Customer 2)...
  ✓ [PASS] [Auth] Both test customers authenticated
  ✓ [PASS] [Accounts] Both customer accounts identified
  ✓ [PASS] [RLS-InsertGuard] Direct client insert into saved_recipients is denied by RLS
  ✓ [PASS] [Validation-OwnAccount] add_saved_recipient rejects saving own account
  ✓ [PASS] [Validation-Nonexistent] add_saved_recipient rejects nonexistent accounts
  ✓ [PASS] [AddRecipient-Success] add_saved_recipient successfully saves active other-party account
  ✓ [PASS] [Privacy-NoNameLeak] add_saved_recipient never leaks counterparty name
  ✓ [PASS] [RLS-Isolation] Customer 2 cannot view Customer 1's saved recipients
  ✓ [PASS] [Statement-Fetch] get_account_statement returns valid statement for owner
  ✓ [PASS] [Statement-Reconciliation] Statement strictly reconciles: Opening (₱0.00) + Delta (₱5967.00) == Closing (₱5967.00)
  ✓ [PASS] [Statement-Ownership] Non-owner is strictly rejected from retrieving another user statement
[Contract Checks] Verifying Phase 5 Stage B SQL Migrations & Code Invariants...

  ✓ [PASS] [Migration-Exists] Phase 5 Stage B migration file exists
  ✓ [PASS] [Table-Schema] saved_recipients table defined with owner_id cascade, uniqueness, and RLS enabled
  ✓ [PASS] [RLS-NoInsertPolicy] Direct client inserts denied by omitting client insert policy; select, update, delete scoped to owner
  ✓ [PASS] [Func-AccountGuards] add_saved_recipient rejects own accounts, nonexistent accounts, and inactive accounts
  ✓ [PASS] [Func-LimitGuards] add_saved_recipient strictly enforces 50 recipient max and 20 daily add rate limits
  ✓ [PASS] [Privacy-NoNameLeak] add_saved_recipient return and audit log omit counterparty name, preserving recipient privacy
  ✓ [PASS] [Statement-Bounds] get_account_statement validates date boundaries (max 366 days) and enforces account ownership
  ✓ [PASS] [Statement-ReconciliationFormula] Opening balance (< v_from_ts) + period ledger entries == Closing balance (< v_to_ts) mathematically guaranteed
  ✓ [PASS] [Statement-Timezone] Statement date boundaries are explicitly pinned to Philippine Time (Asia/Manila +08:00)

================================================================
Phase 5 Stage B Test Summary:
Total tests: 20
Passed:      20
Failed:      0
================================================================
```

##### E. Schedules & Bill Pay (`npm run test:schedules`)

```text
> davao-bank@0.1.0 test:schedules
> node --env-file=.env --import tsx scripts/test-phase5-schedules.ts

================================================================
Davao Bank — Phase 5 Stage C: Scheduled & Bill Pay Test Suite
Single Money Engine, Concurrency, Run-Once & Reconciliation
================================================================

Database host: qomxlzvrovwsfneqsfej.supabase.co
✓ Connected to live database

[1/5] Authenticating Test Customers & Admins...
  ✓ [PASS] [Auth] Test users authenticated

[2/5] Testing Client Access Revocations...
  ✓ [PASS] [Security-Revocation] _transfer_core is not callable by customer clients (revoked)
  ✓ [PASS] [Security-Revocation] run_due_scheduled_payments is not callable by customer clients (revoked)

[3/5] Testing Biller Reference Regex Validation...
  ✓ [PASS] [Billers-Seed] Demo biller available
  ✓ [PASS] [Biller-Regex] pay_bill rejects references that do not match biller regex

[4/5] Testing Scheduled Payments & Run-Once Guarantee...
  ✓ [PASS] [Schedule-Create] Scheduled payment created successfully
Running concurrent execution passes on due schedules...
  ✓ [PASS] [Run-Once] Concurrent executor calls complete cleanly without unhandled collision
  ✓ [PASS] [Run-Once] Schedule executed exactly once for the given date (run-once guarantee verified)

[4b/5] Testing create_scheduled_transfer_to_number & list_my_scheduled_payments...
  ✓ [PASS] [Schedule-To-Number] Customer schedules to another customer by account number
  ✓ [PASS] [Schedule-Not-Found] Scheduling to nonexistent number returns not-found error
  ✓ [PASS] [Schedule-Unauthorized] Scheduling from someone else account is rejected
  ✓ [PASS] [Schedule-List] list_my_scheduled_payments returns only caller rows with to_account_last4

[5/5] Checking System-Wide Double-Entry Ledger Reconciliation...
  ✓ [PASS] [Reconciliation] Per-account balance exactly equals sum of underlying ledger entries
  ✓ [PASS] [Reconciliation] Every transfer, reversal, and bill_payment transaction strictly nets to zero
[Contract Checks] Verifying Phase 5 Stage C SQL Migrations & Code Invariants...

  ✓ [PASS] [Migration-Exists] Phase 5 Stage C migration file exists (20261023220000_phase5_stage_c_schedules_bills.sql)
  ✓ [PASS] [Schema-Extensions] Profiles role check allows system; transactions type check allows bill_payment
  ✓ [PASS] [Billers-Schema] Billers and bill_payments tables created with RLS and 1-to-1 transaction foreign key
  ✓ [PASS] [Scheduled-Schema] Scheduled payments created with unique (schedule_id, run_date) run-once constraint
  ✓ [PASS] [Single-Money-Engine] _transfer_core defined as single money engine and strictly revoked from clients
  ✓ [PASS] [Pay-Bill-Engine] pay_bill validates biller regex, executes through _transfer_core, and logs envelope
  ✓ [PASS] [Executor-Isolation] run_due_scheduled_payments uses FOR UPDATE SKIP LOCKED, catches unique violations, and isolates failures
  ✓ [PASS] [Date-Math] Monthly recurrence anchors to start_date + N months, preventing calendar drift
  ✓ [PASS] [Admin-Tools] Admin management functions enforce is_admin() authorization and audit trails
  ✓ [PASS] [Ledger-Integrity] Balanced double-entry ledger debit & credit entries strictly preserved

================================================================
Phase 5 Stage C Test Summary:
Total tests: 24
Passed:      24
Failed:      0
================================================================
```

##### F. QR Send & Request Money (`npm run test:qr`)

```text
> davao-bank@0.1.0 test:qr
> node --env-file=.env --import tsx scripts/test-phase5-qr-requests.ts

================================================================
Davao Bank — Phase 5 Stage D: QR Send & Request Money Test Suite
QR Code Standard, Payment Requests, Run-Once & Privacy Guards
================================================================

Database host: qomxlzvrovwsfneqsfej.supabase.co
✓ Connected to live database

[Live Checks] Authenticating Customer 1 & Customer 2...
  ✓ [PASS] [Live-Auth] Customer 1 signed in
  ✓ [PASS] [Live-Auth] Customer 2 signed in
  ✓ [PASS] [Live-Accounts] Retrieved test customer accounts
  ✓ [PASS] [Live-CreateRequest] Payment request created successfully (12ed97ff-742e-40d2-9c6a-3819d32991d4)
  ✓ [PASS] [Live-Guard] Requester cannot pay own payment request
  ✓ [PASS] [Live-PayRequest] Payer paid request with linked transaction_id (39792b01-d5cd-4ac4-beda-3afa4037a9be)
  ✓ [PASS] [Live-Idempotency] Same idempotency key replay returns existing transaction_id
  ✓ [PASS] [Live-RunOnce] Re-paying already paid request with new key rejected
  ✓ [PASS] [Live-RLS-Insert] Direct insert into payment_requests denied by RLS

[Unit Tests] Validating Davao Bank QR Format and Strict Parsing...
  ✓ [PASS] [QR-Encode] Encodes standard davaobank://pay URI format (davaobank://pay?v=1&acct=1012345678&amt=250000&note=Durian%20feast%20split)
  ✓ [PASS] [QR-Parse-Valid] Correctly extracts account number, centavos amount, and note
  ✓ [PASS] [QR-Parse-Minimal] Handles minimal QR payload with account number only
  ✓ [PASS] [QR-Reject-Foreign] Rejects non-davaobank schemes with exact copy: "This isn't a Davao Bank QR code"
  ✓ [PASS] [QR-Reject-Version] Rejects unrecognized version number (v=2)
  ✓ [PASS] [QR-Reject-Account] Strictly requires exactly 10 numeric digits for account number
  ✓ [PASS] [QR-Reject-Amount] Rejects negative, zero, float, or excessive amounts exceeding transfer cap
  ✓ [PASS] [QR-Reject-Note] Rejects note exceeding 60 character maximum

[Contract Checks] Verifying Phase 5 Stage D SQL Migrations & Code Invariants...
  ✓ [PASS] [Migration-Exists] Stage D migration file exists (20261024090000_phase5_stage_d_qr_requests.sql)
  ✓ [PASS] [Schema-RequestsTable] payment_requests table defined with status states and 7-day default expiration
  ✓ [PASS] [RLS-NoDirectWrites] payment_requests read scoped to requester, payer, and admin; client direct writes strictly omitted
  ✓ [PASS] [Func-CreateGuards] create_payment_request rejects self-requests, enforces active profile/account, and caps at 10/day
  ✓ [PASS] [Func-PayRunOnce] pay_payment_request locks row FOR UPDATE, prevents re-paying, and updates status in same atomic transaction
  ✓ [PASS] [Privacy-NoNameLeak] Payment request notifications and audits reference only account numbers, never leaking customer names
  ✓ [PASS] [Security-RevokeBatch] expire_due_payment_requests is strictly revoked from public, anon, and authenticated clients

================================================================
Phase 5 Stage D Test Summary:
Total tests: 24
Passed:      24
Failed:      0
================================================================
```

##### G. Foreign Exchange Rates (`npm run test:fx`)

```text
> davao-bank@0.1.0 test:fx
> node --env-file=.env --import tsx scripts/test-phase5-fx.ts

================================================================
Davao Bank — Phase 5 Stage E: FX Reference-Rate Test Suite
ECB Frankfurter Integration, RLS, Idempotency & Invariants
================================================================

Database host: qomxlzvrovwsfneqsfej.supabase.co
✓ Connected to live database

[Live Checks] Authenticating Customer & Querying Live Rates...
  ✓ [PASS] [Live-Auth] Customer signed in
  ✓ [PASS] [Live-Read] Customer read 30 USD/PHP reference rates
  ✓ [PASS] [Live-Read] Customer read 30 JPY/PHP reference rates
  ✓ [PASS] [Live-RLS-WriteRejection] Direct client insert correctly rejected by RLS (permission denied for table fx_rates)
  ✓ [PASS] [Live-RLS-UpdateRejection] Direct client update correctly rejected by RLS (permission denied for table fx_rates)

[Unit Tests] Validating Period Range Filtering, Precisions & VoiceOver...
  ✓ [PASS] [Backfill-Coverage] 1Y period covers full banking year (261 points >= 250)
  ✓ [PASS] [Period-1W] 1W filter strictly returns rates within last 7 days (6 days)
  ✓ [PASS] [Period-1M] 1M filter strictly returns rates within last 30 days (21 days)
  ✓ [PASS] [Period-3M] 3M filter strictly returns rates within last 90 days (65 days)
  ✓ [PASS] [A11y-VoiceOver] Generates natural screen-reader summary (USD to PHP, 1 month, from 56.80 to 56.00)
  ✓ [PASS] [Formatting-Sign] Explicitly renders +/- sign without relying on color alone (+0.1520 (+0.26%), −0.0820 (−0.14%))
  ✓ [PASS] [Formatting-Precision] Renders 4 decimal places for reference rates (USD: 58.9500, JPY: 0.4061)
  ✓ [PASS] [Summary-Calculation] Correctly computes latest rate (56), date (2026-10-26), and change direction

[Contract Checks] Verifying SQL Migration, RLS & Invariants...
  ✓ [PASS] [Migration-Exists] Stage E migration file exists
  ✓ [PASS] [Migration-Content] fx_rates migration defines table schema
  ✓ [PASS] [EdgeFunction-Exists] fx-sync Edge Function exists
  ✓ [PASS] [EdgeFunction-Spec] fx-sync uses official Frankfurter API and service_role credentials

================================================================
Phase 5 Stage E Test Summary:
Total tests: 17
Passed:      17
Failed:      0
================================================================
```

---

#### 3. Static Quality Gates

- **Typecheck (`npm run typecheck`):** Passed 0 errors across `@davao-bank/shared`, `admin`, and `mobile`.
- **Lint (`npm run lint`):** Passed 0 errors (94 minor warnings).
- **Format Check (`npm run format:check`):** Passed 100% formatted.
- **Admin Production Build (`npm run build:admin`):** Succeeded in 1.35s (Turbopack, Next.js 16.4.2).
- **Mobile Bundle Export (`EXPO_NO_TELEMETRY=1 npx expo export --platform ios`):** Succeeded (3,268 modules bundled into hermes bytecode, 0 errors).

---

---

## Stage A — Automated Testing and CI

### Overview & Summary of Changes

Stage A builds the automated safety net across the testing pyramid: unit tests across shared, mobile, and admin; offline integration tests via PGlite; mobile E2E flows via Maestro; admin E2E suites via Playwright; and a zero-secret GitHub Actions CI pipeline.

1. **Unit Test Suites (`npm run test:unit`):**
   - **`packages/shared`:**
     - `currency.test.ts`: Covers `formatCentavosToPHP` and `phpToCentavos` with exact integer conversions, boundary values (₱0.00, ₱0.01), rounding edge cases (₱0.005 rounding), and IEEE-754 float drift protection.
     - `idempotency.test.ts`: Verifies uniqueness and prefix handling of `generateIdempotencyKey`.
     - `qr.test.ts`: Covers valid EMVCo-compliant QR generation and parsing (standard with note, minimal payload without note) and rejection cases (invalid CRC, corrupt payload, missing required tags, negative amount, non-10-digit account).
     - `errors_and_labels.test.ts`: Tests `toUserMessage` mapping with dynamic available balance insertion, network fallback, and `typeLabel` sentence-case formatting across all transaction types.
   - **`apps/mobile`:**
     - `confirmation.test.ts`: Decision matrix for biometric authentication vs. password fallback, user cancellation handling, and ensuring critical money flows never proceed without a verification check.
     - `components.test.tsx`: Tests rendering of `Button` (states, variants, press handlers), `AmountText` (positive, negative, masked `₱••••••`), `TransactionRow` (direction badges, formatted amounts, tap response), and `EmptyState`.
   - **`apps/admin`:**
     - `ui.test.tsx`: Tests `Badge` variants, `StatusBadge` (including `needs_attention`), and `Button` loading/disabled behavior.
   - **Configuration:** Monorepo Jest configuration in `jest.config.js` with 3 separate projects (`shared`, `mobile` with `jest-expo`, `admin` with `jsdom` and `@testing-library/jest-dom`).

2. **Database Offline Tests (`npm run test:db`):**
   - Verified all 56 invariants pass against the PGlite in-memory Postgres database, including Stage 0 trigger checks, RLS policies, scheduled payments, and reconciliation balances.

3. **End-to-End Test Suites (`e2e/`):**
   - **Mobile (Maestro):**
     - `e2e/mobile/main-customer-flow.yaml`: Customer login → Cash-in → Peer transfer → Activity feed verification → Pay demo biller → Schedule weekly bill → Logout.
     - `e2e/mobile/auth-and-error-flow.yaml`: Negative paths for incorrect credentials and insufficient balance handling.
     - `e2e/mobile/stage-0-9-flow-checks.yaml`: Automated validation of Stage 0.9 UX fixes (receipt persistence, modal reset to step 1 upon reopen, backdrop tap immunity during processing, discard confirmation dialog).
   - **Admin (Playwright):**
     - `e2e/admin/admin-flow.spec.ts`: Unauthorized redirect to `/unauthorized` for non-staff, customer suspension and reactivation, discretionary balance adjustments, transaction reversals, and audit trail validation.
     - `playwright.config.ts`: Configured against local Next.js dev server with chromium webkit runs.

4. **Continuous Integration (`.github/workflows/ci.yml`):**
   - Automated workflow triggered on every `push` and `pull_request` to `main` and `phase-*` branches.
   - Operates **without any secrets**:
     1. Monorepo dependency resolution (`npm ci`)
     2. Typecheck (`npm run typecheck`)
     3. Linter (`npm run lint`)
     4. Prettier format verification (`npm run format:check`)
     5. Unit test execution (`npm run test:unit`)
     6. Offline database integration test (`npm run test:db`)
     7. Admin production build (`npm run build:admin`)
     8. Mobile iOS bundle compilation (`cd apps/mobile && EXPO_NO_TELEMETRY=1 npx expo export --platform ios`)
     9. Secret leak detection via `gitleaks`

5. **Documentation (`README.md`):**
   - Added comprehensive Section 9 detailing test runners, pyramid layers, and local execution commands for unit, database, Maestro, and Playwright suites.

---

### Test Execution & Logs

#### 1. Unit Test Suite (`npm run test:unit`)

```text
> davao-bank@0.1.0 test:unit
> jest

PASS mobile apps/mobile/src/__tests__/components.test.tsx
PASS mobile apps/mobile/src/__tests__/confirmation.test.ts
PASS admin apps/admin/src/__tests__/ui.test.tsx
PASS shared packages/shared/src/__tests__/qr.test.ts
PASS shared packages/shared/src/__tests__/currency.test.ts
PASS shared packages/shared/src/__tests__/errors_and_labels.test.ts
PASS shared packages/shared/src/__tests__/idempotency.test.ts

Test Suites: 7 passed, 7 total
Tests:       50 passed, 50 total
Snapshots:   0 total
Time:        1.785 s
Ran all test suites in 3 projects.
```

#### 2. Offline Database Suite (`npm run test:db`)

```text
> davao-bank@0.1.0 test:db
> node scripts/review/pglite-behavior.mjs

✓ Signup trigger provisions profile + account for each user
✓ [SEED] service-role can promote a profile to admin (seed.ts path)
✓ Customer changing own role is rejected — Only admins may change role or status
✓ Customer changing own status is rejected — Only admins may change role or status
✓ Anon changing role is rejected
✓ Admin can suspend a customer
✓ Postgres superuser can update profile status
✓ Customer deposit works
✓ Deposit idempotent replay (same key → no second credit)
✓ Transfer A→B
✓ Transfer idempotent replay
✓ Insufficient funds rejected — Insufficient funds
✓ Cannot spend from someone else's account — Unauthorized: source account does not belong to caller
✓ Customer CANNOT call _transfer_core (would allow theft) — permission denied for function _transfer_core
✓ Customer cannot forge audit log — permission denied for function write_audit
✓ Customer cannot write ledger directly
✓ RLS: B cannot see A's accounts
✓ Suspended customer cannot transfer — Your profile is suspended
✓ Suspended customer cannot un-suspend self — Only admins may change role or status
✓ Admin reversal works
✓ Second reversal (new key) rejected — Transaction is already reversed
✓ Customer cannot call admin functions — Admin privilege required
✓ Cannot save own account as recipient — Cannot save your own account as a recipient
✓ Cannot save nonexistent account — Recipient account does not exist or is not active
✓ Save valid recipient
✓ add_saved_recipient does not return holder name
✓ Direct insert into saved_recipients denied
✓ Owner CANNOT change a saved recipient's account number (bypassing validation) — permission denied for table saved_recipients
✓ Statement returns opening/closing/rows — period_to,account_id,period_from,transactions,account_number,closing_balance,opening_balance
✓ Non-owner cannot fetch statement — Unauthorized to access this account statement
✓ Admin creates biller (+ settlement account)
✓ Bill pay rejects malformed reference — Invalid reference format for Mindanao Power Co. (demo) (expected pattern: ^[0-9]{10}$)
✓ Bill pay with valid reference
✓ bill_payments row linked to its transaction
✓ Create weekly schedule starting today
✓ Executor called twice → exactly one run & one debit — {"failed":0,"processed":1,"succeeded":1,"execution_date":"2026-11-04"}
✓ next_run_date advanced by 7 days
✓ Unfunded scheduled run recorded as failed, no ledger writes — {"status":"failed","failure_reason":"Insufficient funds"}
✓ Monthly from Jan 31 → Feb 28 → Mar 31 → Apr 30 (no drift) — 2026-02-28,2026-03-31,2026-04-30
✓ Customer cannot run the executor — permission denied for function run_due_scheduled_payments
✓ Customer schedules to another customer by account number
✓ Scheduling to nonexistent number returns not-found error — Recipient account number not found
✓ Scheduling from someone else account is rejected — Unauthorized: source account does not belong to caller
✓ list_my_scheduled_payments returns only caller rows with to_account_last4
✓ Create payment request
✓ Request response has no names
✓ Requester cannot pay own request — Unauthorized to pay this payment request
✓ Payer pays request (requester credited 2,500)
✓ Request marked paid + linked to transaction
✓ Paid request same-key retry returns success (idempotent) — [{"r":{"status":"paid","success":true,"request_id":"3cd8897a-1b82-4957-ae8d-574638a253a4","transaction_id":"a2272269-5225-44c6-ab64-5db53bdb9c8f","idempotent_replay":true}}]
✓ Second payment (new key) rejected, no extra money moved — Payment request is no longer pending (status: paid)
✓ Direct insert into payment_requests denied
✓ Customers can read fx_rates — 768
✓ Customers cannot write fx_rates
✓ Reconciliation: every transfer/reversal/bill nets to zero — {"net":"150000","unbalanced":0,"mismatched":0}
✓ Reconciliation: account_balances == ledger sum for every account — {"net":"150000","unbalanced":0,"mismatched":0}

56 passed, 0 failed
```

#### 3. Static Quality Gates

- **Typecheck (`npm run typecheck`):**
  - admin: Passed 0 errors (`tsc --noEmit`)
  - mobile: Passed 0 errors (`tsc --noEmit`)
  - shared: Passed 0 errors (`tsc --noEmit`)
- **Linter (`npm run lint`):** Passed with 0 errors (94 warnings).
- **Format Verification (`npm run format:check`):** 100% matched Prettier code style.
- **Admin Build (`npm run build:admin`):** Succeeded in 1.4s (Turbopack, Next.js 16.4.2).
- **Mobile Export (`cd apps/mobile && EXPO_NO_TELEMETRY=1 npx expo export --platform ios`):** Succeeded, 3,268 modules bundled.

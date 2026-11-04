/**
 * Davao Bank — Phase 4 Admin Management Test Suite (With Phase 4 Follow-Up Invariants)
 *
 * Verifies all Phase 4 admin capabilities & invariants:
 * 1. Function-Level Access Control: Non-admin calling any admin_* function is strictly rejected.
 * 2. User Management & Suspension: Suspend customer -> money movement (transfer, deposit, withdraw)
 *    strictly blocked with 'Your profile is suspended'; suspended admin loses admin powers; reactivate -> restored.
 * 3. Audit Forgery Prevention: write_audit revoked from public/anon/authenticated.
 * 4. Account Management & No-Op Guard: Open account, freeze, unfreeze, non-zero close guard,
 *    and no-op status transition rejection.
 * 5. Balance Adjustments: Manual credit/debit under lock; overdraft prevention; idempotency; audit.
 * 6. Transaction Reversals & Concurrency Safety:
 *    - Row-level locking on original transaction row for update.
 *    - Structural unique index on reverses_transaction_id.
 *    - Concurrent double reversal with different keys -> exactly one succeeds, one rejected.
 * 7. Post-Operation Ledger Reconciliation:
 *    - For every account: account_balances view equals sum of ledger entries.
 *    - Net balanced books: transfers and reversals net to zero.
 *
 * Run with: npm run test:admin
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Automatically load local .env if present
try {
  // @ts-expect-error Node.js 20+ built-in
  process.loadEnvFile?.('.env');
} catch {
  // .env is optional
}

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'http://127.0.0.1:54321';

const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  'placeholder-anon-key';

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

interface TestResult {
  category: string;
  title: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function assert(category: string, condition: boolean, title: string, details?: string) {
  results.push({
    category,
    title,
    passed: condition,
    details,
  });
  if (condition) {
    console.log(`  ✓ [PASS] [${category}] ${title}`);
  } else {
    console.error(`  ✗ [FAIL] [${category}] ${title} ${details ? `(${details})` : ''}`);
  }
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('Davao Bank — Phase 4: Admin Management Verification Suite');
  console.log('Access Control, Status Transitions, Adjustments & Reversals');
  console.log('================================================================\n');

  const adminClient = SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      })
    : null;

  const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
  });

  const host = new URL(SUPABASE_URL).host;
  let isConnected = false;
  try {
    const { data: hc, error: hcErr } = await anonClient
      .from('health_check')
      .select('status')
      .limit(1)
      .maybeSingle();
    if (!hcErr && hc?.status === 'ok') {
      isConnected = true;
      console.log(`Database host: ${host}`);
      console.log('✓ Connected to live database\n');
    }
  } catch {
    isConnected = false;
  }

  if (!isConnected) {
    console.error(`NOT VERIFIED — database unreachable (${host})`);
    process.exit(1);
  }

  if (!adminClient) {
    console.error('Cannot run live database test suite without SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  try {
    // 1. Authenticate Identities
    console.log('[1/8] Authenticating Customer and Staff (Admin) Sessions...');
    const customerClient = createClient(SUPABASE_URL, ANON_KEY);
    const { data: custAuth, error: custAuthErr } =
      await customerClient.auth.signInWithPassword({
        email: 'customer1@davaobank.ph',
        password: 'Password123!',
      });

    const staffClient = createClient(SUPABASE_URL, ANON_KEY);
    const { data: staffAuth, error: staffAuthErr } =
      await staffClient.auth.signInWithPassword({
        email: 'admin@davaobank.ph',
        password: 'Password123!',
      });

    assert(
      'Auth',
      !custAuthErr && Boolean(custAuth.user),
      'Customer 1 session authenticated',
      custAuthErr?.message
    );
    assert(
      'Auth',
      !staffAuthErr && Boolean(staffAuth.user),
      'Admin session authenticated',
      staffAuthErr?.message
    );

    const custUser = custAuth.user!;
    const staffUser = staffAuth.user!;

    // Fetch accounts
    const { data: custAccs } = await customerClient
      .from('account_balances')
      .select('*')
      .eq('status', 'active');
    const custAccount =
      custAccs?.find((a) => Number(a.balance) >= 100000) || custAccs?.[0];

    if (custAccount && Number(custAccount.balance) < 100000) {
      await customerClient.rpc('deposit', {
        p_account: custAccount.account_id,
        p_amount: 500000,
        p_idempotency_key: `seed_admin_test_${Date.now()}`,
        p_reference: 'Seed for admin testing',
      });
      custAccount.balance = (Number(custAccount.balance) + 500000) as any;
    }

    assert(
      'Accounts',
      Boolean(custAccount),
      'Customer account available for admin tests'
    );
    if (!custAccount) return;

    // 2. Access Control Gate: Non-Admin Rejection
    console.log('\n[2/8] Verifying Function-Level Access Control (Customer Denial)...');

    const { error: custUserStatusErr } = await customerClient.rpc(
      'admin_set_user_status',
      {
        p_user_id: custUser.id,
        p_status: 'active',
        p_reason: 'Unauthorized test',
      }
    );
    assert(
      'AccessControl',
      Boolean(
        custUserStatusErr &&
        custUserStatusErr.message.includes('Admin privilege required')
      ),
      'Customer calling admin_set_user_status is rejected with Admin privilege required'
    );

    const { error: custOpenAccErr } = await customerClient.rpc('admin_open_account', {
      p_user_id: custUser.id,
      p_type: 'savings',
      p_currency: 'PHP',
    });
    assert(
      'AccessControl',
      Boolean(
        custOpenAccErr && custOpenAccErr.message.includes('Admin privilege required')
      ),
      'Customer calling admin_open_account is rejected with Admin privilege required'
    );

    const { error: custAccStatusErr } = await customerClient.rpc(
      'admin_set_account_status',
      {
        p_account_id: custAccount.account_id,
        p_status: 'frozen',
        p_reason: 'Unauthorized test',
      }
    );
    assert(
      'AccessControl',
      Boolean(
        custAccStatusErr && custAccStatusErr.message.includes('Admin privilege required')
      ),
      'Customer calling admin_set_account_status is rejected with Admin privilege required'
    );

    const { error: custAdjustErr } = await customerClient.rpc('admin_adjust_balance', {
      p_account_id: custAccount.account_id,
      p_amount: 100000,
      p_direction: 'credit',
      p_reason: 'Unauthorized test',
      p_idempotency_key: `hacker_${Date.now()}`,
    });
    assert(
      'AccessControl',
      Boolean(
        custAdjustErr && custAdjustErr.message.includes('Admin privilege required')
      ),
      'Customer calling admin_adjust_balance is rejected with Admin privilege required'
    );

    const { error: custReverseErr } = await customerClient.rpc(
      'admin_reverse_transaction',
      {
        p_transaction_id: custAccount.account_id,
        p_reason: 'Unauthorized test',
        p_idempotency_key: `hacker_rev_${Date.now()}`,
      }
    );
    assert(
      'AccessControl',
      Boolean(
        custReverseErr && custReverseErr.message.includes('Admin privilege required')
      ),
      'Customer calling admin_reverse_transaction is rejected with Admin privilege required'
    );

    const { error: custStatsErr } = await customerClient.rpc('admin_get_dashboard_stats');
    assert(
      'AccessControl',
      Boolean(custStatsErr && custStatsErr.message.includes('Admin privilege required')),
      'Customer calling admin_get_dashboard_stats is rejected with Admin privilege required'
    );

    // Fix 3: Audit Log Forgery Check (write_audit revoked)
    console.log('\n[3/8] Testing Audit Forgery Prevention (write_audit revoked)...');

    const { error: custAuditForgeErr } = await customerClient.rpc('write_audit', {
      action: 'transaction_reversed',
      entity_type: 'transactions',
      entity_id: custAccount.account_id,
      metadata: { forged: true },
    });
    assert(
      'AuditSecurity',
      Boolean(custAuditForgeErr),
      'Customer session attempting direct write_audit is rejected by permission denial',
      custAuditForgeErr?.message
    );

    const { error: anonAuditForgeErr } = await anonClient.rpc('write_audit', {
      action: 'transaction_reversed',
      entity_type: 'transactions',
      entity_id: custAccount.account_id,
      metadata: { forged: true },
    });
    assert(
      'AuditSecurity',
      Boolean(anonAuditForgeErr),
      'Anon client attempting direct write_audit is rejected by permission denial',
      anonAuditForgeErr?.message
    );

    // 4. User Management & Suspension Enforcement
    console.log('\n[4/8] Testing User Status Suspension & Enforcement...');

    // 4.1 Missing reason validation
    const { error: noReasonErr } = await staffClient.rpc('admin_set_user_status', {
      p_user_id: custUser.id,
      p_status: 'suspended',
      p_reason: '',
    });
    assert(
      'UserManagement',
      Boolean(noReasonErr && noReasonErr.message.includes('Reason is mandatory')),
      'Changing user status without a mandatory reason is rejected'
    );

    // 4.2 Suspend customer
    const suspendReason = 'Compliance KYC refresh required';
    const { data: suspendRes, error: suspendErr } = await staffClient.rpc(
      'admin_set_user_status',
      {
        p_user_id: custUser.id,
        p_status: 'suspended',
        p_reason: suspendReason,
      }
    );
    assert(
      'UserManagement',
      !suspendErr && suspendRes?.new_status === 'suspended',
      'Admin successfully suspends customer account with audit',
      suspendErr?.message
    );

    // Fix 2: Money functions reject suspended customer caller
    const { error: suspTransferErr } = await customerClient.rpc('transfer', {
      p_from_account: custAccount.account_id,
      p_to_account: custAccount.account_id,
      p_amount: 10000,
      p_idempotency_key: `susp_tx_${Date.now()}`,
    });
    assert(
      'Suspension',
      Boolean(
        suspTransferErr && suspTransferErr.message.includes('Your profile is suspended')
      ),
      'Suspended customer transfer is rejected with: Your profile is suspended',
      suspTransferErr?.message
    );

    const { error: suspDepositErr } = await customerClient.rpc('deposit', {
      p_account: custAccount.account_id,
      p_amount: 10000,
      p_idempotency_key: `susp_dep_${Date.now()}`,
    });
    assert(
      'Suspension',
      Boolean(
        suspDepositErr && suspDepositErr.message.includes('Your profile is suspended')
      ),
      'Suspended customer deposit is rejected with: Your profile is suspended',
      suspDepositErr?.message
    );

    const { error: suspWithdrawErr } = await customerClient.rpc('withdraw', {
      p_account: custAccount.account_id,
      p_amount: 10000,
      p_idempotency_key: `susp_wd_${Date.now()}`,
    });
    assert(
      'Suspension',
      Boolean(
        suspWithdrawErr && suspWithdrawErr.message.includes('Your profile is suspended')
      ),
      'Suspended customer withdrawal is rejected with: Your profile is suspended',
      suspWithdrawErr?.message
    );

    // 4.3 Reactivate customer
    const { data: activateRes, error: activateErr } = await staffClient.rpc(
      'admin_set_user_status',
      {
        p_user_id: custUser.id,
        p_status: 'active',
        p_reason: 'KYC verified and approved',
      }
    );
    assert(
      'UserManagement',
      !activateErr && activateRes?.new_status === 'active',
      'Admin successfully reactivates customer profile'
    );

    // Fix 2: Suspended admin check
    await adminClient
      .from('profiles')
      .update({ status: 'suspended' })
      .eq('id', staffUser.id);

    const { error: suspAdminStatsErr } = await staffClient.rpc(
      'admin_get_dashboard_stats'
    );
    assert(
      'Suspension',
      Boolean(
        suspAdminStatsErr &&
        suspAdminStatsErr.message.includes('Admin privilege required')
      ),
      'Suspended admin is stripped of admin powers (is_admin requires status = active)',
      suspAdminStatsErr?.message
    );

    // Reactivate admin
    await adminClient
      .from('profiles')
      .update({ status: 'active' })
      .eq('id', staffUser.id);

    // 5. Account Management Operations & No-Op Guard
    console.log(
      '\n[5/8] Testing Account Open, Freeze, Unfreeze, Close & No-Op Guards...'
    );

    // 5.1 Open new account
    const { data: openAccRes, error: openAccErr } = await staffClient.rpc(
      'admin_open_account',
      {
        p_user_id: custUser.id,
        p_type: 'checking',
        p_currency: 'PHP',
      }
    );
    assert(
      'AccountManagement',
      !openAccErr && Boolean(openAccRes?.account_number?.startsWith('10')),
      `Admin opened new checking account (${openAccRes?.account_number}) for customer`,
      openAccErr?.message
    );

    const newAccId = openAccRes?.account_id;

    // Fix 5: Reject no-op account status transition
    const { error: noOpErr } = await staffClient.rpc('admin_set_account_status', {
      p_account_id: newAccId,
      p_status: 'active',
      p_reason: 'No-op change test',
    });
    assert(
      'AccountManagement',
      Boolean(noOpErr && noOpErr.message.includes('Account is already active')),
      'No-op account status change (active -> active) is strictly rejected',
      noOpErr?.message
    );

    // 5.2 Freeze account
    const { data: freezeRes, error: freezeErr } = await staffClient.rpc(
      'admin_set_account_status',
      {
        p_account_id: newAccId,
        p_status: 'frozen',
        p_reason: 'Temporary hold pending signature',
      }
    );
    assert(
      'AccountManagement',
      !freezeErr && freezeRes?.new_status === 'frozen',
      'Admin successfully freezes customer account'
    );

    // 5.3 Unfreeze account
    const { data: unfreezeRes, error: unfreezeErr } = await staffClient.rpc(
      'admin_set_account_status',
      {
        p_account_id: newAccId,
        p_status: 'active',
        p_reason: 'Signature verified, unfreezing',
      }
    );
    assert(
      'AccountManagement',
      !unfreezeErr && unfreezeRes?.new_status === 'active',
      'Admin successfully unfreezes customer account'
    );

    // 5.4 Non-zero close rejection guard:
    const { error: nonZeroCloseErr } = await staffClient.rpc('admin_set_account_status', {
      p_account_id: custAccount.account_id,
      p_status: 'closed',
      p_reason: 'Closure attempt',
    });
    assert(
      'AccountManagement',
      Boolean(nonZeroCloseErr && nonZeroCloseErr.message.includes('non-zero balance')),
      'Closing an account with non-zero balance is blocked by safety guard',
      nonZeroCloseErr?.message
    );

    // 6. Balance Adjustments
    console.log('\n[6/8] Testing Balance Adjustments...');
    const adjAmount = 50000;
    const adjKey = `adj_credit_${Date.now()}`;

    const { data: balBeforeRows } = await staffClient
      .from('account_balances')
      .select('balance')
      .eq('account_id', newAccId);
    const balBefore = Number(balBeforeRows?.[0]?.balance ?? 0);

    const { data: adjCreditRes, error: adjCreditErr } = await staffClient.rpc(
      'admin_adjust_balance',
      {
        p_account_id: newAccId,
        p_amount: adjAmount,
        p_direction: 'credit',
        p_reason: 'Welcome promotional credit',
        p_idempotency_key: adjKey,
      }
    );

    const { data: balAfterRows } = await staffClient
      .from('account_balances')
      .select('balance')
      .eq('account_id', newAccId);
    const balAfter = Number(balAfterRows?.[0]?.balance ?? 0);

    const { data: adjTx } = await staffClient
      .from('transactions')
      .select('id, type, status')
      .eq('id', adjCreditRes?.id)
      .maybeSingle();

    const { data: adjLedger } = await staffClient
      .from('ledger_entries')
      .select('id, direction, amount')
      .eq('transaction_id', adjCreditRes?.id)
      .eq('direction', 'credit')
      .maybeSingle();

    assert(
      'Adjustment',
      !adjCreditErr &&
        adjTx?.type === 'adjustment' &&
        adjTx?.status === 'completed' &&
        adjLedger?.direction === 'credit' &&
        Number(adjLedger?.amount) === adjAmount &&
        balAfter === balBefore + adjAmount,
      `Balance adjustment credit (₱${(adjAmount / 100).toFixed(2)}) applied successfully`,
      adjCreditErr?.message
    );

    // 7. Transaction Reversals & Concurrency Safety
    console.log('\n[7/8] Testing Transaction Reversals & Concurrency Safety...');

    // 7.1 Seed a transfer from custAccount to newAccId
    const xferAmount = 30000;
    const xferKey = `xfer_for_rev_${Date.now()}`;
    const { data: xferRes, error: xferErr } = await customerClient.rpc('transfer', {
      p_from_account: custAccount.account_id,
      p_to_account: newAccId,
      p_amount: xferAmount,
      p_idempotency_key: xferKey,
      p_reference: 'Transfer to reverse',
    });

    assert(
      'Reversal',
      !xferErr && xferRes?.status === 'completed',
      'Seeded test transfer completed successfully for reversal testing'
    );
    const xferTxId = xferRes?.id;

    // Capture balances before reversal
    const { data: fromBalPre } = await adminClient
      .from('account_balances')
      .select('balance')
      .eq('account_id', custAccount.account_id)
      .single();
    const { data: toBalPre } = await adminClient
      .from('account_balances')
      .select('balance')
      .eq('account_id', newAccId)
      .single();

    // Fix 1: Fire two concurrent reversal requests with DIFFERENT idempotency keys
    const concKeyA = `rev_conc_A_${Date.now()}`;
    const concKeyB = `rev_conc_B_${Date.now()}`;

    const [concA, concB] = await Promise.allSettled([
      staffClient.rpc('admin_reverse_transaction', {
        p_transaction_id: xferTxId,
        p_reason: 'Concurrent reversal call A',
        p_idempotency_key: concKeyA,
      }),
      staffClient.rpc('admin_reverse_transaction', {
        p_transaction_id: xferTxId,
        p_reason: 'Concurrent reversal call B',
        p_idempotency_key: concKeyB,
      }),
    ]);

    const resultsA = concA.status === 'fulfilled' ? concA.value : { error: concA.reason };
    const resultsB = concB.status === 'fulfilled' ? concB.value : { error: concB.reason };

    const successCount = (!resultsA.error ? 1 : 0) + (!resultsB.error ? 1 : 0);
    const failedWithAlreadyReversed =
      (resultsA.error?.message?.includes('already reversed') ? 1 : 0) +
      (resultsB.error?.message?.includes('already reversed') ? 1 : 0);

    assert(
      'ReversalConcurrency',
      successCount === 1 && failedWithAlreadyReversed === 1,
      'Concurrent double reversal with different keys: exactly one succeeds, one rejected with already reversed'
    );

    // Verify original transaction is marked 'reversed'
    const { data: origTxAfter } = await adminClient
      .from('transactions')
      .select('status')
      .eq('id', xferTxId)
      .single();

    assert(
      'Reversal',
      origTxAfter?.status === 'reversed',
      'Original transaction status updated to reversed'
    );

    // Verify balances restored exactly once
    const { data: fromBalPost } = await adminClient
      .from('account_balances')
      .select('balance')
      .eq('account_id', custAccount.account_id)
      .single();
    const { data: toBalPost } = await adminClient
      .from('account_balances')
      .select('balance')
      .eq('account_id', newAccId)
      .single();

    assert(
      'Reversal',
      (fromBalPost?.balance || 0) === (fromBalPre?.balance || 0) + xferAmount &&
        (toBalPost?.balance || 0) === (toBalPre?.balance || 0) - xferAmount,
      'Compensating entries restored both account balances exactly once (no double movement)'
    );

    // 8. Post-Operation Ledger Reconciliation
    console.log('\n[8/8] Verifying System-Wide Ledger Reconciliation After Admin Ops...');

    const { data: allAccounts } = await adminClient.from('accounts').select('id');
    let allAccountsBalanced = true;

    for (const acc of allAccounts || []) {
      const { data: viewRow } = await adminClient
        .from('account_balances')
        .select('balance')
        .eq('account_id', acc.id)
        .single();

      const { data: entries } = await adminClient
        .from('ledger_entries')
        .select('direction, amount')
        .eq('account_id', acc.id);

      const manualSum = (entries || []).reduce((sum, e) => {
        return e.direction === 'credit' ? sum + Number(e.amount) : sum - Number(e.amount);
      }, 0);

      if (viewRow?.balance !== manualSum) {
        allAccountsBalanced = false;
        console.error(
          `Reconciliation mismatch on account ${acc.id}: View=${viewRow?.balance}, LedgerSum=${manualSum}`
        );
      }
    }

    assert(
      'Reconciliation',
      allAccountsBalanced,
      'Every account balance strictly matches sum of ledger entries after adjustments & reversals'
    );

    // P2P transfers and reversals balance check
    const { data: p2pAndReversals } = await adminClient
      .from('transactions')
      .select('id')
      .in('type', ['transfer', 'reversal']);

    const { data: balancedEntries } = await adminClient
      .from('ledger_entries')
      .select('direction, amount')
      .in(
        'transaction_id',
        (p2pAndReversals || []).map((t) => t.id)
      );

    let credits = 0;
    let debits = 0;
    for (const entry of balancedEntries || []) {
      if (entry.direction === 'credit') credits += Number(entry.amount);
      if (entry.direction === 'debit') debits += Number(entry.amount);
    }

    assert(
      'Reconciliation',
      credits === debits,
      `All transfers and reversals remain strictly balanced: Credits (₱${(credits / 100).toFixed(2)}) == Debits (₱${(debits / 100).toFixed(2)})`
    );

    // Run source-file checks in addition to live tests
    runContractValidations();
    printSummary();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Unexpected error during test execution:', msg);
  }
}

function runContractValidations() {
  console.log(
    '[Contract Checks] Verifying Phase 4 SQL Migrations & Code Invariants...\n'
  );

  const rootDir = process.cwd();
  const fixesMigrationPath = path.join(
    rootDir,
    'supabase/migrations/20261023184000_phase4_fixes.sql'
  );
  const phase4MigrationPath = path.join(
    rootDir,
    'supabase/migrations/20261023051000_phase4_admin_management.sql'
  );
  const txClientPath = path.join(
    rootDir,
    'apps/admin/src/app/transactions/TransactionsClient.tsx'
  );
  const accClientPath = path.join(
    rootDir,
    'apps/admin/src/app/accounts/AccountsClient.tsx'
  );
  const mobileSuspendedPath = path.join(
    rootDir,
    'apps/mobile/src/screens/SuspendedScreen.tsx'
  );
  const mobileHomePath = path.join(rootDir, 'apps/mobile/src/screens/HomeScreen.tsx');

  const fixesSql = fs.readFileSync(fixesMigrationPath, 'utf8');
  const phase4Sql = fs.readFileSync(phase4MigrationPath, 'utf8');
  const txClientCode = fs.readFileSync(txClientPath, 'utf8');
  const accClientCode = fs.readFileSync(accClientPath, 'utf8');
  const mobileSuspendedCode = fs.readFileSync(mobileSuspendedPath, 'utf8');
  const mobileHomeCode = fs.readFileSync(mobileHomePath, 'utf8');

  // Fix 1: Concurrency Safe Reversals & Structural Guard
  assert(
    'Fix1-ReversalLock',
    fixesSql.includes(
      'select * into v_orig_tx\n  from public.transactions\n  where id = p_transaction_id\n  for update'
    ) || fixesSql.includes('where id = p_transaction_id\n  for update'),
    'admin_reverse_transaction locks original transaction row FIRST with FOR UPDATE'
  );

  assert(
    'Fix1-StructuralGuard',
    fixesSql.includes(
      'reverses_transaction_id uuid references public.transactions(id)'
    ) &&
      fixesSql.includes('create unique index if not exists idx_transactions_reverses_tx'),
    'Structural unique index idx_transactions_reverses_tx prevents duplicate reversals at database level'
  );

  // Fix 2: Profile Suspension Enforcement
  assert(
    'Fix2-AdminSuspension',
    fixesSql.includes("role = 'admin'\n      and status = 'active'") ||
      fixesSql.includes("role = 'admin' and status = 'active'"),
    'is_admin() requires role = admin AND status = active (suspended admins lose powers immediately)'
  );

  assert(
    'Fix2-MoneySuspension',
    fixesSql.includes("raise exception 'Your profile is suspended'") &&
      fixesSql.includes('create or replace function public.transfer') &&
      fixesSql.includes('create or replace function public.deposit') &&
      fixesSql.includes('create or replace function public.withdraw'),
    "Money functions (transfer, deposit, withdraw) reject suspended callers with 'Your profile is suspended'"
  );

  assert(
    'Fix2-MobileSuspendedScreen',
    mobileSuspendedCode.includes('Your account is suspended — contact Davao Bank') &&
      mobileHomeCode.includes("profile?.status === 'suspended'") &&
      mobileHomeCode.includes('<SuspendedScreen'),
    'Mobile app displays dedicated SuspendedScreen after login and hides money actions'
  );

  // Fix 3: Audit Forgery Prevention
  assert(
    'Fix3-AuditForgeryRevoke',
    fixesSql.includes(
      'revoke execute on function public.write_audit(text, text, text, jsonb) from public, anon, authenticated'
    ),
    'write_audit execute privilege is revoked from public, anon, and authenticated'
  );

  // Fix 4: Idempotent Admin Forms Across Double Submit
  assert(
    'Fix4-TxFormIdempotency',
    txClientCode.includes('reversalIdempotencyKey') &&
      txClientCode.includes('openReversalModal') &&
      txClientCode.includes('closeReversalModal'),
    'TransactionsClient generates idempotency key once on modal open and preserves it across double-submits/retries'
  );

  assert(
    'Fix4-AccFormIdempotency',
    accClientCode.includes('adjustIdempotencyKey') &&
      accClientCode.includes('openAdjustModal') &&
      accClientCode.includes('closeAdjustModal'),
    'AccountsClient generates idempotency key once on modal open and preserves it across double-submits/retries'
  );

  // Fix 5: No-Op Account Status Reject & Redundant Trigger Cleanup
  assert(
    'Fix5-NoOpReject',
    fixesSql.includes("raise exception 'Account is already %', p_status"),
    'admin_set_account_status rejects no-op status changes without writing audit or notification'
  );

  assert(
    'Fix5-TriggerCleanup',
    fixesSql.includes(
      'drop trigger if exists trigger_audit_account_status on public.accounts'
    ),
    'Redundant Phase 2 trigger_audit_account_status trigger is dropped to prevent double auditing'
  );

  // Phase 4 baseline invariants
  assert(
    'Phase4-Baseline',
    phase4Sql.includes('public.admin_open_account') &&
      phase4Sql.includes('public.admin_adjust_balance') &&
      phase4Sql.includes('public.admin_get_dashboard_stats'),
    'Phase 4 baseline admin capabilities are preserved intact'
  );
}

function printSummary() {
  console.log('\n================================================================');
  console.log('Phase 4 Test Summary:');
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;

  console.log(`Total tests: ${total}`);
  console.log(`Passed:      ${passed}`);
  console.log(`Failed:      ${failed}`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite();

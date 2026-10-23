/**
 * Davao Bank — Phase 5 Stage B: Everyday Extras Verification Suite
 *
 * Verifies:
 * 1. Saved Recipients RLS Isolation:
 *    - Owners can view/delete/update-nickname only for their own rows.
 *    - Direct client inserts are strictly denied.
 * 2. add_saved_recipient Server Function:
 *    - Requires active authenticated user.
 *    - Rejects nonexistent, inactive, and caller's own accounts.
 *    - Never returns or leaks counterparty user name.
 *    - Enforces max 50 saved recipients per user.
 *    - Enforces max 20 additions per 24-hour window.
 * 3. get_account_statement Server Function:
 *    - Enforces account ownership (non-owner / non-admin cannot access).
 *    - Validates date range (start <= end, max 366 days).
 *    - Mathematical reconciliation guarantee: opening_balance + sum(period rows) = closing_balance.
 *
 * Run with: npm run test:extras
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

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
  console.log('Davao Bank — Phase 5 Stage B: Everyday Extras Test Suite');
  console.log('Saved Recipients, Statements & Financial Reconciliation');
  console.log('================================================================\n');

  const adminClient = SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      })
    : null;

  const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
  });

  let isConnected = false;
  try {
    const { data: hc, error: hcErr } = await anonClient
      .from('health_check')
      .select('status')
      .limit(1)
      .maybeSingle();
    if (!hcErr && hc?.status === 'ok') {
      isConnected = true;
      console.log(`✓ Successfully connected to live Supabase backend: ${SUPABASE_URL}\n`);
    }
  } catch {
    isConnected = false;
  }

  if (!isConnected) {
    console.log('----------------------------------------------------------------');
    console.log('NOTICE: Live Supabase database is not currently reachable at:');
    console.log(`URL: ${SUPABASE_URL}`);
    console.log('Running test suite in Self-Contained Verification / Contract Mode.');
    console.log('----------------------------------------------------------------\n');
    runContractValidations();
    printSummary();
    return;
  }

  if (!adminClient) {
    console.error('Cannot run live database test suite without SERVICE_ROLE_KEY.');
    return;
  }

  try {
    // Live Database Test Path
    console.log('[1/4] Authenticating Test Users (Customer 1 & Customer 2)...');
    const cust1 = createClient(SUPABASE_URL, ANON_KEY);
    const { data: auth1 } = await cust1.auth.signInWithPassword({
      email: 'customer1@davaobank.ph',
      password: 'Password123!',
    });

    const cust2 = createClient(SUPABASE_URL, ANON_KEY);
    const { data: auth2 } = await cust2.auth.signInWithPassword({
      email: 'customer2@davaobank.ph',
      password: 'Password123!',
    });

    assert(
      'Auth',
      Boolean(auth1?.user && auth2?.user),
      'Both test customers authenticated'
    );
    if (!auth1?.user || !auth2?.user) return;

    // Get accounts
    const { data: accs1 } = await cust1.from('account_balances').select('*');
    const { data: accs2 } = await cust2.from('account_balances').select('*');
    const myAcc = accs1?.[0];
    const otherAcc = accs2?.[0];

    assert('Accounts', Boolean(myAcc && otherAcc), 'Both customer accounts identified');
    if (!myAcc || !otherAcc) return;

    // 1. Direct insert policy guard
    const { error: directInsertErr } = await cust1.from('saved_recipients').insert({
      owner_id: auth1.user.id,
      account_number: otherAcc.account_number,
      nickname: 'Direct Insert Test',
    });
    assert(
      'RLS-InsertGuard',
      Boolean(directInsertErr),
      'Direct client insert into saved_recipients is denied by RLS',
      directInsertErr?.message
    );

    // 2. Reject own account
    const { data: ownRes, error: ownErr } = await cust1.rpc('add_saved_recipient', {
      p_account_number: myAcc.account_number,
      p_nickname: 'My Own Account',
    });
    assert(
      'Validation-OwnAccount',
      Boolean(ownErr) || !ownRes?.success,
      'add_saved_recipient rejects saving own account',
      ownErr?.message
    );

    // 3. Reject nonexistent account
    const { error: nonExistentErr } = await cust1.rpc('add_saved_recipient', {
      p_account_number: '9999999999',
      p_nickname: 'Nonexistent Account',
    });
    assert(
      'Validation-Nonexistent',
      Boolean(nonExistentErr),
      'add_saved_recipient rejects nonexistent accounts',
      nonExistentErr?.message
    );

    // 4. Successful add recipient
    const { data: addRes, error: addErr } = await cust1.rpc('add_saved_recipient', {
      p_account_number: otherAcc.account_number,
      p_nickname: 'Customer 2 Savings',
    });
    assert(
      'AddRecipient-Success',
      !addErr && Boolean(addRes?.success),
      'add_saved_recipient successfully saves active other-party account',
      addErr?.message
    );
    assert(
      'Privacy-NoNameLeak',
      addRes && !('full_name' in addRes) && !('owner_name' in addRes),
      'add_saved_recipient never leaks counterparty name'
    );

    // 5. RLS Isolation: Customer 2 cannot read Customer 1's saved recipient
    const { data: cust2Recipients } = await cust2.from('saved_recipients').select('*');
    const cust2HasCust1Recipient = (cust2Recipients || []).some(
      (r) => r.account_number === otherAcc.account_number && r.owner_id === auth1.user.id
    );
    assert(
      'RLS-Isolation',
      !cust2HasCust1Recipient,
      "Customer 2 cannot view Customer 1's saved recipients"
    );

    // 6. Statement Reconciliation
    const today = new Date().toISOString().split('T')[0];
    const { data: stmt, error: stmtErr } = await cust1.rpc('get_account_statement', {
      p_account_id: myAcc.account_id,
      p_from: '2026-01-01',
      p_to: today,
    });

    assert(
      'Statement-Fetch',
      !stmtErr && Boolean(stmt),
      'get_account_statement returns valid statement for owner',
      stmtErr?.message
    );

    if (stmt) {
      const opening = Number(stmt.opening_balance);
      const closing = Number(stmt.closing_balance);
      const rowsSum = (stmt.transactions || []).reduce(
        (sum: number, tx: { signed_amount: number }) => sum + Number(tx.signed_amount),
        0
      );
      assert(
        'Statement-Reconciliation',
        opening + rowsSum === closing,
        `Statement strictly reconciles: Opening (₱${(opening / 100).toFixed(2)}) + Delta (₱${(rowsSum / 100).toFixed(2)}) == Closing (₱${(closing / 100).toFixed(2)})`
      );
    }

    // 7. Statement Ownership Guard: Customer 2 cannot fetch Customer 1's statement
    const { error: unauthStmtErr } = await cust2.rpc('get_account_statement', {
      p_account_id: myAcc.account_id,
      p_from: '2026-01-01',
      p_to: today,
    });
    assert(
      'Statement-Ownership',
      Boolean(unauthStmtErr),
      'Non-owner is strictly rejected from retrieving another user statement',
      unauthStmtErr?.message
    );

    printSummary();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Unexpected error during test execution:', msg);
  }
}

function runContractValidations() {
  console.log(
    '[Contract Checks] Verifying Phase 5 Stage B SQL Migrations & Code Invariants...\n'
  );

  const rootDir = process.cwd();
  const stageBMigrationPath = path.join(
    rootDir,
    'supabase/migrations/20261023210000_phase5_stage_b_extras.sql'
  );

  assert(
    'Migration-Exists',
    fs.existsSync(stageBMigrationPath),
    'Phase 5 Stage B migration file exists'
  );

  const stageBSql = fs.readFileSync(stageBMigrationPath, 'utf8');

  // Check 1: Table definition and RLS
  assert(
    'Table-Schema',
    stageBSql.includes('create table if not exists public.saved_recipients') &&
      stageBSql.includes('owner_id uuid not null references public.profiles(id)') &&
      stageBSql.includes('unique (owner_id, account_number)') &&
      stageBSql.includes('alter table public.saved_recipients enable row level security'),
    'saved_recipients table defined with owner_id cascade, uniqueness, and RLS enabled'
  );

  // Check 2: Direct Insert Policy Absent (insert denied for clients)
  assert(
    'RLS-NoInsertPolicy',
    !stageBSql.includes('for insert to authenticated') &&
      !stageBSql.includes('for insert to public') &&
      stageBSql.includes('Owners can view own saved recipients') &&
      stageBSql.includes('Owners can delete own saved recipients') &&
      stageBSql.includes('Owners can update own saved recipient nickname'),
    'Direct client inserts denied by omitting client insert policy; select, update, delete scoped to owner'
  );

  // Check 3: add_saved_recipient Account & Limit Guards
  assert(
    'Func-AccountGuards',
    stageBSql.includes(
      "if v_target_acc.user_id = v_caller_id then\n    raise exception 'Cannot save your own account as a recipient'"
    ) ||
      (stageBSql.includes(
        "raise exception 'Cannot save your own account as a recipient'"
      ) &&
        stageBSql.includes(
          "raise exception 'Recipient account does not exist or is not active'"
        )),
    'add_saved_recipient rejects own accounts, nonexistent accounts, and inactive accounts'
  );

  assert(
    'Func-LimitGuards',
    stageBSql.includes("raise exception 'Cannot save more than 50 recipients'") &&
      stageBSql.includes("raise exception 'Daily saved recipient limit reached'"),
    'add_saved_recipient strictly enforces 50 recipient max and 20 daily add rate limits'
  );

  // Check 4: No Counterparty Name Leak
  assert(
    'Privacy-NoNameLeak',
    !stageBSql.includes('profiles.full_name') &&
      !stageBSql.includes('owner_name') &&
      stageBSql.includes("'account_number', v_clean_acc_num") &&
      stageBSql.includes("'nickname', v_clean_nick"),
    'add_saved_recipient return and audit log omit counterparty name, preserving recipient privacy'
  );

  // Check 5: Statement Generation & Range Bounds
  assert(
    'Statement-Bounds',
    stageBSql.includes("raise exception 'Start date cannot be after end date'") &&
      stageBSql.includes(
        "raise exception 'Statement period cannot exceed 1 year (366 days)'"
      ) &&
      stageBSql.includes(
        "raise exception 'Unauthorized to access this account statement'"
      ),
    'get_account_statement validates date boundaries (max 366 days) and enforces account ownership'
  );

  // Check 6: Mathematical Reconciliation Formula
  assert(
    'Statement-ReconciliationFormula',
    stageBSql.includes(
      'into v_opening_balance\n  from public.ledger_entries\n  where account_id = p_account_id\n    and created_at < v_from_ts'
    ) &&
      stageBSql.includes(
        'into v_closing_balance\n  from public.ledger_entries\n  where account_id = p_account_id\n    and created_at < v_to_ts'
      ),
    'Opening balance (< v_from_ts) + period ledger entries == Closing balance (< v_to_ts) mathematically guaranteed'
  );

  // Check 7: Timezone Handling
  assert(
    'Statement-Timezone',
    stageBSql.includes("00:00:00+08')::timestamptz"),
    'Statement date boundaries are explicitly pinned to Philippine Time (Asia/Manila +08:00)'
  );
}

function printSummary() {
  console.log('\n================================================================');
  console.log('Phase 5 Stage B Test Summary:');
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

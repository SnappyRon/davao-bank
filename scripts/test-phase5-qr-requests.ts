import {
  signInWithStepUp,
  withStepUpCleanup,
  requireStepUpMigration,
} from './lib/step-up';
/**
 * Davao Bank — Phase 5 Stage D: QR Send & Request Money Test Suite
 * Validates QR encoding/parsing, payment requests lifecycle, run-once locks,
 * authorization guards, privacy safeguards, and ledger reconciliation.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import {
  generateDavaoBankQRPayload,
  parseDavaoBankQRPayload,
  MAX_QR_AMOUNT_CENTAVOS,
  MAX_QR_NOTE_LENGTH,
} from '../packages/shared/src/utils/qr';

try {
  // @ts-expect-error Node.js 20+ built-in
  process.loadEnvFile?.('.env');
} catch {
  // .env is optional
}

const TEST_PASSWORD = process.env.SEED_PASSWORD || process.env.E2E_PASSWORD;
if (!TEST_PASSWORD) {
  console.error(
    'NOT VERIFIED — set SEED_PASSWORD or E2E_PASSWORD for authenticated live checks.'
  );
  throw new Error('Live suite failed; see checks above.');
}

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'http://127.0.0.1:54321';

const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  'placeholder-anon-key';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ [PASS] ${message}`);
  } else {
    failedTests++;
    console.error(`  ✗ [FAIL] ${message}`);
  }
}

async function runStageDTests() {
  await requireStepUpMigration(
    createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
  );
  console.log('================================================================');
  console.log('Davao Bank — Phase 5 Stage D: QR Send & Request Money Test Suite');
  console.log('QR Code Standard, Payment Requests, Run-Once & Privacy Guards');
  console.log('================================================================\n');

  // Check live database connectivity
  const host = new URL(SUPABASE_URL).host;
  const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
  });

  let liveConnected = false;
  try {
    const { error: hcErr } = await anonClient
      .from('payment_requests')
      .select('id')
      .limit(1);
    if (!hcErr) {
      liveConnected = true;
      console.log(`Database host: ${host}`);
      console.log('✓ Connected to live database\n');
    }
  } catch {
    liveConnected = false;
  }

  if (!liveConnected) {
    console.error(`NOT VERIFIED — database unreachable (${host})`);
    throw new Error('Live suite failed; see checks above.');
  }

  // ----------------------------------------------------------------------------
  // SECTION 1: Live Verification Checks
  // ----------------------------------------------------------------------------
  console.log('[Live Checks] Authenticating Customer 1 & Customer 2...');
  const cust1 = createClient(SUPABASE_URL, ANON_KEY);
  const { data: auth1, error: a1Err } = await signInWithStepUp(cust1, {
    email: 'customer1@davaobank.ph',
    password: TEST_PASSWORD,
  });

  const cust2 = createClient(SUPABASE_URL, ANON_KEY);
  const { data: auth2, error: a2Err } = await signInWithStepUp(cust2, {
    email: 'customer2@davaobank.ph',
    password: TEST_PASSWORD,
  });

  assert(!a1Err && Boolean(auth1?.user), '[Live-Auth] Customer 1 signed in');
  assert(!a2Err && Boolean(auth2?.user), '[Live-Auth] Customer 2 signed in');

  if (auth1?.user && auth2?.user) {
    const { data: c1Accounts } = await cust1
      .from('accounts')
      .select('id, account_number')
      .limit(1);
    const { data: c2Accounts } = await cust2
      .from('accounts')
      .select('id, account_number')
      .limit(1);

    const c1Acc = c1Accounts?.[0];
    const c2Acc = c2Accounts?.[0];

    assert(Boolean(c1Acc && c2Acc), '[Live-Accounts] Retrieved test customer accounts');

    if (c1Acc && c2Acc) {
      // Ensure payer has funds to pay the request
      const { error: depErr } = await cust2.rpc('deposit', {
        p_account: c2Acc.id,
        p_amount: 500000,
        p_idempotency_key: crypto.randomUUID(),
        p_reference: 'Test fund for payment request',
      });
      if (depErr) {
        console.error('Failed to fund payer for test:', depErr);
      }

      // 1. Create payment request
      const { data: createData, error: createErr } = await cust1.rpc(
        'create_payment_request',
        {
          p_amount: 250000,
          p_requester_account: c1Acc.id,
          p_note: 'Durian split',
          p_payer_account_number: c2Acc.account_number,
        }
      );

      assert(
        !createErr && Boolean(createData?.id),
        `[Live-CreateRequest] Payment request created successfully (${createData?.id})`
      );

      const reqId = createData?.id;

      // 2. Requester cannot pay own request
      const { error: ownPayErr } = await cust1.rpc('pay_payment_request', {
        p_request_id: reqId,
        p_from_account: c1Acc.id,
        p_idempotency_key: crypto.randomUUID(),
      });
      assert(Boolean(ownPayErr), '[Live-Guard] Requester cannot pay own payment request');

      // 3. Payer pays request with idempotency key
      const payIdempotencyKey = crypto.randomUUID();
      const { data: payData, error: payErr } = await cust2.rpc('pay_payment_request', {
        p_request_id: reqId,
        p_from_account: c2Acc.id,
        p_idempotency_key: payIdempotencyKey,
      });

      assert(
        !payErr && payData?.success === true && Boolean(payData?.transaction_id),
        `[Live-PayRequest] Payer paid request with linked transaction_id (${payData?.transaction_id || (payErr ? payErr.message : JSON.stringify(payData))})`
      );

      // 4. Idempotent retry on same key succeeds
      const { data: retryData, error: retryErr } = await cust2.rpc(
        'pay_payment_request',
        {
          p_request_id: reqId,
          p_from_account: c2Acc.id,
          p_idempotency_key: payIdempotencyKey,
        }
      );
      assert(
        !retryErr &&
          retryData?.success === true &&
          retryData?.idempotent_replay === true &&
          retryData?.transaction_id === payData?.transaction_id,
        '[Live-Idempotency] Same idempotency key replay returns existing transaction_id'
      );

      // 5. Second payment on different key rejected
      const { error: secondPayErr } = await cust2.rpc('pay_payment_request', {
        p_request_id: reqId,
        p_from_account: c2Acc.id,
        p_idempotency_key: crypto.randomUUID(),
      });
      assert(
        Boolean(secondPayErr),
        '[Live-RunOnce] Re-paying already paid request with new key rejected'
      );

      // 6. Direct client insert rejected by RLS
      const { error: directInsertErr } = await cust1.from('payment_requests').insert({
        requester_id: auth1.user.id,
        requester_account_id: c1Acc.id,
        amount: 10000,
        status: 'pending',
      } as any);
      assert(
        Boolean(directInsertErr),
        '[Live-RLS-Insert] Direct insert into payment_requests denied by RLS'
      );
    }
  }

  // ----------------------------------------------------------------------------
  // SECTION 2: QR Payload Unit Tests (§D.1)
  // ----------------------------------------------------------------------------
  console.log('\n[Unit Tests] Validating Davao Bank QR Format and Strict Parsing...');

  // 2.1 Valid QR generation and parsing
  const validAcct = '1012345678';
  const validAmt = 250000; // PHP 2,500.00
  const validNote = 'Durian feast split';

  const qrUri = generateDavaoBankQRPayload({
    accountNumber: validAcct,
    amountCentavos: validAmt,
    note: validNote,
  });

  assert(
    qrUri.startsWith('davaobank://pay?v=1&acct=1012345678&amt=250000'),
    `[QR-Encode] Encodes standard davaobank://pay URI format (${qrUri})`
  );

  const parsed = parseDavaoBankQRPayload(qrUri);
  assert(
    parsed.valid === true &&
      parsed.accountNumber === validAcct &&
      parsed.amountCentavos === validAmt &&
      parsed.note === validNote,
    '[QR-Parse-Valid] Correctly extracts account number, centavos amount, and note'
  );

  // 2.2 Minimal QR (account number only, no amount or note)
  const minimalUri = generateDavaoBankQRPayload({ accountNumber: validAcct });
  const parsedMinimal = parseDavaoBankQRPayload(minimalUri);
  assert(
    parsedMinimal.valid === true &&
      parsedMinimal.accountNumber === validAcct &&
      parsedMinimal.amountCentavos === undefined &&
      parsedMinimal.note === undefined,
    '[QR-Parse-Minimal] Handles minimal QR payload with account number only'
  );

  // 2.3 Rejection of foreign / other schemes
  const foreignSchemes = [
    'https://example.com/pay?acct=1012345678',
    'gcash://pay?acct=1012345678',
    'maya://send?acct=1012345678',
    'qrph://000201010211...',
    'random_string_not_a_url',
  ];

  let foreignRejected = true;
  for (const uri of foreignSchemes) {
    const res = parseDavaoBankQRPayload(uri);
    if (res.valid || res.error !== "This isn't a Davao Bank QR code") {
      foreignRejected = false;
      break;
    }
  }
  assert(
    foreignRejected,
    '[QR-Reject-Foreign] Rejects non-davaobank schemes with exact copy: "This isn\'t a Davao Bank QR code"'
  );

  // 2.4 Rejection of malformed version
  const badVersionUri = 'davaobank://pay?v=2&acct=1012345678';
  const resBadVer = parseDavaoBankQRPayload(badVersionUri);
  assert(
    !resBadVer.valid,
    '[QR-Reject-Version] Rejects unrecognized version number (v=2)'
  );

  // 2.5 Rejection of malformed account numbers
  const badAccounts = [
    'davaobank://pay?v=1&acct=12345',
    'davaobank://pay?v=1&acct=101234567899',
    'davaobank://pay?v=1&acct=101234567A',
    'davaobank://pay?v=1',
  ];
  let badAccountsRejected = true;
  for (const uri of badAccounts) {
    const res = parseDavaoBankQRPayload(uri);
    if (res.valid) {
      badAccountsRejected = false;
      break;
    }
  }
  assert(
    badAccountsRejected,
    '[QR-Reject-Account] Strictly requires exactly 10 numeric digits for account number'
  );

  // 2.6 Rejection of invalid, negative, zero, float, or over-limit amounts
  const badAmounts = [
    'davaobank://pay?v=1&acct=1012345678&amt=-500',
    'davaobank://pay?v=1&acct=1012345678&amt=0',
    'davaobank://pay?v=1&acct=1012345678&amt=100.50',
    `davaobank://pay?v=1&acct=1012345678&amt=${MAX_QR_AMOUNT_CENTAVOS + 100}`,
  ];
  let badAmountsRejected = true;
  for (const uri of badAmounts) {
    const res = parseDavaoBankQRPayload(uri);
    if (res.valid) {
      badAmountsRejected = false;
      break;
    }
  }
  assert(
    badAmountsRejected,
    '[QR-Reject-Amount] Rejects negative, zero, float, or excessive amounts exceeding transfer cap'
  );

  // 2.7 Note length boundary check (max 60 chars)
  const longNote = 'A'.repeat(MAX_QR_NOTE_LENGTH + 1);
  const badNoteUri = `davaobank://pay?v=1&acct=1012345678&note=${longNote}`;
  const resLongNote = parseDavaoBankQRPayload(badNoteUri);
  assert(
    !resLongNote.valid,
    '[QR-Reject-Note] Rejects note exceeding 60 character maximum'
  );

  // ----------------------------------------------------------------------------
  // SECTION 3: SQL Migration & Contract Checks (§D.3)
  // ----------------------------------------------------------------------------
  console.log(
    '\n[Contract Checks] Verifying Phase 5 Stage D SQL Migrations & Code Invariants...'
  );

  const migrationPath = path.resolve(
    __dirname,
    '../supabase/migrations/20261024090000_phase5_stage_d_qr_requests.sql'
  );
  assert(
    fs.existsSync(migrationPath),
    '[Migration-Exists] Stage D migration file exists (20261024090000_phase5_stage_d_qr_requests.sql)'
  );

  const migrationSql = fs.readFileSync(migrationPath, 'utf8');

  // 3.1 Schema validation
  assert(
    migrationSql.includes('create table if not exists public.payment_requests') &&
      migrationSql.includes(
        "status in ('pending', 'paid', 'declined', 'cancelled', 'expired')"
      ) &&
      migrationSql.includes(
        "expires_at timestamptz not null default (now() + interval '7 days')"
      ),
    '[Schema-RequestsTable] payment_requests table defined with status states and 7-day default expiration'
  );

  // 3.2 RLS validation
  assert(
    migrationSql.includes(
      'alter table public.payment_requests enable row level security;'
    ) &&
      migrationSql.includes('requester_id = auth.uid()') &&
      migrationSql.includes('payer_user_id = auth.uid()') &&
      migrationSql.includes('public.is_admin()') &&
      !migrationSql.includes('create policy "payment_requests_insert'),
    '[RLS-NoDirectWrites] payment_requests read scoped to requester, payer, and admin; client direct writes strictly omitted'
  );

  // 3.3 Creation guards
  assert(
    migrationSql.includes('Cannot request money from your own account') &&
      migrationSql.includes(
        'Daily payment request limit reached (maximum 10 requests per day)'
      ) &&
      migrationSql.includes("status <> 'active'") &&
      migrationSql.includes('char_length(v_clean_note) > 60'),
    '[Func-CreateGuards] create_payment_request rejects self-requests, enforces active profile/account, and caps at 10/day'
  );

  // 3.4 Atomic payment & run-once lock
  assert(
    migrationSql.includes('for update') &&
      migrationSql.includes("v_req.status <> 'pending'") &&
      migrationSql.includes('public._transfer_core(') &&
      migrationSql.includes("set status = 'paid'"),
    '[Func-PayRunOnce] pay_payment_request locks row FOR UPDATE, prevents re-paying, and updates status in same atomic transaction'
  );

  // 3.5 Privacy protection
  assert(
    migrationSql.includes("'payer_account', v_clean_payer_acc_num") &&
      migrationSql.includes("'requester_account', v_req_acc.account_number") &&
      !migrationSql.includes('profiles.full_name') &&
      !migrationSql.includes('v_caller_profile.full_name'),
    '[Privacy-NoNameLeak] Payment request notifications and audits reference only account numbers, never leaking customer names'
  );

  // 3.6 Revocation of internal batch jobs
  assert(
    migrationSql.includes(
      'revoke all on function public.expire_due_payment_requests() from public, anon, authenticated;'
    ),
    '[Security-RevokeBatch] expire_due_payment_requests is strictly revoked from public, anon, and authenticated clients'
  );

  // ----------------------------------------------------------------------------
  // Summary
  // ----------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log('Phase 5 Stage D Test Summary:');
  console.log(`Total tests: ${totalTests}`);
  console.log(`Passed:      ${passedTests}`);
  console.log(`Failed:      ${failedTests}`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    throw new Error('Live suite failed; see checks above.');
  }
}

withStepUpCleanup(runStageDTests).catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});

/**
 * Davao Bank — Phase 8H Bantay live suite (manual, hosted only).
 *
 * Runs the frozen 8D contract end to end: high-risk payment -> challenge ->
 * confirmation -> successful transfer, account lock -> blocked money calls ->
 * staff unlock, and customer/RLS isolation. It never installs a test-only
 * guard bypass and never shortens the one-hour unlock window.
 *
 * Exit codes:
 *   0 = PASS (all checks passed)
 *   1 = FAIL (an assertion failed, or an unexpected error occurred)
 *   2 = NOT VERIFIED (preconditions absent; no check was skipped as a pass)
 *
 * Run with: npm run test:bantay
 * .env is loaded by the npm script, never by this file.
 */

import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import {
  requireStepUpMigration,
  temporaryStepUp,
  withStepUpCleanup,
} from './lib/step-up.ts';

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
const TEST_PASSWORD = process.env.SEED_PASSWORD || process.env.E2E_PASSWORD || '';
const CUSTOMER1 = 'customer1@davaobank.ph';
const CUSTOMER2 = 'customer2@davaobank.ph';
const ADMIN = 'admin@davaobank.ph';
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
// > ₱10,000 so the "no 5-payment baseline" branch of the score still adds 30.
const HIGH_RISK_AMOUNT = 1_200_000;

class NotVerified extends Error {}

function notVerified(message) {
  throw new NotVerified(`NOT VERIFIED — ${message}`);
}

function asNotVerified(error) {
  const raw = String(error?.message || error);
  if (raw.startsWith('NOT VERIFIED — ')) return new NotVerified(raw);
  return null;
}

const results = [];
function assert(title, condition, detail) {
  const passed = Boolean(condition);
  results.push({ title, passed });
  console.log(
    `  ${passed ? '✓ PASS' : '✗ FAIL'}: ${title}${detail ? ` (${detail})` : ''}`
  );
  return passed;
}

function codeOf(error) {
  return error?.code || 'unexpected-error';
}

function messageMatches(error, text) {
  return Boolean(error?.message && String(error.message).includes(text));
}

function makeClient() {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
}

async function signIn(client, email, label) {
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (error || !data.user) notVerified(`${label} sign-in failed (${codeOf(error)})`);
  return data.user;
}

/** Never touch a pre-existing authenticator; stop instead. */
async function assertNoRealAuthenticator(client, label) {
  const { data, error } = await client.auth.mfa.listFactors();
  if (error)
    notVerified(`could not inspect ${label} authenticator factors (${codeOf(error)})`);
  if (data.totp.some((factor) => factor.status === 'verified')) {
    notVerified(
      `${label} has a real authenticator. Use dedicated test accounts or remove it in Two-step verification.`
    );
  }
}

async function requireBantayDeployment(probe) {
  const probes = [
    ['get_security_timeline', () => probe.rpc('get_security_timeline', { p_limit: 1 })],
    [
      'prepare_risk_challenge',
      () =>
        probe.rpc('prepare_risk_challenge', {
          p_to_account: ZERO_UUID,
          p_amount: 1,
          p_idempotency_key: 'deployment-probe',
        }),
    ],
    [
      'confirm_risky_payment',
      () => probe.rpc('confirm_risky_payment', { p_idempotency_key: 'deployment-probe' }),
    ],
    ['lock_my_account', () => probe.rpc('lock_my_account')],
    [
      'admin_unlock_user',
      () =>
        probe.rpc('admin_unlock_user', {
          p_user_id: ZERO_UUID,
          p_note: 'deployment-probe',
        }),
    ],
    ['get_security_settings', () => probe.rpc('get_security_settings')],
  ];
  for (const [name, call] of probes) {
    const { error } = await call();
    // PGRST202 = function absent from the PostgREST schema cache. Every other
    // error is expected here: the probes are anon and never write state.
    if (error?.code === 'PGRST202') {
      notVerified(`Phase 8D migration is not deployed (${name} is missing)`);
    }
  }
  const { error: tableError } = await probe.from('security_events').select('id').limit(0);
  if (tableError && ['42P01', 'PGRST205'].includes(tableError.code)) {
    notVerified('Phase 8D migration is not deployed (security_events is missing)');
  }
  try {
    await requireStepUpMigration(probe);
  } catch (error) {
    throw asNotVerified(error) || error;
  }
}

async function fetchActiveAccount(client, user) {
  const { data: accounts, error } = await client
    .from('accounts')
    .select('id, account_number')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1);
  if (error || !accounts?.[0]) return null;
  const { data: balance } = await client
    .from('account_balances')
    .select('balance')
    .eq('account_id', accounts[0].id)
    .maybeSingle();
  return { ...accounts[0], balance: Number(balance?.balance || 0) };
}

async function runSuite() {
  if (!SUPABASE_URL || !ANON_KEY) {
    notVerified(
      'live credentials are not configured (SUPABASE_URL and an anon key are required).'
    );
  }
  if (!TEST_PASSWORD) {
    notVerified('set SEED_PASSWORD or E2E_PASSWORD for authenticated live checks.');
  }

  const probe = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const host = new URL(SUPABASE_URL).host;
  const { error: healthError } = await probe
    .from('health_check')
    .select('status')
    .limit(1)
    .maybeSingle();
  if (healthError) notVerified(`database unreachable (${host})`);
  console.log('================================================================');
  console.log('Davao Bank — Phase 8H: Bantay live verification suite');
  console.log(`Database host: ${host}`);
  console.log('================================================================\n');

  await requireBantayDeployment(probe);

  const customer1 = makeClient();
  const customer2 = makeClient();
  const adminClient = makeClient();
  const aal1Customer = makeClient();

  console.log('[1/5] Checking demo accounts and authenticators...');
  const user1 = await signIn(customer1, CUSTOMER1, 'customer1');
  await assertNoRealAuthenticator(customer1, 'customer1');
  const user2 = await signIn(customer2, CUSTOMER2, 'customer2');
  await signIn(adminClient, ADMIN, 'admin');
  await assertNoRealAuthenticator(adminClient, 'admin');
  await signIn(aal1Customer, CUSTOMER1, 'aal1 customer1');

  const from = await fetchActiveAccount(customer1, user1);
  const to = await fetchActiveAccount(customer2, user2);
  if (!from || !to)
    notVerified('demo customers need an active account; run npm run seed first.');
  if (from.balance < HIGH_RISK_AMOUNT + 100_000) {
    notVerified('customer1 balance is too low for the ₱12,000.00 high-risk check.');
  }

  const { data: baseline, error: settingsError } = await customer1.rpc(
    'get_security_settings'
  );
  if (settingsError || !baseline || typeof baseline !== 'object') {
    notVerified(`get_security_settings is unavailable (${codeOf(settingsError)})`);
  }
  if (baseline.locked)
    notVerified('customer1 was already locked before the suite started.');
  if (Number(baseline.remaining_today_centavos || 0) < HIGH_RISK_AMOUNT) {
    notVerified(
      'customer1 has too little daily limit remaining for the high-risk check.'
    );
  }
  console.log('  ✓ Demo accounts, balances and daily limit are usable\n');

  console.log('[2/5] Creating a challenge and confirming a high-risk payment...');
  await withStepUpCleanup(async () => {
    await temporaryStepUp(customer1, { email: CUSTOMER1, password: TEST_PASSWORD });
    await temporaryStepUp(adminClient, { email: ADMIN, password: TEST_PASSWORD });

    const key = `bantay-live-${randomUUID()}`;
    const installId = `bantay-live-${randomUUID()}`;
    const { data: device, error: deviceError } = await customer1.rpc('register_device', {
      p_install_id: installId,
      p_label: 'Bantay live suite',
    });
    assert(
      'register_device links the current session and reports a new device',
      !deviceError && device?.new_device === true,
      codeOf(deviceError)
    );

    const { data: prepared, error: prepareError } = await customer1.rpc(
      'prepare_risk_challenge',
      { p_to_account: to.id, p_amount: HIGH_RISK_AMOUNT, p_idempotency_key: key }
    );
    if (prepareError) {
      assert(
        'prepare_risk_challenge returns a scored result',
        false,
        codeOf(prepareError)
      );
      return;
    }
    if (prepared.challenge_required !== true || Number(prepared.score) < 70) {
      notVerified(
        `demo accounts produced a score of ${prepared.score} (below 70); no challenge was raised`
      );
    }
    assert(
      'new payee, large amount and new device score 70 or more',
      prepared.challenge_required === true && Number(prepared.score) >= 70
    );

    const transferArgs = {
      p_from_account: from.id,
      p_to_account: to.id,
      p_amount: HIGH_RISK_AMOUNT,
      p_idempotency_key: key,
      p_reference: 'Bantay live suite',
    };
    const { error: beforeError } = await customer1.rpc('transfer', transferArgs);
    assert(
      'transfer raises Confirmation required before any money is written',
      messageMatches(beforeError, 'Confirmation required'),
      codeOf(beforeError)
    );
    const { data: beforeRows } = await customer1
      .from('transactions')
      .select('id')
      .eq('idempotency_key', key);
    assert('no transaction exists before confirmation', beforeRows?.length === 0);

    const { error: aal1ConfirmError } = await aal1Customer.rpc('confirm_risky_payment', {
      p_idempotency_key: key,
    });
    assert(
      'confirm_risky_payment rejects an aal1 session',
      Boolean(aal1ConfirmError) &&
        /STEP_UP|insufficient_aal/i.test(String(aal1ConfirmError.message)),
      codeOf(aal1ConfirmError)
    );

    const { data: timelineBefore } = await customer1.rpc('get_security_timeline', {
      p_limit: 50,
    });
    assert(
      'timeline records risky_payment_challenged for this key',
      Array.isArray(timelineBefore) &&
        timelineBefore.some(
          (event) =>
            event.kind === 'risky_payment_challenged' &&
            event.facts?.idempotency_key === key
        )
    );

    const { data: confirmed, error: confirmError } = await customer1.rpc(
      'confirm_risky_payment',
      { p_idempotency_key: key }
    );
    assert(
      'aal2 confirm_risky_payment accepts the challenge',
      !confirmError && confirmed?.ok === true,
      codeOf(confirmError)
    );

    const { data: transfer, error: transferError } = await customer1.rpc(
      'transfer',
      transferArgs
    );
    assert(
      'same key succeeds once after confirmation',
      !transferError && transfer?.status === 'completed',
      codeOf(transferError)
    );
    const { data: replay, error: replayError } = await customer1.rpc(
      'transfer',
      transferArgs
    );
    assert(
      'replaying the key returns the original transaction without a second debit',
      !replayError && replay?.id === transfer?.id && replay?.idempotent_replay === true,
      codeOf(replayError)
    );

    console.log('\n[3/5] Locking and unlocking through the staff RPC...');
    const { data: locked, error: lockError } = await aal1Customer.rpc('lock_my_account');
    assert(
      'lock_my_account works with an aal1 session',
      !lockError && locked?.ok === true,
      codeOf(lockError)
    );
    const { data: lockedSettings } = await customer1.rpc('get_security_settings');
    assert('security settings report the lock', lockedSettings?.locked === true);

    const { error: blockedTransfer } = await customer1.rpc('transfer', {
      ...transferArgs,
      p_idempotency_key: `bantay-locked-${randomUUID()}`,
    });
    assert(
      'transfer is blocked while locked',
      messageMatches(blockedTransfer, 'Account locked'),
      codeOf(blockedTransfer)
    );
    const { error: blockedWithdraw } = await customer1.rpc('withdraw', {
      p_account: from.id,
      p_amount: 100_000,
      p_idempotency_key: `bantay-locked-wd-${randomUUID()}`,
    });
    assert(
      'withdraw is blocked while locked',
      messageMatches(blockedWithdraw, 'Account locked'),
      codeOf(blockedWithdraw)
    );

    const { data: requested, error: requestError } =
      await customer1.rpc('request_unlock');
    assert(
      'request_unlock sets the one-hour wait with aal2',
      !requestError && Boolean(requested?.unlock_after),
      codeOf(requestError)
    );
    const { error: earlyError } = await customer1.rpc('complete_unlock');
    assert(
      'complete_unlock refuses to shorten the one-hour wait',
      messageMatches(earlyError, 'Unlock not available yet'),
      codeOf(earlyError)
    );
    const { data: staffUnlock, error: staffError } = await adminClient.rpc(
      'admin_unlock_user',
      {
        p_user_id: user1.id,
        p_note: 'Bantay live suite',
      }
    );
    assert(
      'admin_unlock_user releases the lock without a test-only bypass',
      !staffError && staffUnlock?.ok === true,
      codeOf(staffError)
    );
    const { data: unlockedSettings } = await customer1.rpc('get_security_settings');
    assert(
      'security settings report the account unlocked',
      unlockedSettings?.locked === false
    );
    const { data: timelineAfter } = await customer1.rpc('get_security_timeline', {
      p_limit: 50,
    });
    assert(
      'timeline records account_locked and staff account_unlocked',
      Array.isArray(timelineAfter) &&
        timelineAfter.some((event) => event.kind === 'account_locked') &&
        timelineAfter.some(
          (event) => event.kind === 'account_unlocked' && event.facts?.method === 'staff'
        )
    );

    console.log('\n[4/5] Checking customer RLS isolation...');
    await customer2.rpc('register_device', {
      p_install_id: `bantay-other-${randomUUID()}`,
      p_label: 'Bantay RLS probe',
    });
    const { data: otherTimeline } = await customer2.rpc('get_security_timeline', {
      p_limit: 20,
    });
    const otherEventId = otherTimeline?.find((event) => event.kind === 'new_device')?.id;
    assert(
      'customer2 has a timeline event for the isolation probe',
      Boolean(otherEventId)
    );
    if (otherEventId) {
      const { data: leaked } = await customer1
        .from('security_events')
        .select('id')
        .eq('id', otherEventId);
      assert('customer1 cannot read customer2 security events', leaked?.length === 0);
    }
    const { error: insertError } = await customer1.from('security_events').insert({
      kind: 'account_locked',
      severity: 'high',
      facts: {},
    });
    assert('customer1 cannot insert security events directly', Boolean(insertError));
    const { error: limitWriteError } = await customer1
      .from('security_limits')
      .update({ locked_at: null })
      .eq('user_id', user1.id);
    assert('customer1 cannot edit security_limits directly', Boolean(limitWriteError));
    const { error: customerAdminError } = await customer1.rpc('admin_unlock_user', {
      p_user_id: user2.id,
      p_note: 'Bantay RLS probe',
    });
    assert('customer1 cannot call admin_unlock_user', Boolean(customerAdminError));
    const { data: anonEvents } = await probe
      .from('security_events')
      .select('id')
      .limit(1);
    assert('anon cannot read security events', anonEvents?.length === 0);

    console.log('\n[5/5] Temporary authenticators will now be removed...\n');
  });
}

async function main() {
  try {
    await runSuite();
    const failed = results.filter((result) => !result.passed);
    console.log(`Checks: ${results.length - failed.length}/${results.length} passed.`);
    if (failed.length) {
      console.error(`FAIL — ${failed.length} check(s) failed; no pass recorded.`);
      process.exitCode = 1;
    }
  } catch (error) {
    const notVerifiedError = error instanceof NotVerified ? error : asNotVerified(error);
    if (notVerifiedError) {
      console.error(notVerifiedError.message);
      console.error('Suite stopped; no check was skipped as a pass.');
      process.exitCode = 2;
      return;
    }
    console.error(`FAIL — unexpected error (${codeOf(error)}).`);
    process.exitCode = 1;
  }
}

await main();

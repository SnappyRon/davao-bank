import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { TOTP } from 'otpauth';

type Credentials = { email: string; password: string };
type Fixture = {
  client: SupabaseClient;
  factorId: string;
  email: string;
  nextCode: () => Promise<string>;
  verify: (client?: SupabaseClient) => Promise<void>;
  cleanup: () => Promise<void>;
};
const fixtures = new Map<string, Fixture>();
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function requireStepUpMigration(client: SupabaseClient) {
  const { error } = await client.rpc('admin_user_has_totp', {
    target_user: '00000000-0000-0000-0000-000000000000',
  });
  if (error?.code === 'PGRST202')
    throw new Error(
      'NOT VERIFIED — Phase 6.5 migration is not deployed. Reviewer must apply it before live strong-auth tests.'
    );
  if (
    error &&
    !/Authentication required|STEP_UP_REQUIRED|Admin privilege required/.test(
      error.message
    )
  )
    throw new Error('NOT VERIFIED — Could not verify Phase 6.5 server deployment.');
}

/** Never change pre-existing factors. Secrets and generated codes remain in memory. */
export async function temporaryStepUp(
  client: SupabaseClient,
  credentials: Credentials
): Promise<Fixture> {
  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();
  if (userError || !user) throw new Error('Test user authentication failed');
  const existing = fixtures.get(user.id);
  if (existing) {
    await existing.verify(client);
    return existing;
  }
  const { data: before, error: listError } = await client.auth.mfa.listFactors();
  if (listError) throw new Error('Could not snapshot test user MFA factors');
  if (before.totp.some((f) => f.status === 'verified'))
    throw new Error(
      'NOT VERIFIED — Test account has a pre-existing authenticator. Use dedicated test accounts; existing factors will not be changed.'
    );
  const baseline = before.all.map((f) => f.id).sort();
  const { data, error } = await client.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `temporary-test-${randomUUID()}`,
  });
  if (error || !data) throw new Error('Could not enroll temporary test authenticator');
  const totp = new TOTP({
    secret: data.totp.secret,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });
  let previous = '';
  const nextCode = async () => {
    let code = totp.generate();
    if (code === previous) {
      await wait(30_000 - (Date.now() % 30_000) + 1000);
      code = totp.generate();
    }
    previous = code;
    return code;
  };
  const fixture: Fixture = {
    client,
    factorId: data.id,
    email: credentials.email,
    nextCode,
    verify: async (target = client) => {
      const { error: verifyError } = await target.auth.mfa.challengeAndVerify({
        factorId: data.id,
        code: await nextCode(),
      });
      if (verifyError) throw new Error('Temporary authenticator verification failed');
      const { error: refreshError } = await target.auth.refreshSession();
      if (refreshError) throw new Error('Could not refresh test MFA session');
    },
    cleanup: async () => {
      // Sign-out tests may revoke the original session. Reauthenticate using only in-memory credentials.
      const { error: authError } = await client.auth.signInWithPassword(credentials);
      if (authError) throw new Error('MFA cleanup could not authenticate');
      await fixture.verify();
      const { error: removeError } = await client.auth.mfa.unenroll({
        factorId: data.id,
      });
      if (removeError) throw new Error('Temporary MFA factor cleanup failed');
      const { data: after, error: afterError } = await client.auth.mfa.listFactors();
      if (
        afterError ||
        JSON.stringify(after.all.map((f) => f.id).sort()) !== JSON.stringify(baseline)
      )
        throw new Error('MFA factor set did not return to its original state');
      await client.auth.signOut({ scope: 'local' });
    },
  };
  fixtures.set(user.id, fixture); // Register before verification so failure still cleans up.
  await fixture.verify();
  return fixture;
}

export async function signInWithStepUp(client: SupabaseClient, credentials: Credentials) {
  const result = await client.auth.signInWithPassword(credentials);
  if (!result.error) await temporaryStepUp(client, credentials);
  return result;
}
export function testFactorForEmail(email: string) {
  return [...fixtures.values()].find((f) => f.email === email);
}
export async function withStepUpCleanup<T>(run: () => Promise<T>): Promise<T> {
  let result: T;
  let runError: unknown;
  let hasError = false;
  try {
    result = await run();
  } catch (err) {
    hasError = true;
    runError = err;
  }

  const failures = [];
  for (const fixture of [...fixtures.values()].reverse()) {
    try {
      await fixture.cleanup();
    } catch {
      failures.push('Temporary MFA cleanup failed; inspect the test account factors.');
    }
  }
  fixtures.clear();

  if (hasError) {
    throw runError;
  }
  if (failures.length) {
    throw new Error(failures.join(' '));
  }
  return result!;
}

/** Guard-first RPC rejects before it can touch any account, even with null arguments. */
export async function assertAal1TransferRejected(client: SupabaseClient) {
  const { error } = await client.rpc('transfer', {
    p_from_account: null,
    p_to_account: null,
    p_amount: 1,
    p_idempotency_key: randomUUID(),
  });
  if (!error || !/STEP_UP_REQUIRED|STEP_UP_NOT_ENROLLED/.test(error.message))
    throw new Error('aal1 transfer was not rejected by the step-up guard');
}

/** Use an authentic old JWT, never forge claims or shorten the production window. */
export async function assertStaleStepUpRejected(
  client: SupabaseClient,
  url: string,
  anonKey: string
) {
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session) throw new Error('Missing MFA session for stale-token test');
  const jwt = JSON.parse(
    Buffer.from(session.access_token.split('.')[1], 'base64url').toString()
  );
  const timestamp = Math.max(
    ...jwt.amr
      .filter((entry: { method: string }) => entry.method === 'totp')
      .map((entry: { timestamp: number }) => entry.timestamp)
  );
  if (!Number.isFinite(timestamp)) throw new Error('Missing TOTP claim in live JWT');
  while (Date.now() < timestamp * 1000 + 301_000) {
    console.log(
      'Waiting for the five-minute step-up window to expire (no money is moved).'
    );
    await wait(Math.min(30_000, timestamp * 1000 + 301_000 - Date.now()));
  }
  const stale = createClient(url, anonKey, {
    accessToken: async () => session.access_token,
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await stale.rpc('transfer', {
    p_from_account: null,
    p_to_account: null,
    p_amount: 1,
    p_idempotency_key: randomUUID(),
  });
  if (error?.message !== 'STEP_UP_EXPIRED')
    throw new Error('Stale TOTP session was not rejected');
  const fixture = testFactorForEmail(session.user.email || '');
  if (!fixture) throw new Error('Missing temporary MFA fixture');
  await fixture.verify(client);
}

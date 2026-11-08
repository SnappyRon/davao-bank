import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Page } from '@playwright/test';
import { TOTP } from 'otpauth';
import { requireStepUpMigration } from '../../scripts/lib/step-up';

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
const E2E_ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin@davaobank.ph';
const E2E_PASSWORD = process.env.E2E_PASSWORD || process.env.SEED_PASSWORD || '';

let activeTotp: TOTP | null = null;
let lastCode = '';

/** Never reuse a code inside one 30 s period; wait for the next one instead. */
async function nextCode(): Promise<string> {
  if (!activeTotp) throw new Error('No active test authenticator');
  let code = activeTotp.generate();
  if (code === lastCode) {
    await new Promise((r) => setTimeout(r, 30_000 - (Date.now() % 30_000) + 1000));
    code = activeTotp.generate();
  }
  lastCode = code;
  return code;
}

/** Give an API client for the admin account aal2, using the factor the browser just enrolled. */
export async function stepUpApiClient(client: SupabaseClient) {
  const { data, error } = await client.auth.mfa.listFactors();
  const factor = data?.totp.find((f) => f.status === 'verified');
  if (error || !factor) throw new Error('No verified test factor for API step-up');
  const { error: verifyError } = await client.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code: await nextCode(),
  });
  if (verifyError) throw new Error(`API step-up failed: ${verifyError.message}`);
}
// Factor ids that existed before the run. Cleanup never touches these.
let baselineFactorIds: Set<string> | null = null;

function serviceClient() {
  if (!SERVICE_ROLE_KEY)
    throw new Error(
      'NOT VERIFIED — SUPABASE_SERVICE_ROLE_KEY is required for MFA cleanup'
    );
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

async function adminFactorIds(): Promise<{ userId: string; ids: string[] }> {
  const svc = serviceClient();
  const { data: usersData, error } = await svc.auth.admin.listUsers();
  if (error) throw new Error('Could not list users for MFA cleanup');
  const user = usersData.users.find(
    (u) => u.email?.toLowerCase() === E2E_ADMIN_EMAIL.toLowerCase()
  );
  if (!user) throw new Error('Admin test user not found');
  const { data: factors, error: listErr } = await svc.auth.admin.mfa.listFactors({
    userId: user.id,
  });
  if (listErr) throw new Error('Could not list admin MFA factors');
  return { userId: user.id, ids: (factors?.factors || []).map((f) => f.id) };
}

export async function checkPlaywrightPrerequisites() {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
  });
  await requireStepUpMigration(client);

  // Check if admin has pre-existing verified factor
  if (E2E_PASSWORD) {
    const adminAuthClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
    });
    const { data: authData, error: authErr } =
      await adminAuthClient.auth.signInWithPassword({
        email: E2E_ADMIN_EMAIL,
        password: E2E_PASSWORD,
      });

    if (!authErr && authData?.session) {
      const { data: factorData, error: listErr } =
        await adminAuthClient.auth.mfa.listFactors();
      if (!listErr && factorData?.totp?.some((f) => f.status === 'verified')) {
        throw new Error('NOT VERIFIED — admin account has an existing authenticator');
      }
    }
  }
  // Only reached when every prerequisite passed; cleanup is disabled otherwise.
  baselineFactorIds = new Set((await adminFactorIds()).ids);
}

export async function completeMfa(page: Page) {
  // Wait for navigation to /mfa/setup, /mfa/verify, or /
  await page.waitForURL(/\/mfa\/(setup|verify)|\/$/, { timeout: 15_000 });
  const url = page.url();

  if (url.includes('/mfa/setup')) {
    // If "Set up authenticator" button is present, click it
    const startBtn = page.getByRole('button', { name: 'Set up authenticator' });
    if (await startBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await startBtn.click();
    }

    // Read setup key from <code>
    const codeLocator = page.locator('code');
    await codeLocator.waitFor({ state: 'visible', timeout: 10_000 });
    const secret = (await codeLocator.innerText()).trim();

    activeTotp = new TOTP({
      secret,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    });

    const code = await nextCode();
    const input = page.getByLabel('Authenticator code');
    await input.fill(code);

    const verifyBtn = page.getByRole('button', { name: 'Verify code' });
    if (await verifyBtn.isEnabled({ timeout: 1000 }).catch(() => false)) {
      await verifyBtn.click();
    }

    await page.waitForURL((u: URL) => !u.pathname.startsWith('/mfa/'), {
      timeout: 15_000,
    });
  } else if (url.includes('/mfa/verify')) {
    if (!activeTotp) {
      throw new Error(
        'Landed on /mfa/verify but no active TOTP instance exists in test runner.'
      );
    }
    const code = await nextCode();
    const input = page.getByLabel('Authenticator code');
    await input.fill(code);

    const verifyBtn = page.getByRole('button', { name: 'Verify code' });
    if (await verifyBtn.isEnabled({ timeout: 1000 }).catch(() => false)) {
      await verifyBtn.click();
    }

    await page.waitForURL((u: URL) => !u.pathname.startsWith('/mfa/'), {
      timeout: 15_000,
    });
  }
}

export async function cleanupMfa() {
  activeTotp = null;
  lastCode = '';
  // Prerequisites failed (e.g. a real authenticator exists): never delete anything.
  if (!baselineFactorIds) return;
  const { userId, ids } = await adminFactorIds();
  const svc = serviceClient();
  for (const id of ids.filter((factorId) => !baselineFactorIds!.has(factorId))) {
    const { error } = await svc.auth.admin.mfa.deleteFactor({ userId, id });
    if (error) throw new Error('Temporary admin MFA factor cleanup failed');
  }
  const after = (await adminFactorIds()).ids.filter((id) => !baselineFactorIds!.has(id));
  if (after.length)
    throw new Error('Admin MFA factors did not return to their original state');
}

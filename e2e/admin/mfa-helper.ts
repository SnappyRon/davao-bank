import { createClient } from '@supabase/supabase-js';
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

    const code = activeTotp.generate();
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
    const code = activeTotp.generate();
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
  try {
    if (E2E_PASSWORD) {
      const adminAuthClient = createClient(SUPABASE_URL, ANON_KEY, {
        auth: { persistSession: false },
      });
      const { data: authData } = await adminAuthClient.auth.signInWithPassword({
        email: E2E_ADMIN_EMAIL,
        password: E2E_PASSWORD,
      });

      if (authData?.session) {
        const { data: factors } = await adminAuthClient.auth.mfa.listFactors();
        if (factors?.all) {
          for (const factor of factors.all) {
            if (activeTotp) {
              const code = activeTotp.generate();
              await adminAuthClient.auth.mfa.challengeAndVerify({
                factorId: factor.id,
                code,
              });
            }
            await adminAuthClient.auth.mfa.unenroll({ factorId: factor.id });
          }
        }
      }
    }

    if (SERVICE_ROLE_KEY) {
      const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      });
      const { data: usersData } = await serviceClient.auth.admin.listUsers();
      const targetUser = usersData?.users?.find(
        (u) => u.email?.toLowerCase() === E2E_ADMIN_EMAIL.toLowerCase()
      );
      if (targetUser?.id) {
        const { data: factors } = await serviceClient.auth.admin.mfa.listFactors({
          userId: targetUser.id,
        });
        for (const factor of factors?.factors || []) {
          await serviceClient.auth.admin.mfa.deleteFactor({
            userId: targetUser.id,
            id: factor.id,
          });
        }
      }
    }
  } catch (err) {
    console.warn('MFA factor cleanup note:', err);
  } finally {
    activeTotp = null;
    activeFactorId = null;
  }
}

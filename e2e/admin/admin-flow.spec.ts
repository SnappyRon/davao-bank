import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { formatCentavosToPHP } from '@davao-bank/shared';
import { test, expect } from '@playwright/test';
import { checkPlaywrightPrerequisites, completeMfa, cleanupMfa } from './mfa-helper';

const E2E_ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin@davaobank.ph';
const E2E_CUSTOMER_EMAIL = process.env.E2E_CUSTOMER_EMAIL || 'customer1@davaobank.ph';
const E2E_PASSWORD = process.env.E2E_PASSWORD || process.env.SEED_PASSWORD || '';

test.describe('Admin Console E2E Flow', () => {
  test.beforeAll(async () => {
    await checkPlaywrightPrerequisites();
  });

  test.afterEach(async () => {
    await cleanupMfa();
  });

  test.afterAll(async () => {
    await cleanupMfa();
  });

  test('Non-admin user cannot access protected admin routes and gets redirected', async ({
    page,
  }) => {
    // 1. Visit Login page as customer
    await page.goto('/login');
    await page.fill('input[type="email"]', E2E_CUSTOMER_EMAIL);
    await page.fill('input[type="password"]', E2E_PASSWORD || 'WrongOrPlaceholderPw!');
    await page.click('button[type="submit"]');

    // Customer client-side rejection message appears or stays on login
    await expect(
      page.getByText(
        /Access Denied: This portal is restricted to Davao Bank administrative staff|That email and password don't match|Something went wrong/i
      )
    ).toBeVisible();

    // Directly navigating to dashboard without admin session redirects to /login or /unauthorized
    await page.goto('/users');
    await expect(page).toHaveURL(/\/login|\/unauthorized/);
  });

  test('Admin signs in, navigates twice for middleware refresh, signs out, and gets redirected to login', async ({
    page,
  }) => {
    test.skip(!E2E_PASSWORD, 'Skipping authenticated admin flow: E2E_PASSWORD not set');

    // 1. Sign in as Admin
    await page.goto('/login');
    await page.fill('input[type="email"]', E2E_ADMIN_EMAIL);
    await page.fill('input[type="password"]', E2E_PASSWORD);
    await page.click('button[type="submit"]');

    // Complete MFA step-up
    await completeMfa(page);

    await expect(page).toHaveURL('/');
    await expect(
      page.getByRole('heading', { name: 'Staff Console Dashboard' })
    ).toBeVisible();

    // 2. Navigate twice to trigger middleware token/cookie refresh
    await page.goto('/users');
    await expect(page).toHaveURL('/users');

    await page.goto('/accounts');
    await expect(page).toHaveURL('/accounts');

    // 3. Click Sign Out in header
    const signOutBtn = page.getByRole('button', { name: /Sign Out/i }).first();
    await signOutBtn.click();

    // 4. Assert redirected to /login
    await expect(page).toHaveURL(/\/login/);

    // 5. Navigating back to / should redirect to /login
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });
  test('Admin logs in, manages users, adjusts balance, reverses transaction, and inspects audit logs', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    expect(E2E_PASSWORD, 'Private E2E credentials must be configured').not.toBe('');
    const run = `closeout-${randomUUID()}`;
    const admin = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const customer = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    expect(
      (
        await admin.auth.signInWithPassword({
          email: E2E_ADMIN_EMAIL,
          password: E2E_PASSWORD,
        })
      ).error
    ).toBeNull();
    const customerAuth = await customer.auth.signInWithPassword({
      email: E2E_CUSTOMER_EMAIL,
      password: E2E_PASSWORD,
    });
    expect(customerAuth.error).toBeNull();
    const users = await admin.rpc('admin_get_users');
    expect(users.error).toBeNull();
    const target = (users.data as { id: string; email: string; status: string }[]).find(
      (user) => user.email === 'customer2@davaobank.ph'
    )!;
    expect(target).toBeTruthy();
    expect(target.status).toBe('active');
    const readBalances = async () => {
      const result = await admin
        .from('account_balances')
        .select('account_id, account_number, user_id, balance, status')
        .in('user_id', [target.id, customerAuth.data.user!.id])
        .order('account_id');
      expect(result.error).toBeNull();
      return result.data!;
    };
    const before = await readBalances();
    const source = before.find(
      (account) =>
        account.user_id === customerAuth.data.user!.id &&
        account.status === 'active' &&
        account.balance >= 100
    )!;
    const destination = before.find(
      (account) => account.user_id === target.id && account.status === 'active'
    )!;
    expect(source).toBeTruthy();
    expect(destination).toBeTruthy();
    const creditReason = `${run} credit`;
    const debitReason = `${run} offset`;
    const transferKey = `${run}-transfer`;
    const accountRow = () =>
      page.getByRole('row').filter({ hasText: destination.account_number });
    const userRow = () => page.getByRole('row').filter({ hasText: target.email });
    const assertRestored = async () => {
      expect(await readBalances()).toEqual(before);
      const profile = await admin
        .from('profiles')
        .select('status')
        .eq('id', target.id)
        .single();
      expect(profile.error).toBeNull();
      expect(profile.data?.status).toBe('active');
    };
    try {
      await page.goto('/login');
      await page.getByLabel('Staff Email Address').fill(E2E_ADMIN_EMAIL);
      await page.getByLabel('Security Password').fill(E2E_PASSWORD);
      await page.getByRole('button', { name: 'Sign In to Staff Console' }).click();

      // Complete MFA step-up
      await completeMfa(page);

      await expect(page).toHaveURL('/');
      await expect(
        page.getByRole('heading', { name: 'Staff Console Dashboard' })
      ).toBeVisible();

      await test.step('Suspend and reactivate only customer 2', async () => {
        await page.goto('/users');
        await expect(
          page.getByRole('heading', { name: 'User & Customer Directory' })
        ).toBeVisible();
        await page.getByRole('textbox', { name: 'Search users' }).fill(target.email);
        await expect(userRow()).toHaveCount(1);
        for (const [action, status] of [
          ['Suspend', 'suspended'],
          ['Activate', 'active'],
        ]) {
          await userRow().getByRole('button', { name: action, exact: true }).click();
          const dialog = page.getByRole('dialog', {
            name: `${action} User`,
            exact: true,
          });
          await dialog.getByLabel('Mandatory Reason (Audited)').fill(`${run} ${action}`);
          await dialog
            .getByRole('button', { name: `${action} Account`, exact: true })
            .click();
          await expect(dialog).not.toBeVisible();
          await expect(userRow().getByText(status, { exact: true })).toBeVisible();
        }
      });

      await test.step('Credit PHP 1 and offset it with a matching debit', async () => {
        await page.goto('/accounts');
        await expect(
          page.getByRole('heading', { name: 'Deposit & Ledger Accounts' })
        ).toBeVisible();
        await page
          .getByRole('textbox', { name: 'Search accounts' })
          .fill(destination.account_number);
        for (const [direction, reason, balance] of [
          ['credit', creditReason, destination.balance + 100],
          ['debit', debitReason, destination.balance],
        ] as const) {
          await accountRow()
            .getByRole('button', { name: 'Adjust Balance', exact: true })
            .click();
          const drawer = page.getByRole('dialog', { name: 'Adjust Account Balance' });
          await drawer.getByLabel('Adjustment Direction').selectOption(direction);
          await drawer.getByLabel('Amount in PHP').fill('1.00');
          const promptHandled = new Promise<void>((resolve, reject) => {
            page.once('dialog', async (dialog) => {
              try {
                expect(dialog.type()).toBe('prompt');
                expect(dialog.message()).toBe(
                  'Enter mandatory reason for balance adjustment:'
                );
                await dialog.accept(reason);
                resolve();
              } catch (error) {
                reject(error);
              }
            });
          });
          await drawer.getByRole('button', { name: 'Execute Adjustment' }).click();
          await promptHandled;
          await expect(drawer).not.toBeVisible();
          await expect(
            accountRow().getByText(formatCentavosToPHP(balance), { exact: true })
          ).toBeVisible();
        }
      });

      await test.step('Reverse this run’s own PHP 1 transfer', async () => {
        const transfer = await customer.rpc('transfer_by_account_number', {
          p_from_account: source.account_id,
          p_to_account_number: destination.account_number,
          p_amount: 100,
          p_idempotency_key: transferKey,
          p_reference: run,
        });
        expect(transfer.error).toBeNull();
        await page.goto('/transactions');
        await expect(
          page.getByRole('heading', { name: 'Transaction Oversight & Reversals' })
        ).toBeVisible();
        await page.getByRole('textbox', { name: 'Search transactions' }).fill(run);
        const row = page
          .getByRole('row')
          .filter({ has: page.getByRole('cell', { name: run, exact: true }) });
        await expect(row).toHaveCount(1);
        await row.getByRole('button', { name: 'Reverse', exact: true }).click();
        const dialog = page.getByRole('dialog', {
          name: 'Reverse Financial Transaction',
        });
        await dialog.getByLabel('Mandatory Reason (Audited)').fill(`${run} reversal`);
        await dialog.getByRole('button', { name: 'Execute Reversal' }).click();
        await expect(dialog).not.toBeVisible();
        await expect(row.getByText('reversed', { exact: true })).toBeVisible();
      });

      await test.step('Inspect this run’s audit records and assert restored state', async () => {
        await page.goto('/audit');
        await expect(
          page.getByRole('heading', { name: 'Audit Trail & System Compliance' })
        ).toBeVisible();
        await page.getByRole('textbox', { name: 'Search audit logs' }).fill(creditReason);
        const auditRow = page.getByRole('row').filter({ hasText: 'balance_adjustment' });
        await expect(auditRow).toHaveCount(1);
        await auditRow.getByRole('button', { name: 'JSON', exact: true }).click();
        await expect(page.getByRole('dialog')).toContainText(creditReason);
        await assertRestored();
      });
    } finally {
      // Recover only this run's mutations, even if a UI assertion failed after commit.
      const transfer = await admin
        .from('transactions')
        .select('id, status')
        .eq('idempotency_key', transferKey)
        .maybeSingle();
      expect(transfer.error).toBeNull();
      if (transfer.data?.status === 'completed') {
        expect(
          (
            await admin.rpc('admin_reverse_transaction', {
              p_transaction_id: transfer.data.id,
              p_reason: `${run} cleanup`,
              p_idempotency_key: `${run}-cleanup-reversal`,
            })
          ).error
        ).toBeNull();
      }
      const adjustments = await admin
        .from('transactions')
        .select('reference')
        .in('reference', [creditReason, debitReason]);
      expect(adjustments.error).toBeNull();
      if (
        adjustments.data?.some((tx) => tx.reference === creditReason) &&
        !adjustments.data.some((tx) => tx.reference === debitReason)
      ) {
        expect(
          (
            await admin.rpc('admin_adjust_balance', {
              p_account_id: destination.account_id,
              p_amount: 100,
              p_direction: 'debit',
              p_reason: debitReason,
              p_idempotency_key: `${run}-cleanup-adjustment`,
            })
          ).error
        ).toBeNull();
      }
      const profile = await admin
        .from('profiles')
        .select('status')
        .eq('id', target.id)
        .single();
      expect(profile.error).toBeNull();
      if (profile.data?.status !== 'active') {
        expect(
          (
            await admin.rpc('admin_set_user_status', {
              p_user_id: target.id,
              p_status: 'active',
              p_reason: `${run} cleanup`,
            })
          ).error
        ).toBeNull();
      }
      await assertRestored();
    }
  });

  test('idle sign-out clears the browser session after navigation', async ({ page }) => {
    test.skip(!E2E_PASSWORD, 'E2E_PASSWORD is required');
    // Install before navigation so the application registers its idle interval on this clock.
    await page.clock.install();
    await page.goto('/login');
    await page.fill('input[type="email"]', E2E_ADMIN_EMAIL);
    await page.fill('input[type="password"]', E2E_PASSWORD);
    await page.click('button[type="submit"]');

    // Complete MFA step-up
    await completeMfa(page);

    await expect(page).toHaveURL('/');
    await page.goto('/users');
    await page.goto('/accounts');
    // An input interaction waits for hydration and starts a fresh idle period.
    await page.getByRole('textbox', { name: 'Search accounts' }).fill('');
    await page.clock.fastForward(14 * 60 * 1000 + 5000);
    await expect(
      page.getByRole('dialog', { name: 'Session Inactivity Warning' })
    ).toBeVisible();
    await page.clock.fastForward(2 * 60 * 1000);
    await expect(page).toHaveURL(/\/login\?reason=idle_timeout/);
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });

  test('AAL1 admin session (password only) opening / is redirected to MFA step', async ({
    page,
  }) => {
    test.skip(!E2E_PASSWORD, 'E2E_PASSWORD is required');

    // Sign in with password only
    await page.goto('/login');
    await page.fill('input[type="email"]', E2E_ADMIN_EMAIL);
    await page.fill('input[type="password"]', E2E_PASSWORD);
    await page.click('button[type="submit"]');

    // Verify redirected to /mfa/setup or /mfa/verify
    await expect(page).toHaveURL(/\/mfa\/(setup|verify)/);

    // Attempting to navigate directly to / with aal1 session must be redirected back to MFA
    await page.goto('/');
    await expect(page).toHaveURL(/\/mfa\/(setup|verify)/);

    // Attempting to navigate to /users with aal1 session must also be redirected to MFA
    await page.goto('/users');
    await expect(page).toHaveURL(/\/mfa\/(setup|verify)/);
  });
});

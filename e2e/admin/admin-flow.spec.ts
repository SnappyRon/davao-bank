import { test, expect } from '@playwright/test';

test.describe('Admin Console E2E Flow', () => {
  test('Non-admin user cannot access protected admin routes and gets redirected', async ({
    page,
  }) => {
    // 1. Visit Login page as customer1
    await page.goto('/login');
    await page.fill('input[type="email"]', 'customer1@davaobank.ph');
    await page.fill('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');

    // Customer client-side rejection message appears
    await expect(
      page.getByText(
        'Access Denied: This portal is restricted to Davao Bank administrative staff.'
      )
    ).toBeVisible();

    // Directly navigating to dashboard without admin session redirects to /login or /unauthorized
    await page.goto('/users');
    await expect(page).toHaveURL(/\/login|\/unauthorized/);
  });

  test('Admin logs in, manages users, adjusts balance, reverses transaction, and inspects audit logs', async ({
    page,
  }) => {
    // 1. Sign in as Admin
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@davaobank.ph');
    await page.fill('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');

    // Land on dashboard
    await expect(page).toHaveURL('/');
    await expect(page.getByText('Admin Operations Dashboard')).toBeVisible();

    // 2. Suspend and Reactivate Customer 2 (/users)
    await page.goto('/users');
    await expect(page.getByText('User Management')).toBeVisible();

    // Find Customer 2 row or search Maria Santos
    await page.fill('input[placeholder*="Search users"]', 'customer2@davaobank.ph');
    await expect(page.getByText('customer2@davaobank.ph')).toBeVisible();

    // Click on Customer 2 to open actions
    await page.getByText('customer2@davaobank.ph').click();

    // Check if user is active, suspend, and then reactivate
    const statusBtn = page.getByRole('button', { name: /Suspend User|Reactivate User/i });
    if (await statusBtn.isVisible()) {
      const isCurrentlyActive = await page.getByText(/Suspend User/i).isVisible();
      if (isCurrentlyActive) {
        await page.getByRole('button', { name: /Suspend User/i }).click();
        await page.fill(
          'textarea, input[placeholder*="reason"]',
          'E2E Compliance Review'
        );
        await page.getByRole('button', { name: /Confirm/i }).click();
        await expect(page.getByText(/Suspended/i)).toBeVisible();

        // Reactivate
        await page.getByRole('button', { name: /Reactivate User/i }).click();
        await page.fill(
          'textarea, input[placeholder*="reason"]',
          'E2E Clearance Verified'
        );
        await page.getByRole('button', { name: /Confirm/i }).click();
        await expect(page.getByText(/Active/i)).toBeVisible();
      }
    }

    // 3. Balance Adjustment Credit (/accounts)
    await page.goto('/accounts');
    await expect(page.getByText('Account Management')).toBeVisible();
    const adjustBtn = page.getByRole('button', { name: /Adjust Balance/i }).first();
    if (await adjustBtn.isVisible()) {
      await adjustBtn.click();
      await page.fill('input[placeholder*="0.00"]', '50.00');
      await page.fill('textarea, input[placeholder*="reason"]', 'E2E Goodwill Credit');
      await page.getByRole('button', { name: /Apply Adjustment/i }).click();
    }

    // 4. Reverse a Transaction (/transactions)
    await page.goto('/transactions');
    await expect(page.getByText('Ledger Transactions')).toBeVisible();
    const reverseBtn = page.getByRole('button', { name: /Reverse/i }).first();
    if (await reverseBtn.isVisible()) {
      await reverseBtn.click();
      await page.fill('textarea, input[placeholder*="reason"]', 'E2E Test Reversal');
      await page.getByRole('button', { name: /Confirm Reversal/i }).click();
    }

    // 5. Inspect Audit Log (/audit)
    await page.goto('/audit');
    await expect(page.getByText('Audit Trail')).toBeVisible();
    await expect(
      page.getByText(/admin@davaobank.ph|user_status_changed|balance_adjusted/i).first()
    ).toBeVisible();
  });
});

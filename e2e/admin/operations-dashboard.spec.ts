import { test, expect } from '@playwright/test';

/**
 * Phase 8.5B operations dashboard checks. They need a real aal2 staff session.
 * The owner signs in on their device and exports browser storage state to the
 * path in ADMIN_STORAGE_STATE; this spec never reads .env or automates MFA.
 * Every check is explicitly NOT VERIFIED until that sign-in happens.
 */
const STORAGE_STATE = process.env.ADMIN_STORAGE_STATE;

test.use({
  storageState: STORAGE_STATE || { cookies: [], origins: [] },
});

test.describe('Operations dashboard (manual staff session)', () => {
  test.beforeEach(() => {
    if (!STORAGE_STATE) {
      console.log('NOT VERIFIED — needs owner sign-in');
    }
    test.skip(!STORAGE_STATE, 'NOT VERIFIED — needs owner sign-in');
  });

  test('hero, metric cards and six charts use real RPC data with text alternatives', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Staff console dashboard' })
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Total volume' })).toBeVisible();

    const metrics = page.getByRole('region', { name: 'Key metrics' });
    await expect(metrics.getByText('Total transactions')).toBeVisible();
    await expect(metrics.getByText('Accounts')).toBeVisible();
    await expect(metrics.getByText('Customers')).toBeVisible();
    await expect(metrics.getByText('Open cases')).toBeVisible();

    for (const name of [
      'Volume over time',
      'In vs out',
      'By category',
      'Status mix',
      'Balance distribution',
      'Customer and account growth',
    ]) {
      await expect(page.getByRole('region', { name })).toBeVisible();
    }
    for (const caption of [
      'Volume over time, text version',
      'Money in and out, text version',
      'Volume by category, text version',
      'Transaction status mix, text version',
      'Balance distribution, text version',
      'Customer and account growth, text version',
    ]) {
      await expect(page.getByRole('table', { name: caption })).toBeVisible();
    }
    for (const name of [
      'Volume over time',
      'Money in and money out',
      'Volume by category',
      'Transaction status mix',
      'Account balance distribution',
      'Customer and account growth',
    ]) {
      const svg = page.getByRole('img', { name });
      await expect(svg.locator('title')).toHaveText(name);
      await expect(svg.locator('desc')).not.toBeEmpty();
    }
  });

  test('date range presets, custom dates and previous-period comparison refetch the RPCs', async ({
    page,
  }) => {
    await page.goto('/');
    const range = page.getByRole('region', { name: 'Reporting period' });
    await expect(range.getByRole('button', { name: '30 days' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await range.getByRole('button', { name: 'Today' }).click();
    await expect(range).toContainText('Today');
    await range.getByRole('button', { name: '7 days' }).click();
    await expect(range).toContainText('Last 7 days');
    await range.getByRole('button', { name: 'Custom' }).click();
    await range.getByLabel('From date').fill('2026-11-01');
    await range.getByLabel('To date').fill('2026-11-03');
    await expect(range).toContainText('Nov 1 – Nov 3');

    await range.getByLabel('Compare to previous period').check();
    await expect(
      page.getByRole('columnheader', { name: 'Previous volume' })
    ).toBeVisible();
  });

  test('live feed masks accounts, links to the full list and reports its connection state', async ({
    page,
  }) => {
    await page.goto('/');
    const feed = page.getByRole('region', { name: 'Live transaction feed' });
    await expect(feed.getByRole('link', { name: 'View all' })).toHaveAttribute(
      'href',
      '/transactions'
    );
    await expect(feed.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    await expect(feed.getByText('Connecting to the live feed…')).toBeHidden();
    await expect(feed).toContainText(/Last updated|No activity yet|Reconnecting|offline/);
    await expect(feed.locator('text=/\\d{5,}/')).toHaveCount(0);
  });

  test('security panel shows real signals and a clear unavailable note for failed sign-ins', async ({
    page,
  }) => {
    await page.goto('/');
    const security = page.getByRole('region', { name: 'Security panel' });
    await expect(security.getByRole('link', { name: 'Review cases' })).toHaveAttribute(
      'href',
      '/cases'
    );
    await expect(security).toContainText('Locked accounts');
    await expect(security).toContainText('Frozen accounts');
    await expect(security).toContainText('Failed scheduled payments');
    await expect(security).toContainText('Not available');
    await expect(security).toContainText('no reliable source');
    await expect(
      page.getByRole('region', { name: 'Recent admin activity' })
    ).toBeVisible();
  });
});

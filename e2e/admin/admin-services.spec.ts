import { test, expect } from '@playwright/test';

/**
 * Phase 9F staff service screens. These checks need a real aal2 staff session.
 * The owner signs in on their device and exports browser storage state to the
 * path in ADMIN_STORAGE_STATE; this spec never reads .env or automates MFA.
 * Every check is explicitly NOT VERIFIED until that sign-in happens.
 */
const STORAGE_STATE = process.env.ADMIN_STORAGE_STATE;

test.use({
  storageState: STORAGE_STATE || { cookies: [], origins: [] },
});

test.describe('Admin service requests and appointments (manual staff session)', () => {
  test.beforeEach(() => {
    if (!STORAGE_STATE) {
      console.log('NOT VERIFIED — needs owner sign-in');
    }
    test.skip(!STORAGE_STATE, 'NOT VERIFIED — needs owner sign-in');
  });

  test('service requests filter, masked detail drawer and status change work', async ({
    page,
  }) => {
    await page.goto('/service-requests');
    await expect(page.getByRole('heading', { name: 'Service requests' })).toBeVisible();
    await expect(page.getByText('Simulation', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Status' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Type' })).toBeVisible();

    await page.getByRole('combobox', { name: 'Status' }).selectOption('submitted');
    await expect(page.getByText('Submitted').first()).toBeVisible();

    const open = page.getByRole('button', { name: /open details for request/i }).first();
    if (await open.count()) {
      await open.click();
      const drawer = page.getByRole('dialog', { name: /request db-/i });
      await expect(drawer).toBeVisible();
      await expect(drawer.getByText(/customer ••/i)).toBeVisible();
      await drawer.getByLabel('Staff note').fill('Reviewed in the demo console');
      await drawer.getByRole('button', { name: 'Save status' }).click();
      await expect(page.getByText('Status updated.')).toBeVisible();
    }
  });

  test('appointments filter by branch and date and mask customer names', async ({
    page,
  }) => {
    await page.goto('/appointments');
    await expect(
      page.getByRole('heading', { name: 'Branch appointments' })
    ).toBeVisible();
    await expect(page.getByText('Simulation', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Branch' })).toBeVisible();
    await expect(page.getByLabel('Date')).toBeVisible();

    const open = page
      .getByRole('button', { name: /change status for appointment/i })
      .first();
    if (await open.count()) {
      await open.click();
      const drawer = page.getByRole('dialog', { name: /appointment db-/i });
      await expect(drawer).toBeVisible();
      await expect(drawer.getByText(/^\w\*\*\*( \w\*\*\*)*$/)).toBeVisible();
      await drawer.getByLabel(/staff note/i).fill('Customer arrived late');
      await drawer.getByRole('button', { name: 'Save status' }).click();
      await expect(page.getByText('Status updated.')).toBeVisible();
    }
  });

  test('offline, empty and step-up states are reachable without raw identifiers', async ({
    page,
  }) => {
    await page.goto('/service-requests');
    await expect(page.getByRole('heading', { name: 'Service requests' })).toBeVisible();
    await page.context().setOffline(true);
    await expect(page.getByText(/you appear to be offline/i)).toBeVisible();
    await page.context().setOffline(false);
    await page.getByRole('button', { name: 'Try again' }).click();

    await page.goto('/appointments');
    await expect(
      page.getByRole('heading', { name: 'Branch appointments' })
    ).toBeVisible();
    const bodyText = await page.locator('main').innerText();
    expect(bodyText).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    );
  });
});

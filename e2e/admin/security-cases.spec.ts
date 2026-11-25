import { test, expect } from '@playwright/test';

/**
 * Stage 8G manual Playwright checks. They need a real aal2 staff session.
 * The owner signs in on their device and exports the browser storage state to
 * the path in ADMIN_STORAGE_STATE; this spec never reads .env or automates MFA.
 * Until then every check is explicitly NOT VERIFIED, not a pass.
 */
const STORAGE_STATE = process.env.ADMIN_STORAGE_STATE;
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

test.use({
  storageState: STORAGE_STATE || { cookies: [], origins: [] },
});

test.describe('Bantay security cases (manual staff session)', () => {
  test.beforeEach(() => {
    if (!STORAGE_STATE) {
      console.log('NOT VERIFIED — needs owner sign-in');
    }
    test.skip(!STORAGE_STATE, 'NOT VERIFIED — needs owner sign-in');
  });

  test('case list is filtered by status and shows sentence-case badges', async ({
    page,
  }) => {
    await page.goto('/cases');
    await expect(page.getByRole('heading', { name: 'Security cases' })).toBeVisible();

    const filter = page.getByLabel('Filter cases by status');
    await expect(filter).toBeVisible();
    await filter.selectOption('open');
    await expect(page).toHaveURL(/status=open/);
    const rows = page.getByRole('row');
    await expect(rows.first()).toBeVisible();

    await filter.selectOption('resolved');
    await expect(page).toHaveURL(/status=resolved/);
  });

  test('case detail shows a masked customer, an event timeline, and no raw ids', async ({
    page,
  }) => {
    await page.goto('/cases');
    const firstCase = page.getByRole('link', { name: /^DB-/ }).first();
    await expect(firstCase).toBeVisible();
    await firstCase.click();

    await expect(page.getByRole('heading', { name: /^Security case DB-/ })).toBeVisible();
    await expect(page.getByText('Customer summary')).toBeVisible();
    await expect(page.getByText('Event timeline')).toBeVisible();
    await expect(
      page.getByText(/Receiving account •••• \d{4}|No receiving account was recorded/)
    ).toBeVisible();

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(UUID_PATTERN);
    expect(page.url()).not.toMatch(UUID_PATTERN);
  });

  test('staff can set status and add a note', async ({ page }) => {
    await page.goto('/cases');
    await page.getByRole('link', { name: /^DB-/ }).first().click();

    await page.getByLabel('Case status').selectOption('investigating');
    await page
      .getByRole('textbox', { name: 'Staff note' })
      .fill('Manual Playwright review of this case.');
    await page.getByRole('button', { name: 'Save case update' }).click();

    await expect(page.getByText('Case updated.')).toBeVisible();
    await expect(page.getByLabel('Case status')).toHaveValue('investigating');
  });

  test('staff can unlock a locked customer from the case', async ({ page }) => {
    await page.goto('/cases');
    await page.getByRole('link', { name: /^DB-/ }).first().click();

    await page.getByRole('button', { name: 'Unlock customer' }).click();
    const dialog = page.getByRole('dialog', { name: 'Unlock customer' });
    await expect(dialog).toBeVisible();
    await dialog
      .getByLabel('Mandatory Reason (Audited)')
      .fill('Manual Playwright verified the customer identity.');
    await dialog.getByRole('button', { name: 'Unlock customer' }).click();

    await expect(page.getByText('Customer unlocked.')).toBeVisible();
  });
});

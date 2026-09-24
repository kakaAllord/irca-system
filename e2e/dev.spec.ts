import { expect, test } from '@playwright/test';

const DEV = { email: 'dev@irca.local', password: 'dev-password-123' };

async function signIn(page: import('@playwright/test').Page, who: typeof DEV) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('navigation', { name: 'Portals' })).toBeVisible();
}

test.describe('the dev console', () => {
  test('health, logs and the activity log all show real numbers', async ({ page }) => {
    await signIn(page, DEV);

    await page.getByRole('link', { name: 'Health', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Health', level: 1 })).toBeVisible();
    await expect(page.getByText('Database', { exact: true })).toBeVisible();

    await page.getByRole('link', { name: 'Logs', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Logs', level: 1 })).toBeVisible();

    // The dev signing in themselves is already an action worth reading back.
    await page.getByRole('link', { name: 'Activity', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Activity', level: 1 })).toBeVisible();
    // Never a view-as line, even for someone who may also read the view-as log.
    await expect(page.getByText(/impersonation\./)).toHaveCount(0);
  });

  test('viewing as someone, then reading it back in the view-as log', async ({ page }) => {
    await signIn(page, DEV);

    // View as the finance clerk from her own page.
    await page.getByRole('link', { name: 'People', exact: true }).click();
    await page.getByRole('link', { name: 'Neema Mollel clerk@irca.local' }).click();
    await page.getByRole('button', { name: 'View as Neema' }).click();
    await expect(page.getByText('Viewing as Neema Mollel', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Stop viewing' }).click();
    await expect(page.getByText('Viewing as Neema Mollel', { exact: true })).toHaveCount(0);

    // The view-as log is the only place that session shows up.
    await page.getByRole('link', { name: 'View-as log' }).click();
    const field = page.getByLabel('Command');
    await field.fill('log --since=30d');
    await field.press('Enter');
    await expect(page.getByText(/dev@irca\.local.*→.*clerk@irca\.local/).first()).toBeVisible();

    await field.fill('help');
    await field.press('Enter');
    await expect(page.getByText('who viewed as whom, newest first')).toBeVisible();

    await field.fill('sudo rm -rf /');
    await field.press('Enter');
    await expect(page.getByText('"sudo" is not a command. Type help.')).toBeVisible();

    // The last thing typed comes back on the up arrow.
    await field.press('ArrowUp');
    await expect(field).toHaveValue('sudo rm -rf /');
  });

  test('the dev console is not for an ordinary administrator', async ({ page }) => {
    await signIn(page, { email: 'admin@irca.local', password: 'admin-password-123' });
    await expect(page.getByRole('link', { name: 'Health', exact: true })).toHaveCount(0);
    await page.goto('/dev');
    await expect(page.getByText("You don't have access to the health page")).toBeVisible();
  });
});

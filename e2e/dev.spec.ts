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

  test('usage, tab by tab', async ({ page }) => {
    await signIn(page, DEV);
    await page.getByRole('link', { name: 'Usage', exact: true }).click();
    await expect(page.getByText('Staff active today')).toBeVisible();
    await expect(page.getByText('Requests by portal')).toBeVisible();

    const tabs = page.getByRole('navigation', { name: 'Usage' });
    await tabs.getByRole('link', { name: 'Every number' }).click();
    await page.getByRole('button', { name: 'Failed sign-ins' }).click();
    await expect(page).toHaveURL(/metrics=.*auth\.login_failures/);
    await expect(page.getByText('Failed sign-ins').last()).toBeVisible();

    // Counts reach the database once a minute, so this run's own requests may
    // not be there yet; the API tests check the numbers themselves.
    await tabs.getByRole('link', { name: 'API' }).click();
    await expect(page.getByRole('heading', { name: 'Busiest routes' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Slowest routes' })).toBeVisible();

    await tabs.getByRole('link', { name: 'Sign-ins' }).click();
    await expect(page.getByText('Wrong passwords', { exact: true }).first()).toBeVisible();
    await tabs.getByRole('link', { name: 'Email' }).click();
    await expect(page.getByText('The last 50')).toBeVisible();
    // No whole address ever reaches the page.
    await expect(page.getByText(/[a-z]{3,}@irca\.local/)).toHaveCount(0);
  });

  test('the church settings and the registration keys', async ({ page }) => {
    await signIn(page, DEV);
    await page.getByRole('link', { name: 'Settings', exact: true }).click();

    await page.getByRole('button', { name: 'Edit' }).click();
    const drawer = page.getByRole('dialog');
    await drawer.getByLabel('Timezone').fill('Mars/Olympus');
    await drawer.getByRole('button', { name: 'Save' }).click();
    await expect(drawer.getByText(/not a timezone/).first()).toBeVisible();
    await drawer.getByLabel('Timezone').fill('Africa/Dar_es_Salaam');
    await drawer.getByLabel('Name').fill('IRCA, renamed for a moment');
    await drawer.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('IRCA, renamed for a moment')).toBeVisible();
    // Put it back, so other journeys read the name they expect.
    await page.getByRole('button', { name: 'Edit' }).click();
    await drawer.getByLabel('Name').fill('International Revival Church Arusha');
    await drawer.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('International Revival Church Arusha')).toBeVisible();

    // Named for this run: the test database keeps the keys earlier runs made.
    const name = `Made by a browser test ${Date.now()}`;
    await page.getByRole('button', { name: '+ New key' }).click();
    await page.getByRole('dialog').getByLabel('Name').fill(name);
    await page.getByRole('button', { name: 'Make the key' }).click();
    await expect(page.getByText('Copy this key now. It is not shown again.')).toBeVisible();
    await page.getByRole('button', { name: 'I have copied it' }).click();
    const row = page.getByRole('row', { name: new RegExp(name) });
    await row.getByRole('button', { name: 'Revoke' }).click();
    await page.getByRole('button', { name: 'Revoke it' }).click();
    await expect(row.getByText('Revoked')).toBeVisible();
  });

  test('the dev console is not for an ordinary administrator', async ({ page }) => {
    await signIn(page, { email: 'admin@irca.local', password: 'admin-password-123' });
    await expect(page.getByRole('link', { name: 'Health', exact: true })).toHaveCount(0);
    await page.goto('/dev');
    await expect(page.getByText("You don't have access to the health page")).toBeVisible();
  });
});

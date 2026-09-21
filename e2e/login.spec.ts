import { expect, test } from '@playwright/test';

const ADMIN = { email: 'admin@irca.local', password: 'admin-password-123' };

test.describe('signing in', () => {
  test('a wrong password says so, keeps the email and clears the password', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(ADMIN.email);
    await page.getByLabel('Password').fill('not the password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Next adds its own, empty role="alert" route announcer, so look for ours by its words.
    await expect(
      page.getByRole('alert').filter({ hasText: 'Email or password is incorrect.' }),
    ).toBeVisible();
    await expect(page.getByLabel('Email')).toHaveValue(ADMIN.email);
    await expect(page.getByLabel('Password')).toHaveValue('');
    await expect(page.getByLabel('Password')).toBeFocused();
  });

  test('the right password lands home, and signing out returns to sign-in', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login\?next=%2F$/);
    // The design opens in dark.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.getByLabel('Email').fill(ADMIN.email);
    await page.getByLabel('Password').fill(ADMIN.password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText('IRCA Admin', { exact: true })).toBeVisible();
    await expect(page.getByText('Working in International Revival Church Arusha')).toBeVisible();

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });

  test('a deep link survives signing in', async ({ page }) => {
    await page.goto('/?from=deep-link');
    await page.getByLabel('Email').fill(ADMIN.email);
    await page.getByLabel('Password').fill(ADMIN.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/\?from=deep-link$/);
  });

  test('a next link to another site is ignored', async ({ page }) => {
    await page.goto('/login?next=//evil.example');
    await page.getByLabel('Email').fill(ADMIN.email);
    await page.getByLabel('Password').fill(ADMIN.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('IRCA Admin', { exact: true })).toBeVisible();
    expect(new URL(page.url()).host).toBe('localhost:3100');
  });
});

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
    // It opens in light, and remembers dark for whoever switches to it.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.getByLabel('Email').fill(ADMIN.email);
    await page.getByLabel('Password').fill(ADMIN.password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Home is whatever the person's first portal opens on.
    await expect(page.getByRole('navigation', { name: 'Portals' })).toBeVisible();
    await expect(page.getByRole('button', { name: /IRCA Admin/ })).toBeVisible();

    await page.getByRole('button', { name: /IRCA Admin/ }).click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });

  test('a deep link survives signing in', async ({ page }) => {
    await page.goto('/admin/roles?from=deep-link');
    await page.getByLabel('Email').fill(ADMIN.email);
    await page.getByLabel('Password').fill(ADMIN.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/admin\/roles\?from=deep-link$/);
  });

  test('a next link to another site is ignored', async ({ page }) => {
    await page.goto('/login?next=//evil.example');
    await page.getByLabel('Email').fill(ADMIN.email);
    await page.getByLabel('Password').fill(ADMIN.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('navigation', { name: 'Portals' })).toBeVisible();
    expect(new URL(page.url()).host).toBe('localhost:3100');
  });
});

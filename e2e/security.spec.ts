import { expect, test } from '@playwright/test';

const ADMIN = { email: 'admin@irca.local', password: 'admin-password-123' };
const FORM = 'http://localhost:3101';

test.describe('what a browser is allowed to do', () => {
  test('the portal sets a nonce policy, and the page still runs under it', async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (message) => {
      if (/Content Security Policy|Refused to/i.test(message.text()))
        violations.push(message.text());
    });

    const response = await page.goto('/login');
    const headers = response!.headers();
    expect(headers['content-security-policy']).toMatch(
      /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/,
    );
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['strict-transport-security']).toBe('max-age=63072000; includeSubDomains');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-powered-by']).toBeUndefined();

    // Signing in works, so the scripts the policy allowed are the ones the
    // page needs: a broken nonce would leave the form dead.
    await page.getByLabel('Email').fill(ADMIN.email);
    await page.getByLabel('Password').fill(ADMIN.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('navigation', { name: 'Portals' })).toBeVisible();
    expect(violations).toEqual([]);
  });

  test('a page whose address is a secret sends no referrer', async ({ page }) => {
    const reset = await page.goto('/reset-password?token=whatever');
    expect(reset!.headers()['referrer-policy']).toBe('no-referrer');

    const form = await page.goto(`${FORM}/`);
    expect(form!.headers()['content-security-policy']).toContain("object-src 'none'");
    expect(form!.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  test('the registration form runs under its own policy', async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (message) => {
      if (/Content Security Policy|Refused to/i.test(message.text()))
        violations.push(message.text());
    });
    await page.goto(`${FORM}/`);
    await page.getByRole('button', { name: /English/ }).click();
    await expect(page).toHaveURL(new RegExp(`${FORM}/r/`));
    expect(page.url()).toContain('/r/');
    expect(violations).toEqual([]);
  });
});

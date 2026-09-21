import { expect, test, type Page } from '@playwright/test';

const FORM = 'http://localhost:3101';
const API = 'http://localhost:4100/v1/public/registrations';
const FORM_KEY = 'irk_local_registration_form_key_not_for_production';
const PASTOR = { email: 'pastor@irca.local', password: 'pastor-password-123' };
const FOLLOW_UP = { email: 'followup@irca.local', password: 'followup-password-123' };

async function signIn(page: Page, who: { email: string; password: string }) {
  await page.goto('/login');
  await page.getByLabel(/Email/).fill(who.email);
  await page.getByLabel(/Password/).fill(who.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('navigation', { name: 'Portals' })).toBeVisible();
}

test.describe('from the registration form to the Membership portal', () => {
  // The second journey looks at the person the first one registered.
  test.describe.configure({ mode: 'serial' });
  // A name and number nobody else in the shared test database has.
  const stamp = Date.now().toString().slice(-6);
  const name = `Visitor ${stamp}`;
  const phone = `71${stamp}0`;
  const prayer = `Please pray for my exams ${stamp}`;

  test('a visitor registers, and the pastor finds them and reads their prayer', async ({
    page,
    browser,
    request,
  }) => {
    // The visitor, on the form itself, which now talks to the API.
    const phoneCtx = await browser.newContext({ viewport: { width: 400, height: 860 } });
    const visitor = await phoneCtx.newPage();
    await visitor.goto(FORM);
    await visitor.getByRole('button', { name: /^English/ }).click();
    await visitor.waitForURL(/\/r\/[a-f0-9]{32}\/who/);
    const token = /\/r\/([a-f0-9]{32})\//.exec(visitor.url())![1]!;

    // Typing the name is saved by the form's own autosave, through the API.
    await visitor.getByLabel(/full name/i).fill(name);
    await expect
      .poll(
        async () =>
          (
            await (
              await request.get(`${API}/${token}`, {
                headers: { authorization: `Bearer ${FORM_KEY}`, 'x-irca-client': 'registration' },
              })
            ).json()
          ).values.fullname,
        { timeout: 15_000 },
      )
      .toBe(name);
    await phoneCtx.close();

    // The rest of the form, through the API the form uses.
    const headers = {
      authorization: `Bearer ${FORM_KEY}`,
      'x-irca-client': 'registration',
      'content-type': 'application/json',
    };
    for (const [step, draft] of [
      [
        'who',
        {
          fullname: name,
          gender: 'Female',
          age: '19–35',
          occ: 'Professional',
          dialCc: 'TZ',
          dial: '+255',
          phone,
        },
      ],
      ['heard', { heard: ['A friend'], friendName: 'Joyce' }],
      [
        'visit',
        { visit: ['First time visitor'], where: 'arusha', ward: 'Njiro', often: 'Every week' },
      ],
      ['prayer', { liked: 'The singing', wantMore: true, interest: ['Salvation'], prayer }],
    ] as const) {
      const res = await request.post(`${API}/${token}/steps/${step}`, { headers, data: { draft } });
      expect((await res.json()).ok).toBe(true);
    }

    // The pastor finds them as they type, opens the row, and reads the prayer.
    await signIn(page, PASTOR);
    await page.getByRole('link', { name: 'Members' }).click();
    await page.getByPlaceholder('Search name or phone…').fill(name);
    const row = page.getByRole('button', { name: `Open ${name}` });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.click();
    await expect(page.getByRole('heading', { name: 'Prayer request' })).toBeVisible();
    await expect(page.getByText(prayer)).toBeVisible();
  });

  test('the follow-up team sees the same person with no prayer request', async ({ page }) => {
    await signIn(page, FOLLOW_UP);
    await page.goto('/membership/people');
    await page.getByPlaceholder('Search name or phone…').fill(name);
    const row = page.getByRole('button', { name: `Open ${name}` });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.click();

    await expect(page.getByRole('heading', { name: 'Spiritual status' })).toBeVisible();
    // Not hidden: absent. There is no section to find.
    await expect(page.getByRole('heading', { name: 'Prayer request' })).toHaveCount(0);
    await expect(page.getByText(prayer)).toHaveCount(0);
  });
});

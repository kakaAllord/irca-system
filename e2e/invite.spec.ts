import { expect, test, type APIRequestContext } from '@playwright/test';

const ADMIN = { email: 'admin@irca.local', password: 'admin-password-123' };
const NEW_PERSON = { email: `new.person.${Date.now()}@example.com`, name: 'New Person' };
const NEW_PASSWORD = 'kilimanjaro sunrise tea';

/** The link from the last email the system sent, read through the test-only endpoint. */
async function lastEmailLink(request: APIRequestContext, to: string): Promise<string> {
  await expect
    .poll(
      async () => {
        const sent = (await (await request.get('/api/test/emails')).json()) as { to: string }[];
        return sent.filter((m) => m.to === to).length;
      },
      { timeout: 30_000, message: `no email to ${to}` },
    )
    .toBeGreaterThan(0);

  const sent = (await (await request.get('/api/test/emails')).json()) as {
    to: string;
    text: string;
  }[];
  const mine = sent.filter((m) => m.to === to).at(-1)!;
  return /https?:\/\/\S+/.exec(mine.text)![0];
}

test.describe('inviting someone', () => {
  test('an invitation carries exactly the access it promised, and view-as shows it read-only', async ({
    page,
    request,
    browser,
  }) => {
    // The administrator invites them as an Auditor.
    await page.goto('/login');
    await page.getByLabel('Email').fill(ADMIN.email);
    await page.getByLabel('Password').fill(ADMIN.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('link', { name: 'People' }).click();
    await expect(page.getByRole('heading', { name: 'People' })).toBeVisible();

    await page.getByRole('button', { name: '+ Invite person' }).click();
    await page.getByLabel('Email').last().fill(NEW_PERSON.email);
    await page.getByLabel('Full name').fill(NEW_PERSON.name);
    await page.getByRole('checkbox', { name: /Auditor/ }).check();
    await page.getByRole('button', { name: 'Send invitation' }).click();
    await expect(page.getByText(NEW_PERSON.email)).toBeVisible();

    // They follow the link in a browser of their own and choose a password.
    const link = await lastEmailLink(request, NEW_PERSON.email);
    const theirs = await browser.newContext();
    const theirPage = await theirs.newPage();
    await theirPage.goto(link);
    await expect(theirPage.getByRole('heading', { name: /Welcome/ })).toBeVisible();
    await theirPage.getByLabel('Choose a password').fill(NEW_PASSWORD);
    await theirPage.getByLabel('Type it again').fill(NEW_PASSWORD);
    await theirPage.getByRole('button', { name: 'Set password and sign in' }).click();

    // They land in the portal with what an Auditor may do, and nothing more.
    await expect(theirPage.getByRole('link', { name: 'People' })).toBeVisible();
    await expect(theirPage.getByRole('button', { name: '+ Invite person' })).toHaveCount(0);

    // The administrator views as them: the same pages, with no buttons.
    await page.goto('/admin/users');
    await page.getByPlaceholder('Search name or email…').fill(NEW_PERSON.email);
    // Filtering is debounced and re-rendered on the server, so wait for the row.
    // By email: earlier runs may have left other people with the same name.
    const theirRow = page.getByRole('link', { name: new RegExp(NEW_PERSON.email) });
    await expect(theirRow).toBeVisible({ timeout: 15_000 });
    await theirRow.click();
    await page.getByRole('button', { name: /^View as/ }).click();
    // Exactly, because Next's route announcer repeats the page's title.
    await expect(page.getByText(`Viewing as ${NEW_PERSON.name}`, { exact: true })).toBeVisible();
    await page.goto('/admin/users');
    await expect(page.getByRole('button', { name: '+ Invite person' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Stop viewing' }).click();
    await expect(page.getByText(/Viewing as/)).toHaveCount(0);

    // Nothing tells the person they were viewed as.
    await theirPage.goto('/account');
    await expect(theirPage.getByRole('heading', { name: 'Account' })).toBeVisible();
    await expect(theirPage.getByText(/view|Viewed/i)).toHaveCount(0);

    await theirs.close();
  });
});

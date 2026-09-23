import { expect, test, type Page } from '@playwright/test';

const CLERK = { email: 'clerk@irca.local', password: 'clerk-password-123' };
const MANAGER = { email: 'mhazini@irca.local', password: 'manager-password-123' };
const ADMIN = { email: 'admin@irca.local', password: 'admin-password-123' };
const PASTOR = { email: 'pastor@irca.local', password: 'pastor-password-123' };

async function signIn(page: Page, who: { email: string; password: string }) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('navigation', { name: 'Portals' })).toBeVisible();
}

/** A name nothing else in the database uses, so runs cannot collide. */
const unique = (prefix: string) => `${prefix} ${Date.now().toString().slice(-6)}`;

/**
 * Types a name into the item field and creates it.
 *
 * Runs share a database, so by the second run the name is close to the last
 * run's and the near-duplicate guard asks about it. That is the guard working:
 * the answer here is that this one really is different.
 */
async function createItem(page: Page, field: string, name: string) {
  await page.getByRole('combobox', { name: field }).fill(name);
  await page.getByRole('button', { name: /Create expense item|Create income source/ }).click();
  await page.getByRole('button', { name: 'Create and use' }).click();

  // While a dialog is open the field behind it is out of reach, so this waits
  // for whichever comes back: the field filled in, or the question to answer.
  const different = page.getByRole('button', { name: /is different/ });
  await expect
    .poll(
      async () => {
        if (await different.isVisible().catch(() => false)) await different.click();
        return page
          .getByRole('combobox', { name: field })
          .inputValue({ timeout: 1000 })
          .catch(() => null);
      },
      { timeout: 20_000, message: `${name} was never selected` },
    )
    .toBe(name);
}

test.describe('recording money', () => {
  test('a clerk records an expense, creating the item on the way', async ({ page }) => {
    const item = unique('Generator fuel');
    await signIn(page, CLERK);

    await page.getByRole('link', { name: 'Transactions' }).click();
    await page.getByRole('button', { name: '+ Record expense' }).click();
    // The form is the right-hand drawer, as every other form in the portal is.
    await expect(page.getByRole('dialog')).toContainText('Record an expense');

    // Typing a name nothing matches offers to create it, without leaving the form.
    await createItem(page, 'Expense item', item);

    await page.getByLabel(/^Amount/).fill('150000');
    await page.getByText('Cash', { exact: true }).click();
    await page.getByLabel('Paid to').fill('Total Energies Njiro');
    await page.getByRole('button', { name: 'Save expense' }).click();

    await expect(page.getByText(/Saved as IRCA-EXP-\d{4}-\d{2}-\d{6}/)).toBeVisible();
  });

  test('someone without the permission is offered no way to add an item', async ({ page }) => {
    // The clerk may create items; the viewer role in this church may not, and
    // an administrator without a finance role cannot open the page at all.
    await signIn(page, ADMIN);
    await page.goto('/finance/transactions/new?kind=expense');
    await expect(page.getByText("You don't have access to")).toBeVisible();
  });

  test('a manager asks for a void and an administrator approves it', async ({ page, browser }) => {
    const item = unique('Church tent hire');
    await signIn(page, MANAGER);

    // Record something to void.
    await page.goto('/finance/transactions/new?kind=expense');
    await createItem(page, 'Expense item', item);
    await page.getByLabel(/^Amount/).fill('86500');
    await page.getByRole('button', { name: 'Save expense' }).click();

    const saved = await page.getByText(/Saved as IRCA-EXP-\d{4}-\d{2}-\d{6}/).textContent();
    const code = /IRCA-EXP-\d{4}-\d{2}-\d{6}/.exec(saved ?? '')![0];

    await page.goto(`/finance/transactions/${code}`);
    await page.getByRole('button', { name: /Request a change/ }).click();
    await page.getByRole('menuitem', { name: 'Void this entry' }).click();
    await page.getByLabel('Why?').fill('Entered twice — duplicate receipt');
    await page.getByRole('button', { name: 'Send request' }).click();
    await expect(page.getByText('A change is already waiting for approval.')).toBeVisible();

    // Nothing has changed yet: the entry is still posted.
    await page.reload();
    await expect(page.getByText('Posted')).toBeVisible();

    // An administrator decides it. The manager could not, even as an admin:
    // nobody approves their own request.
    const theirs = await browser.newContext();
    const adminPage = await theirs.newPage();
    await signIn(adminPage, PASTOR);
    await adminPage.getByRole('link', { name: 'Requests' }).first().click();
    await expect(adminPage.getByText(code)).toBeVisible();
    await adminPage.getByRole('button', { name: 'Approve' }).first().click();
    await adminPage.getByRole('button', { name: 'Approve', exact: true }).last().click();
    await expect(adminPage.getByText(code)).toHaveCount(0);
    await theirs.close();

    await page.reload();
    await expect(page.getByText('Voided', { exact: true })).toBeVisible();
    await expect(page.getByText(/Entered twice/).first()).toBeVisible();
  });

  test('viewing as a clerk shows the books with no way to change them', async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto('/admin/users');
    await page.getByPlaceholder('Search name or email…').fill(CLERK.email);
    const row = page.getByRole('link', { name: new RegExp(CLERK.email) });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.click();
    await page.getByRole('button', { name: /^View as/ }).click();
    await expect(page.getByText('Viewing as Neema Mollel', { exact: true })).toBeVisible();

    await page.goto('/finance/transactions');
    await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Record expense' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '+ Record income' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Stop viewing' }).click();
    await expect(page.getByText('Viewing as Neema Mollel', { exact: true })).toHaveCount(0);
  });
});

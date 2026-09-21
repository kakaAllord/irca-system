import { expect, test } from '@playwright/test';

const DEV = { email: 'dev@irca.local', password: 'dev-password-123' };
const ADMIN = { email: 'admin@irca.local', password: 'admin-password-123' };

async function signIn(page: import('@playwright/test').Page, who: typeof DEV) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('navigation', { name: 'Portals' })).toBeVisible();
}

test.describe('the dev console', () => {
  test('a dev sees every church, and opens one', async ({ page }) => {
    await signIn(page, DEV);
    await page.getByRole('link', { name: 'Churches' }).click();
    await expect(page.getByRole('heading', { name: 'Churches', level: 1 })).toBeVisible();

    // Both seeded churches are there, with their numbers.
    await expect(page.getByRole('link', { name: /IRCA/ }).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: /TEST/ }).first()).toBeVisible();

    await page
      .getByRole('link', { name: /Iringa|IRCA/ })
      .first()
      .click();
    await expect(page.getByRole('navigation', { name: 'This church' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Who runs it' })).toBeVisible();

    // The tabs are pages of their own, and each one loads.
    for (const tab of ['Usage', 'Database', 'People', 'Activity', 'Keys']) {
      await page.getByRole('link', { name: tab, exact: true }).click();
      await expect(page.getByRole('link', { name: tab, exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );
    }
  });

  test('the view-as log answers typed commands, and refuses what it does not know', async ({
    page,
  }) => {
    await signIn(page, DEV);
    await page.getByRole('link', { name: 'View-as log' }).click();

    const field = page.getByLabel('Command');
    await field.fill('help');
    await field.press('Enter');
    await expect(page.getByText('who viewed as whom, newest first')).toBeVisible();

    await field.fill('churches');
    await field.press('Enter');
    await expect(page.getByText(/IRCA/).first()).toBeVisible();

    await field.fill('log --since=30d');
    await field.press('Enter');
    await expect(page.getByText(/Nobody viewed as anybody|Type export to save them/)).toBeVisible();

    await field.fill('sudo rm -rf /');
    await field.press('Enter');
    await expect(page.getByText('"sudo" is not a command. Type help.')).toBeVisible();

    // The last thing typed comes back on the up arrow.
    await field.press('ArrowUp');
    await expect(field).toHaveValue('sudo rm -rf /');
  });

  test('health is there, and none of it is for a church administrator', async ({ page }) => {
    await signIn(page, DEV);
    await page.getByRole('link', { name: 'Health' }).click();
    await expect(page.getByRole('heading', { name: 'Health', level: 1 })).toBeVisible();
    await expect(page.getByText('Database', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: /Dev Account/ }).click();
    await page.getByRole('button', { name: 'Sign out' }).click();

    await signIn(page, ADMIN);
    await expect(page.getByRole('link', { name: 'Churches' })).toHaveCount(0);
    await page.goto('/platform');
    await expect(page.getByText("You don't have access to the dev console")).toBeVisible();
  });
  test('setting up a church invites its administrator, and pausing it says why', async ({
    page,
  }) => {
    await signIn(page, DEV);
    await page.goto('/platform');
    await page.getByRole('button', { name: '+ New church' }).click();

    // Nothing is filled in, so the button says what it is waiting for.
    const submit = page.getByRole('button', { name: 'Set up church' });
    await expect(submit).toBeDisabled();
    await expect(page.getByTitle(/Still needed: Church name/)).toBeVisible();

    // A code and a web address are suggested from the name.
    const suffix = Date.now().toString().slice(-5);
    await page.getByLabel('Church name').fill(`Mbeya ${suffix}`);
    await expect(page.getByLabel('Code')).toHaveValue(`MBEYA${suffix.slice(0, 3)}`);
    await expect(page.getByLabel('Web address')).toHaveValue(`mbeya-${suffix}`);
    // A suggestion, not a decision: it can be typed over.
    await page.getByLabel('Code').fill(`MB${suffix}`);

    await page.getByLabel('Full name').fill('Pastor Joel');
    await page.getByLabel('Email').fill(`joel${suffix}@example.com`);
    await expect(submit).toBeEnabled();
    await submit.click();

    // It lands on the new church, with its administrator invited.
    await expect(page.getByRole('heading', { name: `Mbeya ${suffix}` })).toBeVisible();
    await expect(page.getByText(`joel${suffix}@example.com`)).toBeVisible();
    await expect(page.getByText('Invited')).toBeVisible();

    await page.getByRole('button', { name: 'Pause this church' }).click();
    const pause = page.getByRole('button', { name: 'Pause it' });
    await expect(pause).toBeDisabled();
    await page.getByLabel('Why').fill('Testing the pause');
    await pause.click();
    await expect(page.getByText('Paused', { exact: true })).toBeVisible();

    // And the church hears about it in its own log.
    await page.getByRole('link', { name: 'Activity', exact: true }).click();
    await expect(page.getByText(/Paused Mbeya .*: Testing the pause/)).toBeVisible();
  });
});

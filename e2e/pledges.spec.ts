import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { config } from 'dotenv';
import pg from 'pg';

config({ path: 'apps/api/.env.test', quiet: true });

const CLERK = { email: 'clerk@irca.local', password: 'clerk-password-123' };
const MANAGER = { email: 'mhazini@irca.local', password: 'manager-password-123' };
const PASTOR = { email: 'pastor@irca.local', password: 'pastor-password-123' };

async function signIn(page: Page, who: { email: string; password: string }) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('navigation', { name: 'Portals' })).toBeVisible();
}

/** Clicks until the drawer it opens is there: a click before hydration opens nothing. */
async function open(page: Page, button: string, title: string | RegExp) {
  await expect(async () => {
    await page.getByRole('button', { name: button }).first().click();
    await expect(page.getByRole('dialog')).toContainText(title, { timeout: 1_000 });
  }).toPass();
}

/**
 * The finance manager opens a campaign and records a promise; a clerk records
 * the money without ever seeing the list of who owes; the pastor reads what
 * is left and can change nothing (09 step 9.2).
 */
test('a pledge, promised and paid in part', async ({ browser }) => {
  // Runs share a database: a person and a campaign of this run's own.
  const stamp = Date.now().toString().slice(-6);
  const person = `Rehema Pledger ${stamp}`;
  const campaign = `Ujenzi ${stamp}`;
  const db = new pg.Client({ connectionString: process.env.DIRECT_DATABASE_URL });
  await db.connect();
  await db.query(
    `insert into people (id, full_name, dial, phone, source, updated_at)
     values ($1, $2, '+255', $3, 'OFFICE', now())`,
    [randomUUID(), person, `75${stamp}2`],
  );
  await db.end();

  const manager = await browser.newPage();
  await signIn(manager, MANAGER);
  await manager.getByRole('link', { name: 'Pledges' }).click();
  await open(manager, '+ New campaign', 'A new campaign');
  await manager.getByLabel('Name').fill(campaign);
  await manager.getByLabel('Target (optional)').fill('10,000,000');
  await manager.getByRole('button', { name: 'Open it' }).click();
  await expect(manager.getByRole('heading', { name: campaign })).toBeVisible();
  const campaignUrl = manager.url();

  await open(manager, '+ Record a pledge', `A pledge towards ${campaign}`);
  await manager.getByLabel('Who').fill(person);
  await manager.getByRole('button', { name: new RegExp(person) }).click();
  await manager.getByLabel('Amount promised').fill('200,000');
  await manager.getByRole('button', { name: 'Record it' }).click();
  await expect(manager.getByRole('link', { name: person })).toBeVisible();

  // The clerk sees the totals, not the names, and finds the one person paying.
  const clerk = await browser.newPage();
  await signIn(clerk, CLERK);
  await clerk.goto(campaignUrl);
  await expect(clerk.getByText('Who pledged, and what each person owes, is kept')).toBeVisible();
  await expect(clerk.getByText(person)).toHaveCount(0);
  await open(clerk, '+ Record a payment', 'A payment towards a pledge');
  await clerk.getByLabel('Whose pledge').fill(`Pledger ${stamp}`);
  await clerk.getByRole('button', { name: new RegExp(`${person} · ${campaign}`) }).click();
  await clerk.getByLabel('Amount').fill('50,000');
  await clerk.getByRole('button', { name: 'Record payment' }).click();
  await expect(
    clerk.getByText(`Recorded. TZS 150,000 is left on ${person}'s pledge towards ${campaign}.`),
  ).toBeVisible();

  // The pastor reads what is left, and is offered nothing to change it.
  const pastor = await browser.newPage();
  await signIn(pastor, PASTOR);
  await pastor.goto(campaignUrl);
  const row = pastor.getByRole('row', { name: new RegExp(person) });
  await expect(row).toContainText('150,000');
  await expect(pastor.getByRole('button', { name: '+ Record a pledge' })).toHaveCount(0);
  await expect(pastor.getByRole('button', { name: '+ Record a payment' })).toHaveCount(0);
});

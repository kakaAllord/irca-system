import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { config } from 'dotenv';
import pg from 'pg';

config({ path: 'apps/api/.env.test', quiet: true });

const API = 'http://localhost:4100/v1';
const ADMIN = { email: 'admin@irca.local', password: 'admin-password-123' };
const COMMS = { email: 'comms@irca.local', password: 'comms-password-123' };

async function signIn(page: Page, who: { email: string; password: string }) {
  await page.goto('/login');
  await page.getByLabel(/Email/).fill(who.email);
  await page.getByLabel(/Password/).fill(who.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('navigation', { name: 'Portals' })).toBeVisible();
}

/** A write as the portal makes it, with the session the page holds. */
const write = (request: APIRequestContext, method: 'post' | 'put', path: string, data: object) =>
  request[method](`/api${path}`, { data, headers: { 'x-irca-client': 'portal' } });

/**
 * A department's leader sends their department a message, end to end
 * (07 step 7.15): the words approved by Communications, the count and the
 * cost shown before sending, the texts going out, and a STOP honoured on the
 * next send.
 */
test('a leader messages their department, and a STOP is honoured on the next send', async ({
  browser,
  request,
}) => {
  test.setTimeout(120_000);
  // Names and numbers nobody else in the shared test database has.
  const stamp = Date.now().toString().slice(-6);
  const phones = [`71${stamp}1`, `71${stamp}2`];
  const db = new pg.Client({ connectionString: process.env.DIRECT_DATABASE_URL });
  await db.connect();
  // Only what the pages cannot make in a minute: a confirmed member to lead,
  // and two people in People. Everything else goes through the portal.
  const leaderPerson = randomUUID();
  await db.query(
    `insert into people (id, full_name, dial, phone, email, stage, lang, updated_at)
     values ($1, $2, '+255', $3, $4, 'CONFIRMED_MEMBER', 'en', now())`,
    [leaderPerson, `Rehema Leader ${stamp}`, `71${stamp}9`, `leader${stamp}@example.com`],
  );
  const members = [randomUUID(), randomUUID()];
  for (const [i, id] of members.entries()) {
    await db.query(
      `insert into people (id, full_name, dial, phone, stage, lang, updated_at)
       values ($1, $2, '+255', $3, 'VISITOR', 'en', now())`,
      [id, `Singer ${i + 1} ${stamp}`, phones[i]],
    );
  }
  await db.query(
    `insert into settings (key, value, updated_at) values ('comms.dailyCap', '"100000"', now()), ('comms.pricePerSegment', '"30"', now())
     on conflict (key) do update set value = excluded.value`,
  );
  await db.end();

  // An administrator makes the department and names its leader.
  const adminPage = await browser.newPage();
  await signIn(adminPage, ADMIN);
  const made = await write(adminPage.request, 'post', '/admin/departments', {
    name: `Choir ${stamp}`,
  });
  expect(made.status()).toBe(201);
  const { id: departmentId } = (await made.json()) as { id: string };
  await request.delete(`${API}/test/emails`);
  const named = await write(
    adminPage.request,
    'post',
    `/admin/departments/${departmentId}/leaders`,
    {
      personId: leaderPerson,
      title: 'Chairperson',
    },
  );
  expect(named.status()).toBe(201);

  // The leader accepts the invitation from the email.
  let link = '';
  await expect
    .poll(
      async () => {
        const sent = (await (await request.get(`${API}/test/emails`)).json()) as {
          to: string;
          text: string;
        }[];
        link =
          /https?:\/\/\S+/.exec(
            sent.find((e) => e.to === `leader${stamp}@example.com`)?.text ?? '',
          )?.[0] ?? '';
        return link;
      },
      { timeout: 30_000 },
    )
    .not.toBe('');
  const leader = await browser.newPage();
  await leader.goto(new URL(link).pathname + new URL(link).search);
  await leader.getByLabel('Choose a password').fill('kilimanjaro sunrise tea');
  await leader.getByLabel('Type it again').fill('kilimanjaro sunrise tea');
  await leader.getByRole('button', { name: 'Set password and sign in' }).click();
  await expect(leader.getByRole('navigation', { name: 'Portals' })).toBeVisible();

  // The leader adds the two singers, and writes the welcome.
  for (const id of members) {
    expect(
      (
        await write(leader.request, 'post', `/departments/${departmentId}/members`, {
          personId: id,
        })
      ).status(),
    ).toBe(201);
  }
  const template = await write(leader.request, 'post', '/comms/templates', {
    departmentId,
    name: `Welcome ${stamp}`,
    bodies: { en: 'Welcome to the choir, {{first_name}}!' },
  });
  const { id: templateId } = (await template.json()) as { id: string };
  expect(
    (await write(leader.request, 'post', `/comms/templates/${templateId}/submit`, {})).status(),
  ).toBe(204);

  // Communications approves it, once.
  const comms = await browser.newPage();
  await signIn(comms, COMMS);
  expect(
    (await write(comms.request, 'post', `/comms/templates/${templateId}/approve`, {})).status(),
  ).toBe(204);

  // The leader sends it from their department's Messages page.
  await leader.goto(`/departments/${departmentId}/messages`);
  await leader.getByLabel('Who it goes to').selectOption('departments.everyone');
  await leader.getByLabel('Template').selectOption({ label: `Welcome ${stamp}` });
  const send = leader.getByRole('button', { name: 'Send to 3 people · about 90 TZS' });
  await expect(send).toBeVisible();
  await expect(leader.getByText('1 segment each')).toBeVisible();
  await send.click();
  await leader.getByRole('button', { name: 'Send it' }).click();
  await leader.waitForURL(/\/messages\/[0-9a-f-]{36}$/);

  // The outbox sends every fifteen seconds.
  await expect
    .poll(
      async () => {
        await leader.reload();
        return leader.getByRole('cell', { name: /^Sent/ }).count();
      },
      { timeout: 45_000, intervals: [3_000] },
    )
    .toBe(3);

  // One singer replies STOP, as Beem would pass it on.
  const stop = await request.post(
    `${API}/public/comms/inbound?key=${process.env.BEEM_INBOUND_SECRET}`,
    {
      data: {
        from: `255${phones[0]}`,
        to: '255700000000',
        transaction_id: stamp,
        message: { text: 'STOP' },
      },
    },
  );
  expect(stop.status()).toBe(200);

  // The next message leaves them alone, and says so before anything is sent.
  await leader.goto(`/departments/${departmentId}/messages`);
  await leader.getByLabel('Who it goes to').selectOption('departments.everyone');
  await leader.getByLabel('Template').selectOption({ label: `Welcome ${stamp}` });
  await expect(
    leader.getByRole('button', { name: 'Send to 2 people · about 60 TZS' }),
  ).toBeVisible();
  await expect(leader.getByText('1 asked not to be messaged')).toBeVisible();
});

import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import { OPT_OUT, financeModule } from '@irca/shared';
import { RegistrySync } from '../src/core/rbac/registry-sync.service.js';
import {
  createApp,
  createChurch,
  createDepartment,
  createLeader,
  createPerson,
  createTemplate,
  createUserWithPermissions,
  ownerDb,
  portal,
  sessionCookie,
  setCommsSettings,
  truncateAll,
} from './helpers.js';

const MANAGER = financeModule.systemRoles.find((r) => r.key === 'finance.manager')!.permissions;

/**
 * Reminding people who still owe (09 step 9.3): Finance's leaders send to the
 * audience Communications gave them, each person once, in their own language,
 * with the way to stop, and nobody twice within a fortnight.
 */
describe('pledge reminders', () => {
  let app: NestExpressApplication;
  let db: pg.Client;

  beforeAll(async () => {
    app = await createApp();
    db = await ownerDb();
  });
  afterAll(async () => {
    await db.end();
    await app.close();
  });
  beforeEach(async () => {
    await truncateAll(db);
    await createChurch(db, 'IRCA', ['admin', 'finance', 'comms']);
    await app.get(RegistrySync).sync();
    await setCommsSettings(db, { dailyCap: null });
  });

  const signIn = async (user: { email: string; password: string }) =>
    sessionCookie(await portal(app).post('/v1/auth/login', user).expect(200));

  /**
   * Ujenzi 2027 and the bus fund. Neema owes 150,000 on Ujenzi; Paul owes on
   * both; Juma has paid in full; Anna owes and asked not to be texted; Rose
   * owes on the bus fund only; Baraka's pledge was cancelled.
   */
  async function setUp() {
    const manager = await signIn(
      await createUserWithPermissions(db, MANAGER, { moduleKey: 'finance' }),
    );
    const campaign = async (name: string) =>
      (
        await portal(app)
          .post('/v1/finance/pledge-campaigns', { name, startsOn: '2026-01-01' }, manager)
          .expect(201)
      ).body.id as string;
    const ujenzi = await campaign('Ujenzi 2027');
    const bus = await campaign('Bus fund');
    const pledge = async (
      campaignId: string,
      person: { id: string },
      amount: string,
      dueOn: string | null = null,
    ) =>
      (
        await portal(app)
          .post(
            '/v1/finance/pledges',
            {
              campaignId,
              personId: person.id,
              amount,
              rhythm: 'MONTHLY',
              promisedOn: '2026-09-01',
              dueOn,
              clientRequestId: randomUUID(),
            },
            manager,
          )
          .expect(201)
      ).body.id as string;
    const pay = (pledgeId: string, amount: string) =>
      portal(app)
        .post(
          `/v1/finance/pledges/${pledgeId}/payments`,
          { amount, paidOn: '2026-09-20', method: 'CASH', clientRequestId: randomUUID() },
          manager,
        )
        .expect(201);

    const neema = await createPerson(db, {
      fullName: 'Neema Mollel',
      lang: 'sw',
      phone: '713100001',
    });
    const paul = await createPerson(db, {
      fullName: 'Paul Laizer',
      lang: 'fr',
      phone: '713100002',
    });
    const juma = await createPerson(db, { fullName: 'Juma Kessy', lang: 'en', phone: '713100003' });
    const anna = await createPerson(db, { fullName: 'Anna Mushi', phone: '713100004' });
    await db.query(`update people set sms_opt_out = true where id = $1`, [anna.id]);
    const rose = await createPerson(db, { fullName: 'Rose Swai', lang: 'en', phone: '713100005' });
    const baraka = await createPerson(db, { fullName: 'Baraka Mushi', phone: '713100006' });

    await pay(await pledge(ujenzi, neema, '200000', '2026-10-12'), '50000');
    await pledge(ujenzi, paul, '100000', '2026-11-30');
    await pledge(bus, paul, '30000');
    await pay(await pledge(ujenzi, juma, '100000'), '100000');
    await pledge(ujenzi, anna, '50000');
    await pledge(bus, rose, '20000');
    const gone = await pledge(ujenzi, baraka, '10000');
    await portal(app)
      .post(`/v1/finance/pledges/${gone}/cancel`, { reason: 'Moved away' }, manager)
      .expect(204);

    // The Finance department, its leader, and the audience Communications gave it.
    const finance = await createDepartment(db, { name: 'Finance', moduleKey: 'finance' });
    const leader = await createLeader(db, finance.id, 'Treasurer');
    const leaderCookie = await signIn(leader);
    return { ujenzi, bus, finance, leaderCookie, people: { neema, paul, juma, anna, rose } };
  }

  const grant = (departmentId: string) =>
    db.query(
      `insert into comms_audience_grants (department_id, audience_key) values ($1, 'finance.pledge_outstanding')`,
      [departmentId],
    );
  const owing = (campaignId?: string) => ({
    key: 'finance.pledge_outstanding',
    params: campaignId ? { campaignId } : {},
  });

  it('is sent by Finance only once Communications gives it the audience', async () => {
    const { finance, leaderCookie, ujenzi } = await setUp();
    const template = await createTemplate(db, {
      departmentId: finance.id,
      bodies: { sw: 'Salamu {{first_name}}, tunakukumbusha ahadi yako ya {{campaign_name}}.' },
    });
    const body = { departmentId: finance.id, audience: owing(ujenzi), templateId: template.id };
    const refused = await portal(app).post('/v1/comms/messages', body, leaderCookie).expect(403);
    expect(refused.body.error.message).toMatch(/has not been given "People who still owe/);
    await grant(finance.id);
    await portal(app).post('/v1/comms/messages', body, leaderCookie).expect(201);
  });

  it('reaches only those who still owe and did not opt out, once each, in their language, with the way to stop', async () => {
    const { finance, leaderCookie, people } = await setUp();
    await grant(finance.id);
    // The leadership's default: no figure.
    const template = await createTemplate(db, {
      departmentId: finance.id,
      bodies: {
        sw: 'Salamu {{first_name}}, tunakukumbusha ahadi yako ya {{campaign_name}}. Karibu ofisini kwa maelezo.',
        en: 'Hello {{first_name}}, a reminder of your pledge to {{campaign_name}}. Please see the office.',
      },
    });
    const sent = await portal(app)
      .post(
        '/v1/comms/messages',
        { departmentId: finance.id, audience: owing(), templateId: template.id },
        leaderCookie,
      )
      .expect(201);

    const { rows } = await db.query<{ person_id: string; status: string; body: string }>(
      `select person_id, status, body from comms_recipients where message_id = $1`,
      [sent.body.id],
    );
    const byPerson = new Map(rows.map((r) => [r.person_id, r]));
    // Paul owes on two campaigns and gets one text; Juma paid, Baraka cancelled.
    expect(rows).toHaveLength(4);
    expect(byPerson.has(people.juma.id)).toBe(false);
    expect(byPerson.get(people.anna.id)!.status).toBe('SKIPPED_OPT_OUT');
    expect(byPerson.get(people.neema.id)!.body).toBe(
      `Salamu Neema, tunakukumbusha ahadi yako ya Ujenzi 2027. Karibu ofisini kwa maelezo. ${OPT_OUT.sw}`,
    );
    // Paul is reminded about the pledge due soonest.
    expect(byPerson.get(people.paul.id)!.body).toContain('Ujenzi 2027');
    expect(byPerson.get(people.rose.id)!.body).toBe(
      `Hello Rose, a reminder of your pledge to Bus fund. Please see the office. ${OPT_OUT.en}`,
    );
    for (const r of rows.filter((r) => r.status === 'PENDING')) {
      expect(r.body).toMatch(/Jibu ACHA|Reply STOP|Répondez STOP/);
      expect(r.body).not.toMatch(/\d{2},\d{3}|TZS/);
    }
  });

  it('says the figure exactly, when an approved template asks for it', async () => {
    const { finance, leaderCookie, ujenzi, people } = await setUp();
    await grant(finance.id);
    const template = await createTemplate(db, {
      departmentId: finance.id,
      bodies: {
        sw: 'Salamu {{first_name}}, bado {{balance}} kati ya {{amount}} kwa {{campaign_name}}, hadi {{due_date}}.',
      },
    });
    const preview = await portal(app)
      .post(
        '/v1/comms/messages/preview',
        { departmentId: finance.id, audience: owing(ujenzi), templateId: template.id },
        leaderCookie,
      )
      .expect(200);
    expect(preview.body.audienceName).toBe('People who still owe on Ujenzi 2027');
    const sent = await portal(app)
      .post(
        '/v1/comms/messages',
        { departmentId: finance.id, audience: owing(ujenzi), templateId: template.id },
        leaderCookie,
      )
      .expect(201);
    const { rows } = await db.query<{ body: string }>(
      `select body from comms_recipients where message_id = $1 and person_id = $2`,
      [sent.body.id, people.neema.id],
    );
    expect(rows[0]!.body).toBe(
      `Salamu Neema, bado 150,000 TZS kati ya 200,000 TZS kwa Ujenzi 2027, hadi 12 Oktoba. ${OPT_OUT.sw}`,
    );
  });

  it('texts nobody twice when two campaigns remind on the same day, and counts who it skipped', async () => {
    const { finance, leaderCookie, ujenzi, bus, people } = await setUp();
    await grant(finance.id);
    const template = await createTemplate(db, {
      departmentId: finance.id,
      bodies: { sw: 'Salamu {{first_name}}, ahadi yako ya {{campaign_name}}.' },
    });
    const send = (campaignId: string) =>
      portal(app).post(
        '/v1/comms/messages',
        { departmentId: finance.id, audience: owing(campaignId), templateId: template.id },
        leaderCookie,
      );
    const first = await send(ujenzi).expect(201);
    expect(first.body.recipientCount).toBe(2); // Neema and Paul

    const second = await send(bus).expect(201);
    expect(second.body).toMatchObject({ recipientCount: 1 }); // Rose; Paul was reminded today
    const { rows } = await db.query<{ person_id: string; status: string }>(
      `select person_id, status from comms_recipients where message_id = $1`,
      [second.body.id],
    );
    expect(rows).toContainEqual({ person_id: people.paul.id, status: 'SKIPPED_RECENT' });

    // Every Ujenzi debtor was reminded today: a third send reaches nobody, and says why.
    const third = await send(ujenzi).expect(409);
    expect(third.body.error.message).toMatch(/in the last 14 days/);
  });
});

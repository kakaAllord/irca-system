import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import pg from 'pg';
import { financeModule } from '@irca/shared';
import { RegistrySync } from '../src/core/rbac/registry-sync.service.js';
import {
  createApp,
  createChurch,
  createPerson,
  createRole,
  createUser,
  createUserWithPermissions,
  grantRole,
  ownerDb,
  portal,
  sessionCookie,
  truncateAll,
} from './helpers.js';

const roleOf = (key: string) => financeModule.systemRoles.find((r) => r.key === key)!.permissions;
const MANAGER = roleOf('finance.manager');
const CLERK = roleOf('finance.clerk');
const OVERSEER = roleOf('finance.pledges_overseer');

describe('pledges: what people promised, and what they have paid', () => {
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
    await createChurch(db, 'IRCA', ['admin', 'finance', 'membership']);
    await app.get(RegistrySync).syncModuleRoles('finance');
  });

  async function as(permissions: string[]) {
    const person = await createUserWithPermissions(db, permissions, { moduleKey: 'finance' });
    const cookie = sessionCookie(
      await portal(app)
        .post('/v1/auth/login', { email: person.email, password: person.password })
        .expect(200),
    );
    return { ...person, cookie };
  }

  const campaign = async (cookie: string, body: Record<string, unknown> = {}) =>
    (
      await portal(app)
        .post(
          '/v1/finance/pledge-campaigns',
          { name: `Ujenzi ${randomUUID().slice(0, 4)}`, startsOn: '2026-01-01', ...body },
          cookie,
        )
        .expect(201)
    ).body as { id: string };

  const pledge = async (
    cookie: string,
    campaignId: string,
    personId: string,
    body: Record<string, unknown> = {},
  ) =>
    (
      await portal(app)
        .post(
          '/v1/finance/pledges',
          {
            campaignId,
            personId,
            amount: '100000',
            rhythm: 'MONTHLY',
            promisedOn: '2026-09-01',
            clientRequestId: randomUUID(),
            ...body,
          },
          cookie,
        )
        .expect(201)
    ).body as { id: string };

  const pay = (cookie: string, pledgeId: string, body: Record<string, unknown> = {}) =>
    portal(app).post(
      `/v1/finance/pledges/${pledgeId}/payments`,
      {
        amount: '10000',
        paidOn: '2026-09-20',
        method: 'CASH',
        clientRequestId: randomUUID(),
        ...body,
      },
      cookie,
    );

  it('lets a clerk record a payment for the person in front of them, never the list of who owes', async () => {
    const manager = await as(MANAGER);
    const clerk = await as(CLERK);
    const { id: campaignId } = await campaign(manager.cookie, { targetAmount: '5000000' });
    const neema = await createPerson(db, { fullName: 'Neema Pledger' });
    const { id } = await pledge(manager.cookie, campaignId, neema.id);

    // The campaign's totals are for anyone in Pledges; who owes what is not.
    const totals = await portal(app)
      .get(`/v1/finance/pledge-campaigns/${campaignId}`, clerk.cookie)
      .expect(200);
    expect(totals.body).toMatchObject({ promised: '100000.00', counts: { open: 1 } });
    await portal(app)
      .get(`/v1/finance/pledge-campaigns/${campaignId}/pledges`, clerk.cookie)
      .expect(403);
    await portal(app).get(`/v1/finance/pledges/people/${neema.id}`, clerk.cookie).expect(403);

    // The clerk finds Neema by name, and records what she brought.
    const found = await portal(app)
      .get('/v1/finance/pledges/lookup?q=pledger', clerk.cookie)
      .expect(200);
    expect(found.body).toHaveLength(1);
    expect(found.body[0]).toMatchObject({ id, balance: '100000.00' });
    const paid = await pay(clerk.cookie, id, { amount: '25,000' }).expect(201);
    expect(paid.body).toMatchObject({ status: 'OPEN', balance: '75000.00' });

    // A retried submit is the same payment.
    const clientRequestId = randomUUID();
    await pay(clerk.cookie, id, { clientRequestId }).expect(201);
    await pay(clerk.cookie, id, { clientRequestId }).expect(200);

    // The manager, and a pastor holding the overseer role, read the list.
    const overseer = await as(OVERSEER);
    const list = await portal(app)
      .get(`/v1/finance/pledge-campaigns/${campaignId}/pledges`, overseer.cookie)
      .expect(200);
    expect(list.body[0]).toMatchObject({
      person: { name: 'Neema Pledger' },
      paid: '35000.00',
      balance: '65000.00',
    });
    // The overseer changes nothing.
    await pay(overseer.cookie, id).expect(403);
    await portal(app)
      .post(`/v1/finance/pledges/${id}/cancel`, { reason: 'Moved away' }, overseer.cookie)
      .expect(403);
  });

  it('keeps the balance exactly right with ten payments at once, and completes it at zero', async () => {
    const manager = await as(MANAGER);
    const { id: campaignId } = await campaign(manager.cookie);
    const person = await createPerson(db);
    const { id } = await pledge(manager.cookie, campaignId, person.id, { amount: '100000' });

    // Twelve clerks pressing Save at the same moment, ten thousand each:
    // ten fit, and the last two find it paid in full.
    const results = await Promise.all(
      Array.from({ length: 12 }, () => pay(manager.cookie, id, { amount: '10000' })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(10);
    expect(results.filter((r) => r.status === 409)).toHaveLength(2);

    const detail = await portal(app).get(`/v1/finance/pledges/${id}`, manager.cookie).expect(200);
    expect(detail.body).toMatchObject({ status: 'COMPLETED', paid: '100000.00', balance: '0.00' });
    expect(detail.body.payments).toHaveLength(10);

    // Completed on the tenth payment, and not before.
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from pledge_payments where pledge_id = $1`,
      [id],
    );
    expect(rows[0]!.n).toBe(10);
  });

  it('counts a campaign: promised, received, what is left, and who is overdue', async () => {
    const manager = await as(MANAGER);
    const { id: campaignId } = await campaign(manager.cookie, { targetAmount: '1000000' });
    const a = await createPerson(db);
    const b = await createPerson(db);
    const c = await createPerson(db);
    const late = await pledge(manager.cookie, campaignId, a.id, {
      amount: '300000',
      dueOn: '2026-09-10',
    });
    await pledge(manager.cookie, campaignId, b.id, { amount: '200000', dueOn: '2099-01-01' });
    const gone = await pledge(manager.cookie, campaignId, c.id, { amount: '50000' });
    await pay(manager.cookie, late.id, { amount: '100000' }).expect(201);
    await pay(manager.cookie, gone.id, { amount: '20000' }).expect(201);
    await portal(app)
      .post(`/v1/finance/pledges/${gone.id}/cancel`, { reason: 'Moved away' }, manager.cookie)
      .expect(204);

    const res = await portal(app)
      .get(`/v1/finance/pledge-campaigns/${campaignId}`, manager.cookie)
      .expect(200);
    expect(res.body).toMatchObject({
      targetAmount: '1000000.00',
      // The cancelled promise is not counted; the money it brought in is.
      promised: '500000.00',
      received: '120000.00',
      outstanding: '400000.00',
      counts: { open: 2, overdue: 1, completed: 0, cancelled: 1 },
    });

    const overdue = await portal(app)
      .get(`/v1/finance/pledge-campaigns/${campaignId}/pledges?filter=overdue`, manager.cookie)
      .expect(200);
    expect(overdue.body.map((p: { id: string }) => p.id)).toEqual([late.id]);

    // A cancelled pledge takes no more money.
    await pay(manager.cookie, gone.id).expect(409);
  });

  it('takes no pledges on a closed campaign, and none dated in the future', async () => {
    const manager = await as(MANAGER);
    const { id: campaignId } = await campaign(manager.cookie);
    const person = await createPerson(db);
    await portal(app)
      .post(
        '/v1/finance/pledges',
        {
          campaignId,
          personId: person.id,
          amount: '1000',
          rhythm: 'ONE_OFF',
          promisedOn: '2099-01-01',
          clientRequestId: randomUUID(),
        },
        manager.cookie,
      )
      .expect(422);
    await portal(app)
      .patch(`/v1/finance/pledge-campaigns/${campaignId}`, { isActive: false }, manager.cookie)
      .expect(204);
    await portal(app)
      .post(
        '/v1/finance/pledges',
        {
          campaignId,
          personId: person.id,
          amount: '1000',
          rhythm: 'ONE_OFF',
          promisedOn: '2026-09-01',
          clientRequestId: randomUUID(),
        },
        manager.cookie,
      )
      .expect(409);
  });

  it('links a payment to the income entry that recorded it, never beyond what the entry holds', async () => {
    const manager = await as(MANAGER);
    const { id: campaignId } = await campaign(manager.cookie);
    const person = await createPerson(db);
    const { id } = await pledge(manager.cookie, campaignId, person.id);
    const source = (
      await portal(app)
        .post('/v1/finance/income-sources', { name: 'Pledges received' }, manager.cookie)
        .expect(201)
    ).body as { id: string };
    const entry = (
      await portal(app)
        .post(
          '/v1/finance/transactions',
          {
            kind: 'INCOME',
            incomeSourceId: source.id,
            txnDate: '2026-09-20',
            amount: '30000',
            method: 'CASH',
            clientRequestId: randomUUID(),
          },
          manager.cookie,
        )
        .expect(201)
    ).body as { id: string; code: string };

    await pay(manager.cookie, id, { amount: '20000', transactionId: entry.id }).expect(201);
    const over = await pay(manager.cookie, id, { amount: '20000', transactionId: entry.id }).expect(
      422,
    );
    expect(over.body.error.message).toContain(entry.code);
    await pay(manager.cookie, id, { amount: '10000', transactionId: entry.id }).expect(201);

    const detail = await portal(app).get(`/v1/finance/pledges/${id}`, manager.cookie).expect(200);
    expect(detail.body.payments[0].transaction).toEqual({ id: entry.id, code: entry.code });
  });

  it('writes the promise and each payment on the timeline, with no amount', async () => {
    const manager = await as(MANAGER);
    const { id: campaignId } = await campaign(manager.cookie, { name: 'Bus fund' });
    const person = await createPerson(db);
    const { id } = await pledge(manager.cookie, campaignId, person.id, { amount: '10000' });
    await pay(manager.cookie, id, { amount: '10000' }).expect(201);
    const { rows } = await db.query<{ kind: string; summary: string }>(
      `select kind, summary from person_interactions where person_id = $1 order by at, id`,
      [person.id],
    );
    expect(rows).toEqual([
      { kind: 'PLEDGE_PROMISED', summary: 'Made a pledge towards Bus fund' },
      { kind: 'PLEDGE_PAID', summary: 'Paid their pledge towards Bus fund in full' },
    ]);
  });

  it('shows pledge lines on a timeline only to those who may see pledges', async () => {
    const manager = await as(MANAGER);
    const { id: campaignId } = await campaign(manager.cookie, { name: 'Bus fund' });
    const person = await createPerson(db);
    await pledge(manager.cookie, campaignId, person.id);

    /** Someone holding a role in each portal named. */
    async function holding(roles: Record<string, string[]>) {
      const user = await createUser(db);
      for (const [moduleKey, permissions] of Object.entries(roles)) {
        const role = await createRole(db, { moduleKey, permissions });
        await grantRole(db, user.id, role.id);
      }
      return sessionCookie(
        await portal(app)
          .post('/v1/auth/login', { email: user.email, password: user.password })
          .expect(200),
      );
    }
    const office = await holding({ membership: ['membership.people.read'] });
    const pastor = await holding({
      membership: ['membership.people.read'],
      finance: OVERSEER,
    });
    const kinds = async (cookie: string) =>
      (
        await portal(app).get(`/v1/membership/people/${person.id}/timeline`, cookie).expect(200)
      ).body.map((l: { kind: string }) => l.kind);
    expect(await kinds(office)).not.toContain('PLEDGE_PROMISED');
    expect(await kinds(pastor)).toContain('PLEDGE_PROMISED');
  });

  it('never lets the application delete a pledge, a payment or a campaign, nor edit a payment', async () => {
    const manager = await as(MANAGER);
    const { id: campaignId } = await campaign(manager.cookie);
    const person = await createPerson(db);
    const { id } = await pledge(manager.cookie, campaignId, person.id);
    await pay(manager.cookie, id).expect(201);

    const appRole = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await appRole.connect();
    try {
      for (const table of ['pledge_payments', 'pledges', 'pledge_campaigns']) {
        await expect(appRole.query(`delete from ${table}`)).rejects.toThrow(/permission denied/);
      }
      await expect(appRole.query(`update pledge_payments set amount = 1`)).rejects.toThrow(
        /only change through an approved change request/,
      );
      await expect(appRole.query(`update pledges set amount = 1`)).rejects.toThrow(/never changes/);
    } finally {
      await appRole.end();
    }
  });

  describe('correcting a payment', () => {
    async function setUp() {
      const manager = await as(MANAGER);
      const clerk = await as(CLERK);
      const admin = await createUserWithPermissions(
        db,
        ['admin.requests.read', 'admin.requests.decide'],
        { moduleKey: 'admin' },
      );
      const adminCookie = sessionCookie(
        await portal(app)
          .post('/v1/auth/login', { email: admin.email, password: admin.password })
          .expect(200),
      );
      const { id: campaignId } = await campaign(manager.cookie, { name: 'Ujenzi 2027' });
      const person = await createPerson(db, { fullName: 'Juma Correction' });
      const { id } = await pledge(manager.cookie, campaignId, person.id, { amount: '50000' });
      const paid = (await pay(clerk.cookie, id, { amount: '50000' }).expect(201)).body as {
        id: string;
        status: string;
      };
      expect(paid.status).toBe('COMPLETED');
      return { clerk, adminCookie, pledgeId: id, paymentId: paid.id };
    }

    const ask = (cookie: string, paymentId: string, body: Record<string, unknown>) =>
      portal(app).post(`/v1/finance/pledge-payments/${paymentId}/change-requests`, body, cookie);

    it('applies an approved correction, and settles the pledge again', async () => {
      const { clerk, adminCookie, pledgeId, paymentId } = await setUp();
      // Five thousand was typed as fifty.
      const asked = await ask(clerk.cookie, paymentId, {
        action: 'EDIT',
        proposed: { amount: '5000' },
        reason: 'Typed an extra zero',
      }).expect(201);

      // Nothing moves until an administrator says yes.
      let detail = await portal(app)
        .get(`/v1/finance/pledges/${pledgeId}`, clerk.cookie)
        .expect(200);
      expect(detail.body).toMatchObject({ status: 'COMPLETED', balance: '0.00' });
      expect(detail.body.payments[0].openRequest).toMatchObject({ isMine: true });

      // What the administrator reads names the campaign and the amounts, not the person.
      const inbox = await portal(app)
        .get('/v1/admin/requests?status=PENDING', adminCookie)
        .expect(200);
      expect(inbox.body[0].entityLabel).toContain('Ujenzi 2027');
      expect(inbox.body[0].entityLabel).not.toContain('Juma');
      expect(inbox.body[0].changes).toEqual([
        { field: 'amount', label: 'Amount', from: '50,000', to: '5,000' },
      ]);

      await portal(app)
        .post(`/v1/admin/requests/${asked.body.id}/approve`, {}, adminCookie)
        .expect(200);
      detail = await portal(app).get(`/v1/finance/pledges/${pledgeId}`, clerk.cookie).expect(200);
      expect(detail.body).toMatchObject({ status: 'OPEN', paid: '5000.00', balance: '45000.00' });
      expect(detail.body.payments[0]).toMatchObject({ amount: '5000.00', revision: 2 });
    });

    it('voids a payment on approval, keeping it and reopening the pledge', async () => {
      const { clerk, adminCookie, pledgeId, paymentId } = await setUp();
      const asked = await ask(clerk.cookie, paymentId, {
        action: 'VOID',
        reason: 'Recorded against the wrong person',
      }).expect(201);
      await portal(app)
        .post(`/v1/admin/requests/${asked.body.id}/approve`, {}, adminCookie)
        .expect(200);

      const detail = await portal(app)
        .get(`/v1/finance/pledges/${pledgeId}`, clerk.cookie)
        .expect(200);
      expect(detail.body).toMatchObject({ status: 'OPEN', paid: '0.00', balance: '50000.00' });
      expect(detail.body.payments[0]).toMatchObject({
        status: 'VOIDED',
        voidReason: 'Recorded against the wrong person',
      });

      // Once voided, nothing more can be asked of it.
      await ask(clerk.cookie, paymentId, {
        action: 'EDIT',
        proposed: { note: 'again' },
        reason: 'One more change',
      }).expect(409);
    });

    it('refuses a correction dated in the future, or one that changes nothing', async () => {
      const { clerk, paymentId } = await setUp();
      await ask(clerk.cookie, paymentId, {
        action: 'EDIT',
        proposed: { paidOn: '2099-01-01' },
        reason: 'Wrong day',
      }).expect(422);
      await ask(clerk.cookie, paymentId, {
        action: 'EDIT',
        proposed: { amount: '50000' },
        reason: 'Same thing',
      }).expect(400);
    });
  });

  it('keeps an erased person’s pledges, without their name', async () => {
    const manager = await as(MANAGER);
    const { id: campaignId } = await campaign(manager.cookie);
    const person = await createPerson(db);
    const { id } = await pledge(manager.cookie, campaignId, person.id);
    await pay(manager.cookie, id).expect(201);

    await db.query('delete from people where id = $1', [person.id]);
    const detail = await portal(app).get(`/v1/finance/pledges/${id}`, manager.cookie).expect(200);
    expect(detail.body).toMatchObject({ person: null, paid: '10000.00' });
  });
});

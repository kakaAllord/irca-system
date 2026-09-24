import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import { financeModule } from '@irca/shared';
import { RegistrySync } from '../src/core/rbac/registry-sync.service.js';
import {
  createApp,
  createChurch,
  createUserWithPermissions,
  ownerDb,
  portal,
  sessionCookie,
  truncateAll,
} from './helpers.js';

const ALL_FINANCE = Object.keys(financeModule.permissions);

describe('the books: numbers, items and corrections', () => {
  let app: NestExpressApplication;
  let db: pg.Client;
  let registry: RegistrySync;

  beforeAll(async () => {
    app = await createApp();
    db = await ownerDb();
    registry = app.get(RegistrySync);
  });
  afterAll(async () => {
    await db.end();
    await app.close();
  });
  beforeEach(() => truncateAll(db));

  /**
   * The same app, listening on a port, for the one test that needs real
   * sockets. Started once and closed with everything else.
   */
  let url: string | null = null;
  async function listening(): Promise<string> {
    if (!url) {
      await app.listen(0);
      url = await app.getUrl();
    }
    return url.replace('[::1]', 'localhost');
  }

  const signIn = async (email: string, password: string) =>
    sessionCookie(await portal(app).post('/v1/auth/login', { email, password }).expect(200));

  /** A church running Finance, with someone holding the permissions asked for. */
  async function church(code = 'IRCA', permissions: string[] = ALL_FINANCE) {
    await createChurch(db, code, ['admin', 'finance']);
    await registry.syncModuleRoles('finance');
    const person = await createUserWithPermissions(db, permissions, {
      moduleKey: 'finance',
    });
    return { person, cookie: await signIn(person.email, person.password) };
  }

  /** Someone in the same church with only these permissions. */
  async function alsoIn(permissions: string[], moduleKey = 'finance') {
    const person = await createUserWithPermissions(db, permissions, { moduleKey });
    return { person, cookie: await signIn(person.email, person.password) };
  }

  const newItem = async (cookie: string, name: string, kind = 'expense-items') =>
    (await portal(app).post(`/v1/finance/${kind}`, { name }, cookie).expect(201)).body as {
      id: string;
      name: string;
    };

  const record = (cookie: string, body: Record<string, unknown>) =>
    portal(app).post(
      '/v1/finance/transactions',
      {
        txnDate: '2026-09-21',
        amount: '150000',
        method: 'CASH',
        clientRequestId: randomUUID(),
        ...body,
      },
      cookie,
    );

  describe('numbering', () => {
    it('numbers entries per church, kind and month, without gaps', async () => {
      const { cookie } = await church();
      const item = await newItem(cookie, 'Generator fuel');
      const source = await newItem(cookie, 'Sunday offering', 'income-sources');

      for (const expected of ['000001', '000002', '000003']) {
        const res = await record(cookie, { kind: 'EXPENSE', expenseItemId: item.id }).expect(201);
        expect(res.body.code).toBe(`IRCA-EXP-2026-09-${expected}`);
      }
      // Income counts separately, and so does another month.
      const income = await record(cookie, { kind: 'INCOME', incomeSourceId: source.id }).expect(
        201,
      );
      expect(income.body.code).toBe('IRCA-INC-2026-09-000001');

      const august = await record(cookie, {
        kind: 'EXPENSE',
        expenseItemId: item.id,
        txnDate: '2026-08-31',
      }).expect(201);
      expect(august.body.code).toBe('IRCA-EXP-2026-08-000001');
    });

    it('gives fifty entries saved at once fifty consecutive numbers', async () => {
      const { cookie } = await church();
      const item = await newItem(cookie, 'Generator fuel');

      // Over a real socket, not supertest's in-process server, which resets
      // connections at this many at once. The point of the test is what
      // Postgres does when fifty transactions want the same counter.
      const url = await listening();
      const save = () =>
        fetch(`${url}/v1/finance/transactions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-irca-client': 'portal', cookie },
          body: JSON.stringify({
            kind: 'EXPENSE',
            expenseItemId: item.id,
            txnDate: '2026-09-21',
            amount: '150000',
            method: 'CASH',
            clientRequestId: randomUUID(),
          }),
        }).then((res) => res.json() as Promise<{ code?: string }>);

      const saved = await Promise.all(Array.from({ length: 50 }, save));
      const codes = saved.map((entry) => entry.code ?? '').sort((a, b) => a.localeCompare(b));
      expect(new Set(codes).size).toBe(50);
      expect(codes[0]).toBe('IRCA-EXP-2026-09-000001');
      expect(codes.at(-1)).toBe('IRCA-EXP-2026-09-000050');
    });

    it('does not spend a number on an entry that fails', async () => {
      const { cookie } = await church();
      const item = await newItem(cookie, 'Generator fuel');
      await record(cookie, { kind: 'EXPENSE', expenseItemId: item.id }).expect(201);
      // An item from nowhere: the insert fails, and the counter rolls back with it.
      await record(cookie, { kind: 'EXPENSE', expenseItemId: randomUUID() }).expect(404);

      const next = await record(cookie, { kind: 'EXPENSE', expenseItemId: item.id }).expect(201);
      expect(next.body.code).toBe('IRCA-EXP-2026-09-000002');
    });


    it('returns the first entry when the same submit arrives twice', async () => {
      const { cookie } = await church();
      const item = await newItem(cookie, 'Generator fuel');
      const clientRequestId = randomUUID();

      const first = await record(cookie, {
        kind: 'EXPENSE',
        expenseItemId: item.id,
        clientRequestId,
      }).expect(201);
      const again = await record(cookie, {
        kind: 'EXPENSE',
        expenseItemId: item.id,
        clientRequestId,
      }).expect(200);

      expect(again.body.code).toBe(first.body.code);
      const { rows } = await db.query(`select count(*) from finance_transactions`);
      expect(Number(rows[0].count)).toBe(1);
    });
  });

  describe('dates', () => {
    it('refuses a date in the future and a year that cannot be right', async () => {
      const { cookie } = await church();
      const item = await newItem(cookie, 'Generator fuel');
      // Tomorrow where the church is, not in UTC: at 22:00 UTC it is already
      // tomorrow in Arusha, and "UTC + one day" would be today there.
      const here = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Dar_es_Salaam' });
      const tomorrow = here.format(new Date(Date.now() + 86_400_000));

      await record(cookie, {
        kind: 'EXPENSE',
        expenseItemId: item.id,
        txnDate: tomorrow,
      }).expect(422);
      await record(cookie, {
        kind: 'EXPENSE',
        expenseItemId: item.id,
        txnDate: '1999-12-31',
      }).expect(422);
    });
  });

  describe('the lists', () => {
    it('refuses the same name twice and a near-miss, until it is confirmed', async () => {
      const { cookie } = await church();
      await newItem(cookie, 'Electricity bill');

      const same = await portal(app)
        .post('/v1/finance/expense-items', { name: 'electricity BILL' }, cookie)
        .expect(409);
      expect(same.body.error.code).toBe('ALREADY_EXISTS');

      const near = await portal(app)
        .post('/v1/finance/expense-items', { name: 'Electricty bill' }, cookie)
        .expect(409);
      expect(near.body.error.code).toBe('SIMILAR_EXISTS');
      expect(near.body.error.details.candidates[0].name).toBe('Electricity bill');

      await portal(app)
        .post(
          '/v1/finance/expense-items',
          { name: 'Electricty bill', confirmDistinct: true },
          cookie,
        )
        .expect(201);
    });

    it('suggests what is typed, forgiving a typo, and never what is turned off', async () => {
      const { cookie } = await church();
      const item = await newItem(cookie, 'Electricity bill');

      const found = await portal(app)
        .get('/v1/finance/expense-items/suggest?q=electrcity', cookie)
        .expect(200);
      expect(found.body.items.map((i: { name: string }) => i.name)).toContain('Electricity bill');

      await portal(app)
        .post(`/v1/finance/expense-items/${item.id}/deactivate`, {}, cookie)
        .expect(204);
      const after = await portal(app)
        .get('/v1/finance/expense-items/suggest?q=electricity', cookie)
        .expect(200);
      expect(after.body.items).toHaveLength(0);

      // And it cannot be used for a new entry either.
      const refused = await record(cookie, { kind: 'EXPENSE', expenseItemId: item.id }).expect(422);
      expect(refused.body.error.code).toBe('ITEM_NOT_AVAILABLE');
    });
  });

  describe('what the database itself refuses', () => {
    it('will not let the app delete or rewrite an entry', async () => {
      const { cookie } = await church();
      const item = await newItem(cookie, 'Generator fuel');
      await record(cookie, { kind: 'EXPENSE', expenseItemId: item.id }).expect(201);

      const asApp = new (await import('pg')).default.Client({
        connectionString: process.env.DATABASE_URL,
      });
      await asApp.connect();

      await expect(asApp.query(`delete from finance_transactions`)).rejects.toThrow(
        /permission denied/,
      );
      for (const sql of [
        `update finance_transactions set notes = 'x'`,
        `update finance_transactions set amount = 1`,
        `update finance_transactions set status = 'VOIDED', voided_at = now()`,
      ]) {
        await expect(asApp.query(sql)).rejects.toThrow(/approved change request/);
      }
      await asApp.end();
    });

    it('freezes a church code once the church has entries', async () => {
      const { cookie } = await church();
      const item = await newItem(cookie, 'Generator fuel');
      await record(cookie, { kind: 'EXPENSE', expenseItemId: item.id }).expect(201);

      await expect(
        db.query(`update church set code = 'NEW' where id = 1`),
      ).rejects.toThrow(/cannot change/);
    });
  });

  describe('corrections', () => {
    /** An entry, its clerk, and two administrators who can decide about it. */
    async function withEntry() {
      const { cookie } = await church();
      const item = await newItem(cookie, 'Generator fuel');
      const entry = (await record(cookie, { kind: 'EXPENSE', expenseItemId: item.id }).expect(201))
        .body;
      const admin = await alsoIn(['admin.requests.read', 'admin.requests.decide'], 'admin');
      const other = await alsoIn(['admin.requests.read', 'admin.requests.decide'], 'admin');
      return { cookie, item, entry, admin, other };
    }

    const ask = (cookie: string, code: string, body: Record<string, unknown>) =>
      portal(app).post(`/v1/finance/transactions/${code}/change-requests`, body, cookie);

    it('applies an approved correction, and only through the request', async () => {
      const { cookie, entry, admin } = await withEntry();

      const asked = await ask(cookie, entry.code, {
        action: 'EDIT',
        proposed: { amount: '105000' },
        reason: 'typed an extra zero',
      }).expect(201);

      const listed = await portal(app)
        .get('/v1/admin/requests?status=PENDING', admin.cookie)
        .expect(200);
      expect(listed.body[0].changes[0]).toMatchObject({ label: 'Amount', to: '105,000' });

      await portal(app)
        .post(`/v1/admin/requests/${asked.body.id}/approve`, {}, admin.cookie)
        .expect(200);

      const after = await portal(app)
        .get(`/v1/finance/transactions/${entry.code}`, cookie)
        .expect(200);
      expect(after.body.amount).toBe('105000.00');
      expect(after.body.revision).toBe(2);
      expect(after.body.openRequest).toBeNull();
    });

    it('lets nobody decide their own request', async () => {
      const { cookie, entry } = await withEntry();
      // Someone who may both ask and decide still may not decide their own.
      const both = await alsoIn(
        ['finance.transactions.read', 'finance.transactions.request_change'],
        'finance',
      );
      await alsoIn(['admin.requests.decide'], 'admin');
      const asked = await ask(cookie, entry.code, {
        action: 'VOID',
        proposed: {},
        reason: 'entered twice',
      }).expect(201);

      // The requester holds no admin permission at all here, so the refusal
      // the API gives them is the guard's, not the four-eyes rule's.
      await portal(app).post(`/v1/admin/requests/${asked.body.id}/approve`, {}, cookie).expect(403);
      expect(both.person.id).toBeTruthy();

      const { rows } = await db.query(`select status from change_requests where id = $1`, [
        asked.body.id,
      ]);
      expect(rows[0].status).toBe('PENDING');
    });

    it('refuses a second request while one is open', async () => {
      const { cookie, entry } = await withEntry();
      await ask(cookie, entry.code, {
        action: 'VOID',
        proposed: {},
        reason: 'entered twice',
      }).expect(201);
      const second = await ask(cookie, entry.code, {
        action: 'EDIT',
        proposed: { amount: '10' },
        reason: 'wrong amount',
      }).expect(409);
      expect(second.body.error.code).toBe('REQUEST_ALREADY_OPEN');
    });

    it('withdraws a request when the entry moved on since it was asked', async () => {
      const { cookie, entry, admin, other } = await withEntry();
      const first = await ask(cookie, entry.code, {
        action: 'EDIT',
        proposed: { amount: '105000' },
        reason: 'typed an extra zero',
      }).expect(201);
      await portal(app)
        .post(`/v1/admin/requests/${first.body.id}/approve`, {}, admin.cookie)
        .expect(200);

      // A request written against the old amount, decided after the change.
      await db.query(
        `insert into change_requests (id, module_key, entity_type, entity_id,
           entity_label, action, before, proposed, reason, requested_by_id)
         select gen_random_uuid(), 'finance', 'finance_transaction', id::text,
           code, 'EDIT', jsonb_build_object('amount', '150000.00'),
           jsonb_build_object('amount', '99000.00'), 'stale', $2::uuid
         from finance_transactions where code = $1`,
        [entry.code, other.person.id],
      );
      const { rows } = await db.query<{ id: string }>(
        `select id from change_requests where reason = 'stale'`,
      );

      const stale = await portal(app)
        .post(`/v1/admin/requests/${rows[0]!.id}/approve`, {}, admin.cookie)
        .expect(409);
      expect(stale.body.error.code).toBe('REQUEST_STALE');
    });

    it('re-checks the proposal when it is approved, not only when it is asked', async () => {
      const { cookie, entry, item, admin } = await withEntry();
      const other = await newItem(cookie, 'Church tent hire');
      const asked = await ask(cookie, entry.code, {
        action: 'EDIT',
        proposed: { expenseItemId: other.id },
        reason: 'wrong item',
      }).expect(201);

      await portal(app)
        .post(`/v1/finance/expense-items/${other.id}/deactivate`, {}, cookie)
        .expect(204);
      const refused = await portal(app)
        .post(`/v1/admin/requests/${asked.body.id}/approve`, {}, admin.cookie)
        .expect(422);
      expect(refused.body.error.code).toBe('ITEM_NOT_AVAILABLE');
      expect(item.id).toBeTruthy();

      // Still waiting, and the entry is untouched.
      const still = await portal(app).get(`/v1/admin/requests/${asked.body.id}`, admin.cookie);
      expect(still.body.status).toBe('PENDING');
    });

    it('replaces an entry moved to another month, under a new number', async () => {
      const { cookie, entry, admin } = await withEntry();
      const asked = await ask(cookie, entry.code, {
        action: 'EDIT',
        proposed: { txnDate: '2026-08-15' },
        reason: 'the receipt is dated August',
      }).expect(201);

      const approved = await portal(app)
        .post(`/v1/admin/requests/${asked.body.id}/approve`, {}, admin.cookie)
        .expect(200);
      expect(approved.body.result.newCode).toBe('IRCA-EXP-2026-08-000001');

      const old = await portal(app)
        .get(`/v1/finance/transactions/${entry.code}`, cookie)
        .expect(200);
      expect(old.body.status).toBe('VOIDED');
      expect(old.body.replacedByCode).toBe('IRCA-EXP-2026-08-000001');
      const fresh = await portal(app)
        .get('/v1/finance/transactions/IRCA-EXP-2026-08-000001', cookie)
        .expect(200);
      expect(fresh.body.replacesCode).toBe(entry.code);
      expect(fresh.body.txnDate).toBe('2026-08-15');
    });

    it('needs a note to reject, changes nothing, and only the requester may cancel', async () => {
      const { cookie, entry, admin, other } = await withEntry();
      const asked = await ask(cookie, entry.code, {
        action: 'VOID',
        proposed: {},
        reason: 'entered twice',
      }).expect(201);

      await portal(app)
        .post(`/v1/admin/requests/${asked.body.id}/reject`, {}, admin.cookie)
        .expect(400);
      await portal(app)
        .post(
          `/v1/admin/requests/${asked.body.id}/reject`,
          { note: 'the receipt says otherwise' },
          admin.cookie,
        )
        .expect(204);

      const after = await portal(app)
        .get(`/v1/finance/transactions/${entry.code}`, cookie)
        .expect(200);
      expect(after.body.status).toBe('POSTED');
      expect(other.person.id).toBeTruthy();
    });

    it('tells every approver but the person who asked', async () => {
      const { cookie, entry, admin, other } = await withEntry();
      await ask(cookie, entry.code, {
        action: 'VOID',
        proposed: {},
        reason: 'entered twice',
      }).expect(201);

      const { rows } = await db.query<{ to_email: string }>(
        `select to_email from email_outbox where template = 'change-request-submitted'`,
      );
      const told = rows.map((r) => r.to_email).sort();
      expect(told).toEqual([admin.person.email, other.person.email].sort());
    });
  });

  describe('who may do what', () => {
    const CASES = [
      { permission: 'finance.transactions.read', route: ['get', '/v1/finance/transactions'] },
      { permission: 'finance.overview.read', route: ['get', '/v1/finance/overview?month=2026-09'] },
      { permission: 'finance.catalog.read', route: ['get', '/v1/finance/expense-items'] },
      {
        permission: 'finance.reports.read',
        route: ['get', '/v1/finance/reports/statement?from=2026-09-01&to=2026-09-30'],
      },
      {
        permission: 'finance.transactions.export',
        route: ['get', '/v1/finance/transactions/export.csv'],
      },
    ] as const;

    it.each(CASES)('needs $permission for $route.1', async ({ permission, route }) => {
      const allowed = await church('IRCA', [permission]);
      await portal(app)[route[0]](route[1], allowed.cookie).expect(200);

      // Someone in the same church holding every other finance permission.
      const without = await alsoIn(
        ALL_FINANCE.filter((p) => p !== permission),
      );
      await portal(app)[route[0]](route[1], without.cookie).expect(403);
    });

    it('refuses recording, creating items and asking for changes without the permission', async () => {
      const { cookie } = await church();
      const item = await newItem(cookie, 'Generator fuel');
      const entry = (await record(cookie, { kind: 'EXPENSE', expenseItemId: item.id })).body;
      const viewer = await alsoIn([
        'finance.transactions.read',
        'finance.catalog.read',
        'finance.overview.read',
        'finance.reports.read',
      ]);

      await record(viewer.cookie, { kind: 'EXPENSE', expenseItemId: item.id }).expect(403);
      await portal(app)
        .post('/v1/finance/expense-items', { name: 'Anything' }, viewer.cookie)
        .expect(403);
      await portal(app)
        .post(
          `/v1/finance/transactions/${entry.code}/change-requests`,
          { action: 'VOID', proposed: {}, reason: 'entered twice' },
          viewer.cookie,
        )
        .expect(403);
      await portal(app)
        .patch(`/v1/finance/expense-items/${item.id}`, { name: 'Renamed' }, viewer.cookie)
        .expect(403);
    });

  });

  describe('totals and downloads', () => {
    it('adds up what is posted, and leaves out what was voided', async () => {
      const { cookie, entry, admin } = await (async () => {
        const { cookie } = await church();
        const item = await newItem(cookie, 'Generator fuel');
        const source = await newItem(cookie, 'Sunday offering', 'income-sources');
        await record(cookie, { kind: 'INCOME', incomeSourceId: source.id, amount: '2340000' });
        const entry = (await record(cookie, { kind: 'EXPENSE', expenseItemId: item.id })).body;
        const admin = await alsoIn(['admin.requests.decide'], 'admin');
        return { cookie, entry, admin };
      })();

      const before = await portal(app)
        .get('/v1/finance/overview?month=2026-09', cookie)
        .expect(200);
      expect(before.body.income).toBe('2340000.00');
      expect(before.body.expense).toBe('150000.00');
      expect(before.body.net).toBe('2190000.00');

      const asked = await portal(app)
        .post(
          `/v1/finance/transactions/${entry.code}/change-requests`,
          { action: 'VOID', proposed: {}, reason: 'entered twice' },
          cookie,
        )
        .expect(201);
      await portal(app)
        .post(`/v1/admin/requests/${asked.body.id}/approve`, {}, admin.cookie)
        .expect(200);

      const after = await portal(app).get('/v1/finance/overview?month=2026-09', cookie).expect(200);
      expect(after.body.expense).toBe('0.00');
      expect(after.body.net).toBe('2340000.00');
    });

    it('writes a CSV a spreadsheet opens as text, not as a formula', async () => {
      const { cookie } = await church();
      const item = await newItem(cookie, 'Generator fuel');
      await record(cookie, {
        kind: 'EXPENSE',
        expenseItemId: item.id,
        notes: '=HYPERLINK("http://evil.example","click")',
      }).expect(201);

      const csv = await portal(app).get('/v1/finance/transactions/export.csv', cookie).expect(200);
      expect(csv.text).toContain(`"'=HYPERLINK(`);
    });
  });

  describe('while being viewed as', () => {
    it('refuses every write, whatever the person could otherwise do', async () => {
      const { cookie, person } = await church();
      const item = await newItem(cookie, 'Generator fuel');
      const admin = await alsoIn(['admin.users.impersonate', 'admin.users.read'], 'admin');

      await portal(app)
        .post('/v1/impersonation', { subjectUserId: person.id }, admin.cookie)
        .expect(200);

      for (const call of [
        () => record(admin.cookie, { kind: 'EXPENSE', expenseItemId: item.id }),
        () => portal(app).post('/v1/finance/expense-items', { name: 'Anything' }, admin.cookie),
        () =>
          portal(app).patch(
            `/v1/finance/expense-items/${item.id}`,
            { name: 'Renamed' },
            admin.cookie,
          ),
      ]) {
        const res = await call();
        expect(res.status).toBe(403);
      }

      // Reading is exactly as it was.
      await portal(app).get('/v1/finance/transactions', admin.cookie).expect(200);
    });
  });
});

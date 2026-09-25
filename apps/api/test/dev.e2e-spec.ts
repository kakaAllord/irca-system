import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { financeModule } from '@irca/shared';
import { RegistrySync } from '../src/core/rbac/registry-sync.service.js';
import { UsageSnapshot } from '../src/core/usage/usage-snapshot.service.js';
import {
  createApp,
  createChurch,
  createUserWithPermissions,
  ownerDb,
  portal,
  sessionCookie,
  truncateAll,
} from './helpers.js';

/**
 * The dev console, now that it is an ordinary portal.
 *
 * What it used to test — every church listed, one church suspended, a church
 * created with its first administrator — is gone with multi-tenancy. What is
 * left is what a developer of this one church actually needs: is the system
 * healthy, what did it write, and who viewed the portal as whom.
 */
describe('the dev console', () => {
  let app: NestExpressApplication;
  let db: pg.Client;

  beforeAll(async () => {
    app = await createApp();
    db = await ownerDb();
    await app.get(RegistrySync).sync();
  });
  afterAll(async () => {
    await db.end();
    await app.close();
  });
  beforeEach(async () => {
    await truncateAll(db);
  });

  const signIn = async (email: string, password: string) =>
    sessionCookie(await portal(app).post('/v1/auth/login', { email, password }).expect(200));

  /** Someone holding the dev console's permissions, and nothing else. */
  async function developer(
    permissions = ['dev.health.read', 'dev.logs.read', 'dev.impersonations.read'],
  ) {
    await createChurch(db, 'IRCA', ['admin', 'dev']);
    const person = await createUserWithPermissions(db, permissions, { moduleKey: 'dev' });
    return signIn(person.email, person.password);
  }

  const usage = (metric: string, value: number, daysAgo = 1) =>
    db.query(
      `insert into usage_daily (day, metric, value) values (current_date - $1::int, $2, $3)`,
      [daysAgo, metric, value],
    );

  it('is closed to anyone without its permissions', async () => {
    await createChurch(db, 'IRCA', ['admin', 'dev']);
    const admin = await createUserWithPermissions(db, ['admin.users.read']);
    const cookie = await signIn(admin.email, admin.password);

    await portal(app).get('/v1/dev/health', cookie).expect(403);
    await portal(app).get('/v1/dev/logs/server', cookie).expect(403);
    await portal(app).get('/v1/dev/impersonations', cookie).expect(403);
  });

  it('reports the health of the system', async () => {
    const cookie = await developer();
    const res = await portal(app).get('/v1/dev/health', cookie).expect(200);

    expect(res.body.database).toBeDefined();
    expect(typeof res.body.database.bytes).toBe('number');
    expect(Array.isArray(res.body.errors)).toBe(true);
  });

  it("shows each job's latest run, however many there have been", async () => {
    const cookie = await developer();
    await db.query(`
      insert into job_runs (id, job, started_at, finished_at, ok, error) values
        (gen_random_uuid(), 'drill-a', now() - interval '2 minutes', now(), false, 'down'),
        (gen_random_uuid(), 'drill-a', now() - interval '1 minute', now(), true, null),
        (gen_random_uuid(), 'drill-b', now() - interval '1 day', now(), false, 'timeout')`);

    const res = await portal(app).get('/v1/dev/health', cookie).expect(200);
    // The API's own jobs run during the test too; only the drills are asserted on.
    const jobs = (res.body.jobs as { job: string; ok: boolean; error: string | null }[]).filter(
      (j) => j.job.startsWith('drill-'),
    );
    expect(jobs.map((j) => [j.job, j.ok, j.error])).toEqual([
      ['drill-a', true, null],
      ['drill-b', false, 'timeout'],
    ]);
  });

  it('forgets old job runs overnight, and keeps the failures longer', async () => {
    await createChurch(db, 'IRCA', ['admin', 'dev']);
    await db.query(`
      insert into job_runs (id, job, started_at, ok) values
        (gen_random_uuid(), 'drill-a', now() - interval '31 days', true),
        (gen_random_uuid(), 'drill-a', now() - interval '29 days', true),
        (gen_random_uuid(), 'drill-a', now() - interval '31 days', false),
        (gen_random_uuid(), 'drill-a', now() - interval '181 days', false)`);

    const stats = await app.get(UsageSnapshot).run();

    expect(stats.jobRunsRemoved).toBe(2);
    const { rows } = await db.query(
      `select ok, (now() - started_at) < interval '30 days' as recent from job_runs
       where job = 'drill-a' order by started_at`,
    );
    expect(rows).toEqual([
      { ok: false, recent: false },
      { ok: true, recent: true },
    ]);
  });

  it('hands back the lines the server has just written', async () => {
    const cookie = await developer();
    // The request above is itself a line, so there is always something to read.
    const res = await portal(app).get('/v1/dev/logs/server?limit=50', cookie).expect(200);

    expect(Array.isArray(res.body.lines)).toBe(true);
    expect(typeof res.body.held).toBe('number');
  });

  it('shows what people did, newest first', async () => {
    const cookie = await developer();
    const res = await portal(app).get('/v1/dev/logs/actions?limit=10', cookie).expect(200);

    expect(Array.isArray(res.body.rows)).toBe(true);
    const times = res.body.rows.map((r: { at: string }) => r.at);
    expect([...times].sort().reverse()).toEqual(times);
  });

  it('keeps the view-as log, and only for those who may read it', async () => {
    const cookie = await developer();
    await portal(app).get('/v1/dev/impersonations', cookie).expect(200);

    await createChurch(db, 'IRCA', ['admin', 'dev']);
    const clerk = await createUserWithPermissions(db, ['admin.users.read']);
    const theirs = await signIn(clerk.email, clerk.password);
    await portal(app).get('/v1/dev/impersonations', theirs).expect(403);
  });

  it('draws usage over time, filling the days nothing was counted', async () => {
    const cookie = await developer(['dev.usage.read']);
    await usage('api.requests', 40, 2);
    await usage('entities.people', 12, 3);
    const from = new Date(Date.now() - 4 * 86_400_000).toISOString().slice(0, 10);

    const res = await portal(app)
      .get(`/v1/dev/usage?metrics=api.requests,entities.people&from=${from}`, cookie)
      .expect(200);
    const [requests, people] = res.body as { points: { value: number }[] }[];
    // A counter is zero on a quiet day; a gauge keeps its last reading.
    expect(requests!.points.map((p) => p.value)).toEqual([0, 0, 40, 0, 0]);
    expect(people!.points.map((p) => p.value)).toEqual([0, 12, 12, 12, 12]);

    await portal(app).get('/v1/dev/usage', cookie).expect(200);
  });

  it('counts the staff active each day from who actually used it', async () => {
    const cookie = await developer(['dev.usage.read']);
    const a = await createUserWithPermissions(db, []);
    const b = await createUserWithPermissions(db, []);
    for (const id of [a.id, b.id]) {
      await db.query(
        `insert into user_activity_daily (user_id, day, requests) values ($1, current_date - 1, 5)`,
        [id],
      );
    }
    const from = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const res = await portal(app)
      .get(`/v1/dev/usage?metrics=users.active&from=${from}&to=${from}`, cookie)
      .expect(200);
    expect(res.body[0].points).toEqual([{ day: from, value: 2 }]);
  });

  it('ranks routes by calls and says how long each takes on average', async () => {
    const cookie = await developer(['dev.usage.read']);
    await usage('api.route.GET /finance/overview', 10);
    await usage('api.route_ms.GET /finance/overview', 1800);
    await usage('api.route.GET /auth/me', 90);
    await usage('api.route_ms.GET /auth/me', 900);
    // Older than the window asked for, so not counted.
    await usage('api.route.GET /auth/me', 1000, 40);

    const res = await portal(app).get('/v1/dev/usage/routes?days=30', cookie).expect(200);
    expect(res.body).toEqual([
      { route: 'GET /auth/me', calls: 90, averageMs: 10 },
      { route: 'GET /finance/overview', calls: 10, averageMs: 180 },
    ]);
  });

  it('lists the last emails without handing out the addresses', async () => {
    const cookie = await developer(['dev.usage.read']);
    await db.query(
      `insert into email_outbox (id, to_email, template, payload, status)
       values (gen_random_uuid(), 'neema.mollel@gmail.com', 'invitation', '{}', 'SENT')`,
    );
    const res = await portal(app).get('/v1/dev/usage/emails', cookie).expect(200);
    expect(res.body[0].to).toBe('ne***@gmail.com');
    expect(JSON.stringify(res.body)).not.toContain('mollel');
  });

  it("changes the church's settings, and never its code once there are entries", async () => {
    const cookie = await developer(['dev.church.manage']);
    const church = await portal(app).get('/v1/dev/church', cookie).expect(200);
    expect(church.body).toMatchObject({ code: 'IRCA', codeLocked: false });

    await portal(app)
      .patch('/v1/dev/church', { name: 'IRCA Arusha', timezone: 'Mars/Olympus' }, cookie)
      .expect(400);
    const changed = await portal(app)
      .patch('/v1/dev/church', { name: 'IRCA Arusha', code: 'irc' }, cookie)
      .expect(200);
    expect(changed.body).toMatchObject({ name: 'IRCA Arusha', code: 'IRC' });

    // One entry is enough to freeze it.
    await createChurch(db, 'IRC', ['admin', 'dev', 'finance']);
    const clerk = await createUserWithPermissions(db, Object.keys(financeModule.permissions), {
      moduleKey: 'finance',
    });
    const books = await signIn(clerk.email, clerk.password);
    const tithe = await portal(app)
      .post('/v1/finance/income-sources', { name: 'Tithe' }, books)
      .expect(201);
    await portal(app)
      .post(
        '/v1/finance/transactions',
        {
          kind: 'INCOME',
          incomeSourceId: tithe.body.id,
          txnDate: new Date().toISOString().slice(0, 10),
          amount: '1000',
          method: 'CASH',
          clientRequestId: randomUUID(),
        },
        books,
      )
      .expect(201);
    const refused = await portal(app).patch('/v1/dev/church', { code: 'IRCA' }, cookie).expect(409);
    expect(refused.body.error.message).toMatch(/cannot change/);

    const { rows } = await db.query(
      `select summary from audit_events where action = 'church.updated'`,
    );
    expect(rows).toHaveLength(1);
  });

  it('makes a registration key once, and revokes it for good', async () => {
    const cookie = await developer(['dev.church.manage']);
    const made = await portal(app)
      .post('/v1/dev/api-clients', { name: 'Registration form on Vercel' }, cookie)
      .expect(201);
    expect(made.body.key).toMatch(/^irk_/);

    const listed = await portal(app).get('/v1/dev/api-clients', cookie).expect(200);
    expect(listed.body).toHaveLength(1);
    // The list never carries the key or its hash, only the first characters.
    expect(JSON.stringify(listed.body)).not.toContain(made.body.key);
    expect(listed.body[0].keyHash).toBeUndefined();

    await portal(app).del(`/v1/dev/api-clients/${made.body.id}`, cookie).expect(204);
    await portal(app).del(`/v1/dev/api-clients/${made.body.id}`, cookie).expect(404);
    const after = await portal(app).get('/v1/dev/api-clients', cookie).expect(200);
    expect(after.body[0].revokedAt).not.toBeNull();
  });

  it('keeps settings and keys to those who may change them', async () => {
    const cookie = await developer(['dev.health.read', 'dev.usage.read']);
    await portal(app).get('/v1/dev/church', cookie).expect(403);
    await portal(app).get('/v1/dev/api-clients', cookie).expect(403);
    await portal(app).post('/v1/dev/api-clients', { name: 'Sneaky' }, cookie).expect(403);
  });
});

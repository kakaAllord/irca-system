import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { RegistrySync } from '../src/core/rbac/registry-sync.service.js';
import { AlertChecks } from '../src/core/alerts/alert-checks.service.js';
import { MemorySmsProvider } from '../src/core/sms/providers/memory.provider.js';
import { CommsAlerts } from '../src/modules/comms/comms-alerts.service.js';
import {
  createApp,
  createChurch,
  createPerson,
  createUserWithPermissions,
  ownerDb,
  portal,
  sessionCookie,
  truncateAll,
} from './helpers.js';

/**
 * The owner hears about a problem from an alert, not from a pastor on Sunday
 * (docs/plan/10, step 10.4): once when it starts, not every ten minutes while
 * it lasts, and once more when it clears.
 */
describe('alerts', () => {
  let app: NestExpressApplication;
  let db: pg.Client;
  let checks: AlertChecks;
  let comms: CommsAlerts;
  let sms: MemorySmsProvider;

  beforeAll(async () => {
    app = await createApp();
    db = await ownerDb();
    await app.get(RegistrySync).sync();
    checks = app.get(AlertChecks);
    comms = app.get(CommsAlerts);
    sms = app.get(MemorySmsProvider);
  });
  afterAll(async () => {
    await db.end();
    await app.close();
  });
  beforeEach(async () => {
    await truncateAll(db);
    sms.reset();
    await createChurch(db, 'IRCA', ['admin', 'dev', 'comms']);
  });

  /** The owner: may read the Health page, with a phone on their person. */
  async function owner(phone = '712000111') {
    const user = await createUserWithPermissions(db, ['dev.health.read', 'dev.church.manage'], {
      moduleKey: 'dev',
      email: 'owner@example.com',
    });
    const person = await createPerson(db, { phone });
    await db.query(`update users set person_id = $1 where id = $2`, [person.id, user.id]);
    return user;
  }

  const alertEmails = async () =>
    (
      await db.query<{ to_email: string; payload: { state: string; title: string } }>(
        `select to_email, payload from email_outbox where template = 'alert' order by created_at`,
      )
    ).rows.map((r) => ({ to: r.to_email, state: r.payload.state, title: r.payload.title }));

  /** Today's totals, as the usage counters would have written them. */
  const traffic = (requests: number, errors: number) =>
    db.query(
      `insert into usage_daily (day, metric, value) values
         (current_date, 'api.requests', $1), (current_date, 'api.errors.5xx', $2)
       on conflict (day, metric) do update set value = excluded.value`,
      [requests, errors],
    );

  it('raises failing requests once, holds back the repeats, and says when it clears', async () => {
    await owner();
    await traffic(1_000, 0);
    await checks.failingRequests(2); // the first reading only

    await traffic(1_100, 10); // 10 of the last 100 failed
    await checks.failingRequests(2);
    await traffic(1_200, 30); // still failing, ten minutes later
    await checks.failingRequests(2);
    await traffic(1_300, 30); // none of the last 100 failed
    await checks.failingRequests(2);

    expect(await alertEmails()).toEqual([
      { to: 'owner@example.com', state: 'raised', title: '10.0% of requests are failing' },
      { to: 'owner@example.com', state: 'resolved', title: 'Requests are failing' },
    ]);
    // A failure rate is not worth a text; the site being down is the uptime monitor's.
    expect(sms.sent).toHaveLength(0);
  });

  it('judges nothing from a handful of requests', async () => {
    await owner();
    await traffic(10, 0);
    await checks.failingRequests(2);
    await traffic(20, 5);
    expect(await checks.failingRequests(2)).toMatch(/too few/);
    expect(await alertEmails()).toEqual([]);
  });

  it('tells about an email given up on once, by email and by text', async () => {
    await owner('712000111');
    await db.query(
      `insert into email_outbox (id, to_email, template, payload, status, attempts, last_error)
       values ($1, 'someone@example.com', 'invitation', '{}', 'FAILED', 6, 'domain not verified')`,
      [randomUUID()],
    );

    expect(await checks.failedEmails()).toBe(1);
    expect(await checks.failedEmails()).toBe(0);

    expect(await alertEmails()).toEqual([
      { to: 'owner@example.com', state: 'raised', title: '1 email was given up on' },
    ]);
    // In case email is what is broken.
    expect(sms.sent).toHaveLength(1);
    expect(sms.sent[0]!.to).toBe('+255712000111');
    expect(sms.sent[0]!.body).toMatch(/^IRCA alert: 1 email was given up on/);
  });

  it('raises a job that failed twice in a row, and clears it when it runs again', async () => {
    await owner();
    const run = (ok: boolean, minutesAgo: number) =>
      db.query(
        `insert into job_runs (id, job, started_at, finished_at, ok, error)
         values ($1, 'drill-job', now() - make_interval(mins => $2), now(), $3, $4)`,
        [randomUUID(), minutesAgo, ok, ok ? null : 'connection refused'],
      );

    await run(true, 30);
    await run(false, 20);
    expect(await checks.failingJobs()).toEqual([]); // once is not twice

    await run(false, 10);
    expect(await checks.failingJobs()).toEqual(['drill-job']);
    await run(true, 0);
    await checks.failingJobs();

    expect(await alertEmails()).toEqual([
      { to: 'owner@example.com', state: 'raised', title: 'The drill-job job keeps failing' },
      { to: 'owner@example.com', state: 'resolved', title: 'The drill-job job' },
    ]);
  });

  it('watches the storage only once its size is known', async () => {
    await owner();
    await db.query(
      `insert into usage_daily (day, metric, value) values (current_date, 'db.size_bytes', $1)`,
      [900 * 1024 ** 2],
    );
    expect(await checks.storage(null, 80)).toBe('no storage size set');

    expect(await checks.storage(1024 ** 3, 80)).toBe('88% used');
    expect(await alertEmails()).toEqual([
      { to: 'owner@example.com', state: 'raised', title: 'The database is 88% full' },
    ]);
  });

  it('warns the owner and Communications when the credit is low, by text too', async () => {
    await owner('712000111');
    const lead = await createUserWithPermissions(db, ['comms.settings.manage'], {
      moduleKey: 'comms',
      email: 'comms@example.com',
    });
    const person = await createPerson(db, { phone: '713000222' });
    await db.query(`update users set person_id = $1 where id = $2`, [person.id, lead.id]);

    await comms.checkCredit('1200.00'); // above the default floor of 500
    await comms.checkCredit('450.00');
    await comms.checkCredit('440.00'); // still low: not said again yet
    await comms.checkCredit('5000.00'); // topped up

    const emails = await alertEmails();
    // Both are called Neema Mollel, so their order within a round is not fixed.
    expect(emails.map((e) => `${e.state} ${e.to}`)).toEqual([
      expect.stringMatching(/^raised /),
      expect.stringMatching(/^raised /),
      expect.stringMatching(/^resolved /),
      expect.stringMatching(/^resolved /),
    ]);
    expect(new Set(emails.map((e) => e.to))).toEqual(
      new Set(['comms@example.com', 'owner@example.com']),
    );
    expect(emails[0]!.title).toBe('Text message credit is down to 450');
    expect(sms.sent.map((s) => s.to).sort()).toEqual(['+255712000111', '+255713000222']);
  });

  it('never warns about credit when the floor is 0', async () => {
    await owner();
    await db.query(
      `insert into settings (key, value, updated_at) values ('comms.balanceAlertFloor', '0', now())`,
    );
    await comms.checkCredit('3.00');
    expect(await alertEmails()).toEqual([]);
  });

  it('raises texts failing past a tenth of the day', async () => {
    await owner();
    const message = randomUUID();
    await db.query(
      `insert into comms_messages (id, audience_key, audience_name, bodies, status, started_at)
       values ($1, 'church', 'Everyone', '{"sw":"Habari"}', 'PARTIAL', now())`,
      [message],
    );
    for (let i = 0; i < 20; i++) {
      await db.query(
        `insert into comms_recipients (id, message_id, phone, lang, body, status)
         values ($1, $2, '+255712000000', 'sw', 'Habari', $3)`,
        [randomUUID(), message, i < 3 ? 'FAILED' : 'SENT'],
      );
    }

    expect(await comms.checkFailing()).toEqual({ done: 20, failed: 3 });
    expect(await alertEmails()).toEqual([
      { to: 'owner@example.com', state: 'raised', title: "15% of today's texts failed" },
    ]);
  });

  describe('in the dev console', () => {
    const signIn = async (email: string, password: string) =>
      sessionCookie(await portal(app).post('/v1/auth/login', { email, password }).expect(200));

    it('says who hears, saves the storage size, and sends a test on purpose', async () => {
      const me = await owner('712000111');
      const cookie = await signIn(me.email, me.password);

      const page = await portal(app).get('/v1/dev/alerts', cookie).expect(200);
      expect(page.body.recipients).toEqual([
        { name: 'Neema Mollel', email: 'owner@example.com', phone: '+255712000111' },
      ]);
      expect(page.body.dbStorageGb).toBeNull();

      const saved = await portal(app).put('/v1/dev/alerts', { dbStorageGb: 5 }, cookie).expect(200);
      expect(saved.body.dbStorageGb).toBe(5);
      await portal(app).put('/v1/dev/alerts', { dbStorageGb: 0 }, cookie).expect(400);

      const test = await portal(app).post('/v1/dev/alerts/test', {}, cookie).expect(200);
      expect(test.body).toEqual({ emails: 1, texts: 1 });
      expect(await alertEmails()).toEqual([
        { to: 'owner@example.com', state: 'raised', title: 'A test alert' },
      ]);
      expect(sms.sent).toHaveLength(1);
    });

    it('is closed to anyone who may not change the settings', async () => {
      const watcher = await createUserWithPermissions(db, ['dev.health.read'], {
        moduleKey: 'dev',
      });
      const cookie = await signIn(watcher.email, watcher.password);
      await portal(app).get('/v1/dev/alerts', cookie).expect(403);
      await portal(app).post('/v1/dev/alerts/test', {}, cookie).expect(403);
    });
  });
});

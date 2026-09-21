import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import { MemoryEmailProvider } from '../src/core/email/providers/memory.provider.js';
import { EmailService } from '../src/core/email/email.service.js';
import { RegistrySync } from '../src/core/rbac/registry-sync.service.js';
import {
  asForm,
  createApiClient,
  createApp,
  createChurch,
  createUser,
  createUserWithPermissions,
  ownerDb,
  portal,
  sessionCookie,
  truncateAll,
} from './helpers.js';

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
    app.get(MemoryEmailProvider).sent.length = 0;
  });

  const signIn = async (email: string, password: string) =>
    sessionCookie(await portal(app).post('/v1/auth/login', { email, password }).expect(200));

  async function dev() {
    const d = await createUser(db, { platformRole: 'DEV' });
    return signIn(d.email, d.password);
  }

  it('is for devs only: a church administrator gets none of it', async () => {
    const church = await createChurch(db);
    const admin = await createUserWithPermissions(db, church.id, [
      'admin.users.read',
      'admin.modules.manage',
    ]);
    const cookie = await signIn(admin.email, admin.password);

    for (const path of [
      '/v1/platform/churches',
      `/v1/platform/churches/${church.id}`,
      '/v1/platform/health',
      '/v1/platform/impersonations',
    ]) {
      await portal(app).get(path, cookie).expect(403);
    }
  });

  it('lists every church with what it uses', async () => {
    const irca = await createChurch(db, 'IRCA');
    await createChurch(db, 'TEST');
    await db.query(
      `insert into usage_daily (church_id, day, metric, value) values
         ($1, current_date, 'api.requests', 40), ($1, current_date - 1, 'api.requests', 2),
         ($1, current_date, 'db.bytes.total', 12345)`,
      [irca.id],
    );
    const cookie = await dev();

    const res = await portal(app).get('/v1/platform/churches?days=7', cookie).expect(200);
    const row = res.body.find((c: { code: string }) => c.code === 'IRCA');
    expect(res.body).toHaveLength(2);
    expect(row.requests).toBe(42);
    expect(row.dbBytes).toBe(12345);
  });

  it('fills the days nothing happened: zero for counts, the last value for snapshots', async () => {
    const irca = await createChurch(db, 'IRCA');
    await db.query(
      `insert into usage_daily (church_id, day, metric, value) values
         ($1, '2026-09-01', 'api.requests', 5), ($1, '2026-09-01', 'db.bytes.total', 100)`,
      [irca.id],
    );
    const cookie = await dev();

    const res = await portal(app)
      .get(
        `/v1/platform/churches/${irca.id}/usage?metrics=api.requests,db.bytes.total&from=2026-09-01&to=2026-09-03`,
        cookie,
      )
      .expect(200);
    const [requests, bytes] = res.body;
    expect(requests.points.map((p: { value: number }) => p.value)).toEqual([5, 0, 0]);
    expect(bytes.points.map((p: { value: number }) => p.value)).toEqual([100, 100, 100]);
  });

  it('sets up a church and invites its first administrator', async () => {
    const cookie = await dev();
    const created = await portal(app)
      .post(
        '/v1/platform/churches',
        {
          code: 'ARK',
          slug: 'arusha-kaskazini',
          name: 'Arusha Kaskazini',
          adminName: 'Pastor Joel',
          adminEmail: 'joel@example.com',
        },
        cookie,
      )
      .expect(201);
    expect(created.body.code).toBe('ARK');

    const again = await portal(app)
      .post(
        '/v1/platform/churches',
        {
          code: 'ark',
          slug: 'another',
          name: 'Another',
          adminName: 'Someone',
          adminEmail: 'someone@example.com',
        },
        cookie,
      )
      .expect(409);
    expect(again.body.error.details.field).toBe('code');

    await app.get(EmailService).sendDue();
    const sent = app.get(MemoryEmailProvider).sent;
    expect(sent.at(-1)!.to).toBe('joel@example.com');
    expect(sent.at(-1)!.subject).toMatch(/Arusha Kaskazini/);

    const detail = await portal(app).get(`/v1/platform/churches/${created.body.id}`, cookie);
    expect(detail.body.admins).toEqual([
      expect.objectContaining({ email: 'joel@example.com', status: 'INVITED' }),
    ]);
  });

  it('pauses a church: its staff lose it, and its form stops taking answers', async () => {
    const church = await createChurch(db, 'IRCA', ['admin', 'membership']);
    const staff = await createUserWithPermissions(db, church.id, ['admin.users.read']);
    const staffCookie = await signIn(staff.email, staff.password);
    const form = asForm(app, await createApiClient(db, church.id));
    await form.post('/v1/public/registrations', { lang: 'en' }).expect(201);
    const cookie = await dev();

    await portal(app).post(`/v1/platform/churches/${church.id}/suspend`, {}, cookie).expect(400);
    await portal(app)
      .post(`/v1/platform/churches/${church.id}/suspend`, { reason: 'Unpaid' }, cookie)
      .expect(204);

    await portal(app).get('/v1/admin/users', staffCookie).expect(403);
    await form.post('/v1/public/registrations', { lang: 'en' }).expect(403);
    // The church hears about it in its own log, as well as the platform's, and
    // in the log its administrators actually read.
    const { rows } = await db.query(
      `select action, source from audit_events where church_id = $1 and action = 'church.suspended'`,
      [church.id],
    );
    expect(rows).toEqual([{ action: 'church.suspended', source: 'feature' }]);
    const theirLog = await portal(app).get(`/v1/platform/churches/${church.id}/audit`, cookie);
    expect(theirLog.body[0]).toMatchObject({
      action: 'church.suspended',
      summary: expect.stringContaining('Unpaid'),
    });

    await portal(app)
      .post(`/v1/platform/churches/${church.id}/reactivate`, { reason: 'Paid' }, cookie)
      .expect(204);
    await form.post('/v1/public/registrations', { lang: 'en' }).expect(201);
  });

  it('makes a key once, and revokes it', async () => {
    const church = await createChurch(db, 'IRCA', ['admin', 'membership']);
    const cookie = await dev();

    const made = await portal(app)
      .post(`/v1/platform/churches/${church.id}/api-clients`, { name: 'Form' }, cookie)
      .expect(201);
    expect(made.body.key).toMatch(/^irk_/);
    await asForm(app, made.body.key).post('/v1/public/registrations', { lang: 'en' }).expect(201);

    const listed = await portal(app).get(`/v1/platform/churches/${church.id}/api-clients`, cookie);
    expect(JSON.stringify(listed.body)).not.toContain(made.body.key);

    await portal(app)
      .del(`/v1/platform/churches/${church.id}/api-clients/${made.body.id}`, cookie)
      .expect(204);
    await asForm(app, made.body.key).post('/v1/public/registrations', { lang: 'en' }).expect(401);
  });

  it('keeps the view-as log for devs, and every page viewed in it', async () => {
    const church = await createChurch(db, 'IRCA');
    const admin = await createUserWithPermissions(db, church.id, [
      'admin.users.impersonate',
      'admin.users.read',
    ]);
    const clerk = await createUserWithPermissions(db, church.id, ['admin.users.read']);
    const adminCookie = await signIn(admin.email, admin.password);

    await portal(app)
      .post('/v1/impersonation', { subjectUserId: clerk.id }, adminCookie)
      .expect(200);
    await portal(app).get('/v1/admin/users', adminCookie).expect(200);
    await portal(app).del('/v1/impersonation', adminCookie).expect(200);

    const cookie = await dev();
    const log = await portal(app).get('/v1/platform/impersonations?since=24h', cookie).expect(200);
    expect(log.body.rows).toHaveLength(1);
    const session = log.body.rows[0];
    expect(session.actor.email).toBe(admin.email);
    expect(session.subject.email).toBe(clerk.email);
    expect(session.endedAt).not.toBeNull();

    const shown = await portal(app)
      .get(`/v1/platform/impersonations/${session.id.slice(0, 8)}`, cookie)
      .expect(200);
    expect(shown.body.views.map((v: { path: string }) => v.path)).toContain('/v1/admin/users');

    // And the church's own log still has no trace of it.
    const activity = await portal(app).get(`/v1/platform/churches/${church.id}/audit`, cookie);
    expect(JSON.stringify(activity.body)).not.toMatch(/impersonation/);
  });
});

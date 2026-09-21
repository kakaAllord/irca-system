import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import { ClsService } from 'nestjs-cls';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import type { Type } from '@nestjs/common';
import { Db } from '../src/core/database/db.service.js';
import { ALLOW_WHILE_IMPERSONATING } from '../src/core/impersonation/decorators.js';
import {
  createApp,
  createChurch,
  createUser,
  createUserWithPermissions,
  ownerDb,
  portal,
  sessionCookie,
  truncateAll,
} from './helpers.js';
import { FixturesController } from './fixtures.controller.js';

describe('viewing as someone else', () => {
  let app: NestExpressApplication;
  let db: pg.Client;

  beforeAll(async () => {
    app = await createApp([FixturesController]);
    db = await ownerDb();
  });
  afterAll(async () => {
    await db.end();
    await app.close();
  });
  beforeEach(() => truncateAll(db));

  const signIn = async (email: string, password: string) =>
    sessionCookie(await portal(app).post('/v1/auth/login', { email, password }).expect(200));

  /** An administrator who may view as others, and a clerk to view as. */
  async function church() {
    const c = await createChurch(db);
    const admin = await createUserWithPermissions(db, c.id, [
      'admin.users.read',
      'admin.users.manage',
      'admin.users.impersonate',
    ]);
    const clerk = await createUserWithPermissions(db, c.id, ['admin.users.read']);
    return { c, admin, clerk };
  }

  it('takes on the other person, with nothing that changes anything', async () => {
    const { admin, clerk } = await church();
    const cookie = await signIn(admin.email, admin.password);

    const started = await portal(app)
      .post('/v1/impersonation', { subjectUserId: clerk.id }, cookie)
      .expect(200);
    expect(started.body.user.email).toBe(clerk.email);
    expect(started.body.impersonation.actor.id).toBe(admin.id);
    expect(started.body.permissions).toEqual(['admin.users.read']);

    // The clerk's own write permission would not be there either, but this
    // administrator's certainly is not.
    const me = await portal(app).get('/v1/auth/me', cookie).expect(200);
    expect(me.body.permissions.some((p: string) => p.endsWith('.manage'))).toBe(false);
  });

  it('refuses every change while it runs, however the request is made', async () => {
    const { admin, clerk } = await church();
    const cookie = await signIn(admin.email, admin.password);
    await portal(app).post('/v1/impersonation', { subjectUserId: clerk.id }, cookie).expect(200);

    const refused = await portal(app).post('/v1/fixture/write', {}, cookie).expect(403);
    expect(refused.body.error.code).toBe('IMPERSONATION_READ_ONLY');
    // Switching church is a change too.
    await portal(app)
      .post('/v1/auth/church', { churchId: crypto.randomUUID() }, cookie)
      .expect(403);
  });

  it('is refused by the database itself, even on a route that slips through', async () => {
    const { admin, clerk, c } = await church();
    const cookie = await signIn(admin.email, admin.password);
    await portal(app).post('/v1/impersonation', { subjectUserId: clerk.id }, cookie).expect(200);

    const before = await db.query(`select count(*)::int as n from roles where church_id = $1`, [
      c.id,
    ]);
    // This route is a GET, so the guards let it by, and it writes on purpose.
    await portal(app).get('/v1/fixture/writes-anyway', cookie).expect(500);
    const after = await db.query(`select count(*)::int as n from roles where church_id = $1`, [
      c.id,
    ]);
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it('will not view as yourself, a platform account, or someone outside the church', async () => {
    const { c, admin, clerk } = await church();
    const other = await createChurch(db, 'BBB');
    const outsider = await createUser(db, { churchId: other.id });
    const dev = await createUser(db, { platformRole: 'DEV', churchId: c.id });
    const invited = await createUser(db, { churchId: c.id, status: 'INVITED' });
    const cookie = await signIn(admin.email, admin.password);

    for (const [subjectUserId, expected] of [
      [admin.id, /yourself/],
      [dev.id, /Platform accounts/],
      [outsider.id, /does not have access to this church/],
      [invited.id, /invitation|disabled/],
    ] as const) {
      const res = await portal(app)
        .post('/v1/impersonation', { subjectUserId }, cookie)
        .expect(403);
      expect(res.body.error.message).toMatch(expected);
    }

    // And no chains: viewing as someone cannot start another view-as.
    await portal(app).post('/v1/impersonation', { subjectUserId: clerk.id }, cookie).expect(200);
    await portal(app).post('/v1/impersonation', { subjectUserId: clerk.id }, cookie).expect(403);
  });

  it('lets a dev in, without carrying their platform powers along', async () => {
    const { c, clerk } = await church();
    const dev = await createUser(db, { platformRole: 'DEV' });
    const cookie = await signIn(dev.email, dev.password);

    const me = await portal(app).get('/v1/auth/me', cookie).expect(200);
    expect(me.body.permissions).toContain('platform.churches.read');

    const started = await portal(app)
      .post('/v1/impersonation', { subjectUserId: clerk.id, churchId: c.id }, cookie)
      .expect(200);
    expect(started.body.user.email).toBe(clerk.email);
    expect(started.body.permissions).toEqual(['admin.users.read']);
    expect(started.body.permissions).not.toContain('platform.churches.read');
  });

  it('ends by itself, and on sign-out, and says which in the log', async () => {
    const { admin, clerk } = await church();
    const cookie = await signIn(admin.email, admin.password);
    await portal(app).post('/v1/impersonation', { subjectUserId: clerk.id }, cookie).expect(200);

    await db.query(`update impersonation_sessions set expires_at = now() - interval '1 minute'`);
    const me = await portal(app).get('/v1/auth/me', cookie).expect(200);
    expect(me.body.user.email).toBe(admin.email);
    expect(me.body.impersonation).toBeNull();

    await portal(app).post('/v1/impersonation', { subjectUserId: clerk.id }, cookie).expect(200);
    await portal(app).post('/v1/auth/logout', {}, cookie).expect(204);

    const { rows } = await db.query<{ end_reason: string }>(
      `select end_reason from impersonation_sessions order by started_at`,
    );
    expect(rows.map((r) => r.end_reason)).toEqual(['EXPIRED', 'LOGOUT']);
  });

  it('leaves no trace for the church: not for the person, not for an administrator', async () => {
    const { c, admin, clerk } = await church();
    const adminCookie = await signIn(admin.email, admin.password);
    await portal(app)
      .post('/v1/impersonation', { subjectUserId: clerk.id }, adminCookie)
      .expect(200);
    await portal(app).get('/v1/fixture/read', adminCookie).expect(200);
    await portal(app).del('/v1/impersonation', adminCookie).expect(200);

    // The clerk's own view of themselves says nothing about it.
    const clerkCookie = await signIn(clerk.email, clerk.password);
    const me = await portal(app).get('/v1/auth/me', clerkCookie).expect(200);
    expect(JSON.stringify(me.body)).not.toContain('impersonation.');
    expect(me.body.impersonation).toBeNull();

    // Nor does anything the church itself can read from the log, whatever
    // query it sends: row-level security hides those rows from it.
    const cls = app.get(ClsService);
    const scoped = app.get(Db);
    const visible = await cls.run(async () => {
      cls.set('churchId', c.id);
      cls.set('impersonationId', null);
      return scoped.tx((tx) => tx.$queryRaw<{ action: string }[]>`select action from audit_events`);
    });
    expect(visible.filter((r) => r.action.startsWith('impersonation.'))).toEqual([]);

    // The platform's own view has every one of them. (The stop request logs
    // its own page view after the end, which is why this counts rather than
    // compares an order.)
    const all = await db.query<{ action: string }>(`select action from audit_events`);
    const counts = all.rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.action] = (acc[r.action] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts['impersonation.started']).toBe(1);
    expect(counts['impersonation.ended']).toBe(1);
    expect(counts['impersonation.view']).toBeGreaterThanOrEqual(2);
  });

  it('allows exactly two routes to run while viewing as someone', () => {
    const discovery = app.get(DiscoveryService);
    const scanner = app.get(MetadataScanner);
    const reflector = app.get(Reflector);
    const allowed: string[] = [];

    for (const wrapper of discovery.getControllers()) {
      const cls = wrapper.metatype as Type<object> | undefined;
      if (!cls?.prototype) continue;
      for (const name of scanner.getAllMethodNames(cls.prototype)) {
        const handler = cls.prototype[name as keyof object] as () => unknown;
        if (reflector.get(ALLOW_WHILE_IMPERSONATING, handler)) allowed.push(`${cls.name}.${name}`);
      }
    }
    // Stopping, and signing out. A third needs a deliberate change here.
    expect(allowed.sort()).toEqual(['AuthController.logout', 'ImpersonationController.stop']);
  });
});

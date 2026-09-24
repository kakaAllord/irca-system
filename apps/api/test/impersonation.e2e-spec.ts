import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { RequestMethod, type Type } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { ALL_MODULES } from '@irca/shared';
import { Db } from '../src/core/database/db.service.js';
import { ALLOW_WHILE_IMPERSONATING } from '../src/core/impersonation/decorators.js';
import {
  createApp,
  createChurch,
  createRole,
  createUser,
  createUserWithPermissions,
  grantRole,
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
    await createChurch(db);
    const admin = await createUserWithPermissions(db, [
      'admin.users.read',
      'admin.users.manage',
      'admin.users.impersonate',
    ]);
    const clerk = await createUserWithPermissions(db, ['admin.users.read']);
    return { admin, clerk };
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
  });

  it('is refused by the database itself, even on a route that slips through', async () => {
    const { admin, clerk } = await church();
    const cookie = await signIn(admin.email, admin.password);
    await portal(app).post('/v1/impersonation', { subjectUserId: clerk.id }, cookie).expect(200);

    const count = async () => (await db.query(`select count(*)::int as n from roles`)).rows[0].n;
    const before = await count();
    // This route is a GET, so the guards let it by, and it writes on purpose.
    await portal(app).get('/v1/fixture/writes-anyway', cookie).expect(500);
    expect(await count()).toBe(before);

    // The same route writes perfectly well once the viewing has stopped, so
    // what refused it was the connection, not something wrong with the write.
    await portal(app).del('/v1/impersonation', cookie).expect(200);
    await portal(app).get('/v1/fixture/writes-anyway', cookie).expect(200);
    expect(await count()).toBe(before + 1);
  });

  it('will not view as yourself, or someone disabled or not yet signed up', async () => {
    const { admin, clerk } = await church();
    const invited = await createUser(db, { status: 'INVITED' });
    const disabled = await createUser(db, { status: 'DISABLED' });
    const cookie = await signIn(admin.email, admin.password);

    for (const [subjectUserId, expected] of [
      [admin.id, /yourself/],
      [invited.id, /invitation|disabled/],
      [disabled.id, /invitation|disabled/],
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
    const { admin, clerk } = await church();
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
    // query it sends: the database refuses it that table outright (D16), not
    // just the rows a filter happens to leave out.
    const scoped = app.get(Db);
    await expect(
      scoped.tx((tx) => tx.$queryRaw<{ action: string }[]>`select action from audit_events`),
    ).rejects.toThrow(/permission denied/);

    // The one function feature code may read through never has an
    // impersonation row in it either, however this asks.
    const visible = await scoped.tx(
      (tx) => tx.$queryRaw<{ action: string }[]>`select action from church_audit_events()`,
    );
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

  it('can open every page of every portal on the read-only connection', async () => {
    await createChurch(
      db,
      'IRCA',
      ALL_MODULES.map((m) => m.key),
    );
    const admin = await createUserWithPermissions(db, ['admin.users.impersonate']);
    // Someone who may read everything there is, one role per portal.
    const everyone = await createUser(db);
    for (const m of ALL_MODULES) {
      const role = await createRole(db, {
        moduleKey: m.key,
        permissions: Object.keys(m.permissions),
      });
      await grantRole(db, everyone.id, role.id);
    }
    const cookie = await signIn(admin.email, admin.password);
    await portal(app).post('/v1/impersonation', { subjectUserId: everyone.id }, cookie).expect(200);

    // A GET that writes anything at all — a counter, a "last seen", a default
    // row created on first read — fails here with a 500, because the
    // connection cannot write. Missing records and bad parameters are fine.
    const failed: string[] = [];
    for (const path of getRoutes(app)) {
      if (path.startsWith('/v1/fixture/')) continue;
      const url = path.replace(/:[A-Za-z]+/g, '00000000-0000-4000-8000-000000000000');
      const res = await portal(app).get(url, cookie);
      if (res.status >= 500) failed.push(`${path} → ${res.status}`);
    }
    expect(failed).toEqual([]);
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

/** Every GET route the API serves, as its template (`/v1/people/:id`). */
function getRoutes(app: NestExpressApplication): string[] {
  const discovery = app.get(DiscoveryService);
  const scanner = app.get(MetadataScanner);
  const reflector = app.get(Reflector);
  const join = (...parts: string[]) =>
    '/' +
    parts
      .map((p) => p.replace(/^\/|\/$/g, ''))
      .filter(Boolean)
      .join('/');
  const routes: string[] = [];
  for (const wrapper of discovery.getControllers()) {
    const cls = wrapper.metatype as Type<object> | undefined;
    if (!cls?.prototype) continue;
    const base = reflector.get<string | string[]>(PATH_METADATA, cls) ?? '';
    for (const name of scanner.getAllMethodNames(cls.prototype)) {
      const handler = cls.prototype[name as keyof object] as () => unknown;
      if (reflector.get(METHOD_METADATA, handler) !== RequestMethod.GET) continue;
      const path = reflector.get<string | string[]>(PATH_METADATA, handler) ?? '';
      for (const b of [base].flat()) {
        for (const p of [path].flat()) routes.push(join('v1', b, p));
      }
    }
  }
  return routes.filter((r) => r !== '/v1/health');
}

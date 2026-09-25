import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import { ALL_MODULES, moduleByKey } from '@irca/shared';
import { RegistrySync } from '../src/core/rbac/registry-sync.service.js';
import {
  createApp,
  createChurch,
  createRole,
  createUser,
  grantRole,
  ownerDb,
  portal,
  sessionCookie,
  truncateAll,
} from './helpers.js';
import { guardedRoutes, refusedByGuard, type Route } from './routes.js';

/**
 * The permission matrix, generated rather than written out.
 *
 * Each module's own tests say what its routes do. This says, for every route
 * any module declares a permission on, the two things the plan asks of every
 * one: someone holding every other permission in the system is refused, and
 * someone holding only what it names is let past the check. A route added
 * tomorrow, in a module that does not exist yet, is in this test the moment
 * its controller is.
 */
describe('the permission matrix', () => {
  let app: NestExpressApplication;
  let db: pg.Client;
  let routes: Route[];

  beforeAll(async () => {
    app = await createApp();
    db = await ownerDb();
    routes = guardedRoutes(app);
  });
  afterAll(async () => {
    await db.end();
    await app.close();
  });
  beforeEach(async () => {
    await truncateAll(db);
    await createChurch(
      db,
      'IRCA',
      ALL_MODULES.map((m) => m.key),
    );
    await app.get(RegistrySync).sync();
  });

  /**
   * Signed in as someone holding exactly these permissions, one role per
   * portal. Routes that need the same permission share the one person, within
   * a test: making a person hashes a password, and doing it once per route
   * made this test slower with every route added.
   */
  let signedIn = new Map<string, Promise<string>>();
  beforeEach(() => {
    signedIn = new Map();
  });
  function holding(permissions: string[]) {
    const key = [...permissions].sort().join(' ');
    if (!signedIn.has(key)) signedIn.set(key, signIn(permissions));
    return signedIn.get(key)!;
  }
  async function signIn(permissions: string[]) {
    const user = await createUser(db);
    for (const m of ALL_MODULES) {
      const own = permissions.filter((p) => moduleByKey(m.key)?.permissions[p]);
      if (!own.length) continue;
      const role = await createRole(db, { moduleKey: m.key, permissions: own });
      await grantRole(db, user.id, role.id);
    }
    return sessionCookie(
      await portal(app)
        .post('/v1/auth/login', { email: user.email, password: user.password })
        .expect(200),
    );
  }

  const EVERY = ALL_MODULES.flatMap((m) => Object.keys(m.permissions));
  const ID = '00000000-0000-4000-8000-000000000000';
  const call = (route: Route, cookie: string) => {
    const url = route.path.replace(/:[A-Za-z]+/g, ID);
    return route.method === 'get' || route.method === 'del'
      ? portal(app)[route.method](url, cookie)
      : portal(app)[route.method](url, {}, cookie);
  };

  it('covers a route in every portal that has any', () => {
    // So an empty discovery cannot pass the two tests below by checking nothing.
    expect(routes.length).toBeGreaterThan(40);
    const covered = new Set(
      routes.flatMap((r) => (r.rule.all ?? r.rule.any)!.map((p) => p.split('.')[0])),
    );
    for (const m of ALL_MODULES) expect(covered).toContain(m.key);
  });

  it('refuses every route to someone holding everything but what it needs', async () => {
    const leaks: string[] = [];
    for (const route of routes) {
      const needed = route.rule.all ?? route.rule.any!;
      const cookie = await holding(EVERY.filter((p) => !needed.includes(p)));
      const res = await call(route, cookie);
      if (!refusedByGuard(res)) leaks.push(`${route.method} ${route.path} → ${res.status}`);
    }
    expect(leaks).toEqual([]);
    // A sweep of every route, which grows with each one added: not a single
    // request, so not held to the per-test limit meant for one.
  }, 120_000);

  it('lets someone holding only what a route needs past the check', async () => {
    const refused: string[] = [];
    for (const route of routes) {
      const needed = route.rule.all ?? [route.rule.any![0]!];
      const cookie = await holding(needed);
      const res = await call(route, cookie);
      if (refusedByGuard(res)) refused.push(`${route.method} ${route.path}`);
    }
    expect(refused).toEqual([]);
  }, 120_000);

  it('answers a path that names no real id with 4xx, never a crash', async () => {
    const crashed: string[] = [];
    for (const route of routes.filter((r) => r.path.includes('/:'))) {
      const needed = route.rule.all ?? [route.rule.any![0]!];
      const cookie = await holding(needed);
      const url = route.path.replace(/:[A-Za-z]+/g, 'not-an-id');
      const res =
        route.method === 'get' || route.method === 'del'
          ? await portal(app)[route.method](url, cookie)
          : await portal(app)[route.method](url, {}, cookie);
      if (res.status >= 500) crashed.push(`${route.method} ${route.path} → ${res.status}`);
    }
    expect(crashed).toEqual([]);
  }, 120_000);
});

import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
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
  async function developer() {
    await createChurch(db, 'IRCA', ['admin', 'dev']);
    const person = await createUserWithPermissions(
      db,
      ['dev.health.read', 'dev.logs.read', 'dev.impersonations.read'],
      { moduleKey: 'dev' },
    );
    return signIn(person.email, person.password);
  }

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
});

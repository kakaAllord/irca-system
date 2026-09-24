import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import {
  createApp,
  createChurch,
  createUserWithPermissions,
  ownerDb,
  portal,
  sessionCookie,
  truncateAll,
} from './helpers.js';
import { FixturesController } from './fixtures.controller.js';

describe('what each person may do', () => {
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

  it('allows what a role grants and refuses the rest, saying only what was needed', async () => {
    await createChurch(db);
    const reader = await createUserWithPermissions(db, ['admin.users.read']);
    const cookie = await signIn(reader.email, reader.password);

    await portal(app).get('/v1/fixture/read', cookie).expect(200);
    const refused = await portal(app).post('/v1/fixture/write', {}, cookie).expect(403);
    expect(refused.body.error).toMatchObject({
      code: 'FORBIDDEN',
      details: { required: ['admin.users.manage'] },
    });
    // What they do have is never listed back to them.
    expect(JSON.stringify(refused.body)).not.toContain('admin.users.read');
  });

  it('accepts any one of several permissions where a route says so', async () => {
    await createChurch(db);
    const auditor = await createUserWithPermissions(db, ['admin.audit.read']);
    await portal(app)
      .get('/v1/fixture/any', await signIn(auditor.email, auditor.password))
      .expect(200);
  });

  it('gives nothing to a person with no role, and everything a role has to one with it', async () => {
    await createChurch(db);
    const nobody = await createUserWithPermissions(db, []);
    const cookie = await signIn(nobody.email, nobody.password);
    await portal(app).get('/v1/fixture/read', cookie).expect(403);
    await portal(app).get('/v1/fixture/anyone', cookie).expect(200);
  });

  it('takes a portal away from everyone the moment it is turned off, without deleting anything', async () => {
    await createChurch(db);
    const person = await createUserWithPermissions(db, ['admin.users.read']);
    const cookie = await signIn(person.email, person.password);
    await portal(app).get('/v1/fixture/read', cookie).expect(200);

    await db.query(`update module_state set enabled = false`);
    await portal(app).get('/v1/fixture/read', cookie).expect(403);
    const me = await portal(app).get('/v1/auth/me', cookie).expect(200);
    expect(me.body.permissions).toEqual([]);
    expect(me.body.modules).toEqual([]);

    // The role and who holds it are untouched, so turning it back on restores everything.
    await db.query(`update module_state set enabled = true`);
    await portal(app).get('/v1/fixture/read', cookie).expect(200);
  });

  it('ignores a permission that is no longer in the code', async () => {
    await createChurch(db);
    const person = await createUserWithPermissions(db, ['admin.users.read']);
    const cookie = await signIn(person.email, person.password);
    await portal(app).get('/v1/fixture/read', cookie).expect(200);

    await db.query(`update permissions set retired_at = now() where key = 'admin.users.read'`);
    try {
      await portal(app).get('/v1/fixture/read', cookie).expect(403);
    } finally {
      await db.query(`update permissions set retired_at = null where key = 'admin.users.read'`);
    }
  });
});

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
    const church = await createChurch(db);
    const reader = await createUserWithPermissions(db, church.id, ['admin.users.read']);
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
    const church = await createChurch(db);
    const auditor = await createUserWithPermissions(db, church.id, ['admin.audit.read']);
    await portal(app)
      .get('/v1/fixture/any', await signIn(auditor.email, auditor.password))
      .expect(200);
  });

  it('gives nothing to a person with no role, and everything a role has to one with it', async () => {
    const church = await createChurch(db);
    const nobody = await createUserWithPermissions(db, church.id, []);
    const cookie = await signIn(nobody.email, nobody.password);
    await portal(app).get('/v1/fixture/read', cookie).expect(403);
    await portal(app).get('/v1/fixture/anyone', cookie).expect(200);
  });

  it('takes a portal away from everyone the moment it is turned off, without deleting anything', async () => {
    const church = await createChurch(db);
    const person = await createUserWithPermissions(db, church.id, ['admin.users.read']);
    const cookie = await signIn(person.email, person.password);
    await portal(app).get('/v1/fixture/read', cookie).expect(200);

    await db.query(`update church_modules set enabled = false where church_id = $1`, [church.id]);
    await portal(app).get('/v1/fixture/read', cookie).expect(403);
    const me = await portal(app).get('/v1/auth/me', cookie).expect(200);
    expect(me.body.permissions).toEqual([]);
    expect(me.body.modules).toEqual([]);

    // The role and who holds it are untouched, so turning it back on restores everything.
    await db.query(`update church_modules set enabled = true where church_id = $1`, [church.id]);
    await portal(app).get('/v1/fixture/read', cookie).expect(200);
  });

  it('refuses to attach a role belonging to another church at all', async () => {
    const a = await createChurch(db, 'AAA');
    const b = await createChurch(db, 'BBB');
    const person = await createUserWithPermissions(db, a.id, ['admin.users.read']);
    const { rows: role } = await db.query<{ id: string }>(
      `insert into roles (id, church_id, module_key, name, updated_at)
       values (gen_random_uuid(), $1, 'admin', 'B admin', now()) returning id`,
      [b.id],
    );
    await db.query(
      `insert into role_permissions (church_id, role_id, permission_key) values ($1, $2, 'admin.users.manage')`,
      [b.id, role[0]!.id],
    );
    const { rows: membership } = await db.query<{ id: string }>(
      `select id from church_memberships where church_id = $1 and user_id = $2`,
      [a.id, person.id],
    );

    // Whatever writes it, the database refuses: a role and the people who hold
    // it must belong to the same church. (A test caught this granting
    // another church's permissions before the keys existed.)
    await expect(
      db.query(
        `insert into membership_roles (church_id, membership_id, role_id) values ($1, $2, $3)`,
        [a.id, membership[0]!.id, role[0]!.id],
      ),
    ).rejects.toThrow(/foreign key constraint/);

    const cookie = await signIn(person.email, person.password);
    await portal(app).post('/v1/fixture/write', {}, cookie).expect(403);
  });

  it('ignores a permission that is no longer in the code', async () => {
    const church = await createChurch(db);
    const person = await createUserWithPermissions(db, church.id, ['admin.users.read']);
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

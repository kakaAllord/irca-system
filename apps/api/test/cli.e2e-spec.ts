import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import { PrismaDb } from '../src/core/database/prisma-clients.js';
import { SessionService } from '../src/core/auth/session.service.js';
import { RegistrySync } from '../src/core/rbac/registry-sync.service.js';
import {
  checkResettable,
  grantRole,
  revokeSessions,
  setupChurch,
} from '../src/cli/commands/access.js';
import {
  createApp,
  createChurch,
  createUser,
  ownerDb,
  portal,
  sessionCookie,
  truncateAll,
} from './helpers.js';

/**
 * The commands a dev reaches for when the portal cannot help: a database with
 * nobody in it yet, an administrator locked out, someone who must lose access
 * this minute. Called as functions, the way main.ts calls them, so what is
 * tested is what runs.
 */
describe('the command line', () => {
  let app: NestExpressApplication;
  let db: pg.Client;
  let prisma: PrismaDb;

  beforeAll(async () => {
    app = await createApp();
    db = await ownerDb();
    prisma = app.get(PrismaDb);
  });
  afterAll(async () => {
    await db.end();
    await app.close();
  });
  beforeEach(() => truncateAll(db));

  const auditLines = async (action: string) =>
    (
      await db.query<{ summary: string; meta: unknown }>(
        `select summary, meta from audit_events where action = $1`,
        [action],
      )
    ).rows;

  it('sets up the church once, and only once', async () => {
    const church = await setupChurch({ db: prisma, code: 'irca', name: ' IRCA Arusha ' });
    expect(church).toMatchObject({
      code: 'IRCA',
      name: 'IRCA Arusha',
      timezone: 'Africa/Dar_es_Salaam',
      currency: 'TZS',
    });
    expect(await auditLines('church.created')).toEqual([
      { summary: 'Set up IRCA Arusha (IRCA) from the command line', meta: { via: 'command line' } },
    ]);

    await expect(setupChurch({ db: prisma, code: 'OTHER', name: 'Other' })).rejects.toThrow(
      /already belongs to IRCA Arusha/,
    );
  });

  it('refuses a church code, clock or currency that would not work', async () => {
    await expect(setupChurch({ db: prisma, code: 'I', name: 'x' })).rejects.toThrow(/2 to 10/);
    await expect(
      setupChurch({ db: prisma, code: 'IRCA', name: 'x', timezone: 'Mars/Olympus' }),
    ).rejects.toThrow(/not a timezone/);
    await expect(
      setupChurch({ db: prisma, code: 'IRCA', name: 'x', currency: 'shillings' }),
    ).rejects.toThrow(/three-letter/);
    expect((await db.query('select 1 from church')).rowCount).toBe(0);
  });

  it('gives a locked-out administrator their role back, and says so in the log', async () => {
    await createChurch(db);
    await app.get(RegistrySync).sync();
    const pastor = await createUser(db, { email: 'pastor@example.org' });

    const first = await grantRole({
      db: prisma,
      email: 'Pastor@Example.org',
      roleKey: 'admin.administrator',
    });
    expect(first.granted).toBe(true);
    const again = await grantRole({
      db: prisma,
      email: pastor.email,
      roleKey: 'admin.administrator',
    });
    expect(again.granted).toBe(false);
    expect(await auditLines('admin.role.granted')).toHaveLength(1);

    // And it is real: they can sign in and manage people.
    const cookie = sessionCookie(
      await portal(app)
        .post('/v1/auth/login', { email: pastor.email, password: pastor.password })
        .expect(200),
    );
    const me = await portal(app).get('/v1/auth/me', cookie).expect(200);
    expect(me.body.permissions).toContain('admin.users.manage');
  });

  it('names the roles there are when asked for one that is not', async () => {
    await createChurch(db);
    await app.get(RegistrySync).sync();
    await createUser(db, { email: 'pastor@example.org' });
    await expect(
      grantRole({ db: prisma, email: 'pastor@example.org', roleKey: 'admin.boss' }),
    ).rejects.toThrow(/admin\.administrator/);
    await expect(
      grantRole({ db: prisma, email: 'nobody@example.org', roleKey: 'admin.administrator' }),
    ).rejects.toThrow(/Nobody has an account/);
  });

  it('signs someone out of every browser at once', async () => {
    await createChurch(db);
    const clerk = await createUser(db);
    const cookies = [];
    for (let i = 0; i < 2; i++) {
      cookies.push(
        sessionCookie(
          await portal(app)
            .post('/v1/auth/login', { email: clerk.email, password: clerk.password })
            .expect(200),
        ),
      );
    }

    const { open } = await revokeSessions({
      db: prisma,
      sessions: app.get(SessionService),
      email: clerk.email,
    });
    expect(open).toBe(2);
    for (const cookie of cookies) await portal(app).get('/v1/auth/me', cookie).expect(401);
    expect(await auditLines('admin.user.signed_out')).toHaveLength(1);
  });

  it('only sends a reset to someone who could use it, and says why not', async () => {
    await createChurch(db);
    const active = await createUser(db);
    const invited = await createUser(db, { status: 'INVITED' });
    const disabled = await createUser(db, { status: 'DISABLED' });

    await expect(checkResettable(prisma, active.email)).resolves.toMatchObject({
      id: active.id,
    });
    await expect(checkResettable(prisma, invited.email)).rejects.toThrow(/invitation/);
    await expect(checkResettable(prisma, disabled.email)).rejects.toThrow(/disabled/);
  });
});

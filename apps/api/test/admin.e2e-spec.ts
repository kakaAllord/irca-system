import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import { EmailService } from '../src/core/email/email.service.js';
import { MemoryEmailProvider } from '../src/core/email/providers/memory.provider.js';
import { RegistrySync } from '../src/core/rbac/registry-sync.service.js';
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

describe('running a church: people, roles and portals', () => {
  let app: NestExpressApplication;
  let db: pg.Client;
  let emails: MemoryEmailProvider;
  let outbox: EmailService;
  let registry: RegistrySync;

  beforeAll(async () => {
    app = await createApp();
    db = await ownerDb();
    emails = app.get(MemoryEmailProvider);
    outbox = app.get(EmailService);
    registry = app.get(RegistrySync);
  });
  afterAll(async () => {
    await db.end();
    await app.close();
  });
  beforeEach(async () => {
    await truncateAll(db);
    emails.sent.length = 0;
  });

  const signIn = async (email: string, password: string) =>
    sessionCookie(await portal(app).post('/v1/auth/login', { email, password }).expect(200));

  /** A church with its built-in roles, and an administrator holding them all. */
  async function church(code = 'IRCA') {
    const c = await createChurch(db, code);
    await registry.syncModuleRoles(c.id, 'admin');
    const admin = await createUserWithPermissions(db, c.id, [
      'admin.users.read',
      'admin.users.invite',
      'admin.users.manage',
      'admin.roles.read',
      'admin.roles.manage',
      'admin.modules.read',
      'admin.modules.manage',
      'admin.audit.read',
    ]);
    const cookie = await signIn(admin.email, admin.password);
    const { rows } = await db.query<{ id: string; system_key: string }>(
      `select id, system_key from roles where church_id = $1 and system_key is not null`,
      [c.id],
    );
    const systemRole = (key: string) => rows.find((r) => r.system_key === key)!.id;
    return { c, admin, cookie, systemRole };
  }

  /** Sends what the outbox owes and returns the link in the last message. */
  async function linkFromEmail(): Promise<string> {
    await outbox.sendDue();
    const last = emails.sent.at(-1)!;
    return /https?:\/\/\S+/.exec(last.text)![0];
  }

  it('invites someone, who sets a password and arrives with exactly their roles', async () => {
    const { cookie, systemRole } = await church();

    await portal(app)
      .post(
        '/v1/admin/users/invitations',
        {
          email: 'Pastor.Sarah@Example.com ',
          fullName: 'Pastor Sarah',
          roleIds: [systemRole('admin.auditor')],
        },
        cookie,
      )
      .expect(201);

    const link = await linkFromEmail();
    const token = new URL(link).searchParams.get('token')!;

    const described = await portal(app).get(`/v1/invitations/${token}`).expect(200);
    expect(described.body).toMatchObject({
      email: 'pastor.sarah@example.com',
      roleSummary: 'Auditor',
      needsPassword: true,
    });

    // The roles do nothing until the invitation is accepted.
    await portal(app)
      .post('/v1/auth/login', { email: 'pastor.sarah@example.com', password: 'anything at all' })
      .expect(401);

    await portal(app).post(`/v1/invitations/${token}/accept`, { password: 'short' }).expect(422);
    const accepted = await portal(app)
      .post(`/v1/invitations/${token}/accept`, { password: 'kilimanjaro sunrise tea' })
      .expect(200);
    expect(accepted.body.roleLabels).toEqual(['Auditor']);
    expect(accepted.body.permissions).toContain('admin.audit.read');
    expect(accepted.body.permissions).not.toContain('admin.users.invite');

    // A link works once.
    await portal(app)
      .post(`/v1/invitations/${token}/accept`, { password: 'kilimanjaro sunrise tea' })
      .expect(410);
  });

  it('will not invite the same person twice, or hand out a role of a portal that is off', async () => {
    const { cookie, systemRole, c } = await church();
    const role = systemRole('admin.auditor');
    const invite = (email: string, roleIds = [role]) =>
      portal(app).post(
        '/v1/admin/users/invitations',
        { email, fullName: 'Someone Else', roleIds },
        cookie,
      );

    await invite('twice@example.com').expect(201);
    const again = await invite('twice@example.com').expect(409);
    expect(again.body.error.code).toBe('ALREADY_INVITED');

    // A role from a portal this church has turned off cannot be given out.
    await db.query(
      `insert into church_modules (church_id, module_key, enabled) values ($1, 'finance', false)`,
      [c.id],
    );
    const { rows } = await db.query<{ id: string }>(
      `insert into roles (id, church_id, module_key, name, updated_at)
       values (gen_random_uuid(), $1, 'finance', 'Finance clerk', now()) returning id`,
      [c.id],
    );
    const refused = await invite('clerk@example.com', [rows[0]!.id]).expect(422);
    expect(refused.body.error.code).toBe('ROLE_NOT_AVAILABLE');
  });

  it('keeps at least one administrator, and nobody can disable themselves', async () => {
    const { cookie, admin, systemRole } = await church();
    const adminRole = systemRole('admin.administrator');
    await portal(app)
      .put(`/v1/admin/users/${admin.id}/roles`, { roleIds: [adminRole] }, cookie)
      .expect(204);

    const stripped = await portal(app)
      .put(`/v1/admin/users/${admin.id}/roles`, { roleIds: [] }, cookie)
      .expect(409);
    expect(stripped.body.error.code).toBe('LAST_ADMIN');

    const disabled = await portal(app)
      .put(`/v1/admin/users/${admin.id}/access`, { enabled: false }, cookie)
      .expect(409);
    expect(disabled.body.error.message).toMatch(/your own access/);
  });

  it('signs someone out of the church the moment their access is disabled', async () => {
    const { c, cookie } = await church();
    const person = await createUserWithPermissions(db, c.id, ['admin.users.read']);
    const theirs = await signIn(person.email, person.password);
    await portal(app).get('/v1/auth/me', theirs).expect(200);

    await portal(app)
      .put(`/v1/admin/users/${person.id}/access`, { enabled: false }, cookie)
      .expect(204);
    await portal(app).get('/v1/auth/me', theirs).expect(401);

    // Restoring brings back the same roles.
    await portal(app)
      .put(`/v1/admin/users/${person.id}/access`, { enabled: true }, cookie)
      .expect(204);
    const back = await signIn(person.email, person.password);
    const me = await portal(app).get('/v1/auth/me', back).expect(200);
    expect(me.body.permissions).toEqual(['admin.users.read']);
  });

  it('makes custom roles from what a portal offers, and nothing else', async () => {
    const { cookie } = await church();

    const made = await portal(app)
      .post(
        '/v1/admin/roles',
        {
          moduleKey: 'admin',
          name: 'Front desk',
          description: 'Sees people',
          permissionKeys: ['admin.users.read'],
        },
        cookie,
      )
      .expect(201);

    const foreign = await portal(app)
      .post(
        '/v1/admin/roles',
        {
          moduleKey: 'admin',
          name: 'Sneaky',
          description: '',
          permissionKeys: ['platform.churches.read'],
        },
        cookie,
      )
      .expect(422);
    expect(foreign.body.error.details.permissionKeys).toEqual(['platform.churches.read']);

    // Built-in roles are the code's, not a church's, to change.
    const { rows } = await db.query<{ id: string }>(
      `select id from roles where system_key = 'admin.auditor'`,
    );
    const system = await portal(app)
      .patch(
        `/v1/admin/roles/${rows[0]!.id}`,
        { name: 'Renamed', description: '', permissionKeys: ['admin.users.read'] },
        cookie,
      )
      .expect(409);
    expect(system.body.error.code).toBe('SYSTEM_ROLE');

    await portal(app).del(`/v1/admin/roles/${made.body.id}`, cookie).expect(204);
  });

  it('will not turn off a portal the church cannot run without, or one that does not exist', async () => {
    const { cookie } = await church();

    const core = await portal(app)
      .put('/v1/admin/modules/admin', { enabled: false }, cookie)
      .expect(409);
    expect(core.body.error.message).toMatch(/always on/);

    // Only portals that exist in the code can be turned on at all, which is
    // what stops anyone inventing one. Media arrives in a later phase.
    await portal(app).put('/v1/admin/modules/media', { enabled: true }, cookie).expect(404);

    const listed = await portal(app).get('/v1/admin/modules', cookie).expect(200);
    expect(listed.body.map((m: { key: string }) => m.key)).toEqual([
      'membership',
      'finance',
      'admin',
    ]);
  });

  it('shows what changed in the church, and never a view-as', async () => {
    const { c, cookie, systemRole } = await church();
    await portal(app)
      .post(
        '/v1/admin/users/invitations',
        {
          email: 'seen@example.com',
          fullName: 'Seen Person',
          roleIds: [systemRole('admin.auditor')],
        },
        cookie,
      )
      .expect(201);

    const log = await portal(app).get('/v1/admin/audit', cookie).expect(200);
    expect(log.body.rows.some((r: { action: string }) => r.action === 'admin.user.invited')).toBe(
      true,
    );

    // Sign-ins and view-as rows belong to the platform, not to the church.
    await db.query(
      `insert into audit_events (id, church_id, source, action, created_at)
       values (gen_random_uuid(), $1, 'core', 'impersonation.started', now())`,
      [c.id],
    );
    const after = await portal(app).get('/v1/admin/audit', cookie).expect(200);
    expect(
      after.body.rows.some((r: { action: string }) => r.action.startsWith('impersonation.')),
    ).toBe(false);
  });

  it('lets someone reset a forgotten password, and says the same thing either way', async () => {
    const { c } = await church();
    const person = await createUser(db, { churchId: c.id });

    const unknown = await portal(app)
      .post('/v1/auth/forgot-password', { email: 'nobody@example.com' })
      .expect(202);
    const known = await portal(app)
      .post('/v1/auth/forgot-password', { email: person.email })
      .expect(202);
    expect(unknown.body).toEqual(known.body);
    // Only the real one produces an email.
    await outbox.sendDue();
    expect(emails.sent).toHaveLength(1);

    const token = new URL(/https?:\/\/\S+/.exec(emails.sent[0]!.text)![0]).searchParams.get(
      'token',
    )!;
    const old = await signIn(person.email, person.password);
    await portal(app)
      .post('/v1/auth/reset-password', { token, password: 'new long password here' })
      .expect(200);

    // The old session is gone, and the link cannot be used twice.
    await portal(app).get('/v1/auth/me', old).expect(401);
    await portal(app)
      .post('/v1/auth/reset-password', { token, password: 'another long password' })
      .expect(410);
    await signIn(person.email, 'new long password here');
  });

  it('sends each church its share when many emails are waiting', async () => {
    const a = await church('AAA');
    const b = await church('BBB');
    for (let i = 0; i < 8; i++) {
      await portal(app)
        .post(
          '/v1/admin/users/invitations',
          {
            email: `a${i}@example.com`,
            fullName: `Person ${i}`,
            roleIds: [a.systemRole('admin.auditor')],
          },
          a.cookie,
        )
        .expect(201);
    }
    await portal(app)
      .post(
        '/v1/admin/users/invitations',
        { email: 'b0@example.com', fullName: 'B Person', roleIds: [b.systemRole('admin.auditor')] },
        b.cookie,
      )
      .expect(201);

    // One church's pile must not delay another church's single message.
    emails.sent.length = 0;
    await outbox.sendDue();
    expect(emails.sent.some((m) => m.to === 'b0@example.com')).toBe(true);
    expect(emails.sent.filter((m) => m.to.startsWith('a')).length).toBeLessThanOrEqual(5);
  });
});

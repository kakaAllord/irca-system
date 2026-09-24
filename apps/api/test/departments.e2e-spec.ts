import type { NestExpressApplication } from '@nestjs/platform-express';
import pg from 'pg';
import { MemoryEmailProvider } from '../src/core/email/providers/memory.provider.js';
import { EmailService } from '../src/core/email/email.service.js';
import { RegistrySync } from '../src/core/rbac/registry-sync.service.js';
import {
  createApp,
  createChurch,
  createDepartment,
  createLeader,
  createPerson,
  createUserWithPermissions,
  ownerDb,
  portal,
  sessionCookie,
  truncateAll,
} from './helpers.js';

const ADMIN = [
  'admin.departments.read',
  'admin.departments.manage',
  'admin.modules.read',
  'admin.modules.manage',
  'admin.roles.manage',
];

describe('departments, their leaders and their members (D28)', () => {
  let app: NestExpressApplication;
  let db: pg.Client;
  let emails: MemoryEmailProvider;

  beforeAll(async () => {
    app = await createApp();
    db = await ownerDb();
    emails = app.get(MemoryEmailProvider);
  });
  afterAll(async () => {
    await db.end();
    await app.close();
  });
  beforeEach(async () => {
    await truncateAll(db);
    emails.sent.length = 0;
    await createChurch(db, 'IRCA', ['admin']);
    await app.get(RegistrySync).sync();
  });

  const signIn = async (email: string, password: string) =>
    sessionCookie(await portal(app).post('/v1/auth/login', { email, password }).expect(200));

  async function administrator() {
    const admin = await createUserWithPermissions(db, ADMIN);
    return signIn(admin.email, admin.password);
  }

  it('names only a confirmed member a leader, and only once at a time', async () => {
    const cookie = await administrator();
    const { body: praise } = await portal(app)
      .post('/v1/admin/departments', { name: 'Praise team' }, cookie)
      .expect(201);
    const visitor = await createPerson(db, { fullName: 'Juma Visitor', email: 'juma@example.com' });

    const refused = await portal(app)
      .post(
        `/v1/admin/departments/${praise.id}/leaders`,
        { personId: visitor.id, title: 'Chairperson' },
        cookie,
      )
      .expect(422);
    expect(refused.body.error.code).toBe('NOT_CONFIRMED_MEMBER');
    expect(refused.body.error.message).toMatch(/not a confirmed member/);

    const member = await createPerson(db, {
      fullName: 'Rehema Mushi',
      stage: 'CONFIRMED_MEMBER',
      email: 'rehema@example.com',
    });
    await portal(app)
      .post(
        `/v1/admin/departments/${praise.id}/leaders`,
        { personId: member.id, title: 'Chairperson' },
        cookie,
      )
      .expect(201);
    const twice = await portal(app)
      .post(
        `/v1/admin/departments/${praise.id}/leaders`,
        { personId: member.id, title: 'Secretary' },
        cookie,
      )
      .expect(409);
    expect(twice.body.error.code).toBe('ALREADY_LEADS');
  });

  it('asks for an email when a new leader has none on record', async () => {
    const cookie = await administrator();
    const dept = await createDepartment(db, { name: 'Choir' });
    const member = await createPerson(db, { stage: 'CONFIRMED_MEMBER', email: '' });

    const res = await portal(app)
      .post(
        `/v1/admin/departments/${dept.id}/leaders`,
        { personId: member.id, title: 'Secretary' },
        cookie,
      )
      .expect(422);
    expect(res.body.error.details.email).toBeDefined();
    const { rows } = await db.query(`select 1 from department_leaders`);
    expect(rows).toHaveLength(0);
  });

  it('invites a new leader, who signs in, sees their department and adds a member', async () => {
    const cookie = await administrator();
    const { body: praise } = await portal(app)
      .post('/v1/admin/departments', { name: 'Praise team' }, cookie)
      .expect(201);
    const chair = await createPerson(db, {
      fullName: 'Rehema Mushi',
      stage: 'CONFIRMED_MEMBER',
      email: 'rehema@example.com',
    });

    const named = await portal(app)
      .post(
        `/v1/admin/departments/${praise.id}/leaders`,
        { personId: chair.id, title: 'Chairperson' },
        cookie,
      )
      .expect(201);
    expect(named.body).toEqual({ invited: true });

    // The account exists, belongs to her person record, and holds no role.
    const { rows: users } = await db.query<{ status: string; person_id: string }>(
      `select status, person_id from users where email = 'rehema@example.com'`,
    );
    expect(users[0]).toEqual({ status: 'INVITED', person_id: chair.id });
    const { rows: roles } = await db.query(
      `select 1 from user_roles ur join users u on u.id = ur.user_id where u.email = 'rehema@example.com'`,
    );
    expect(roles).toHaveLength(0);

    await app.get(EmailService).sendDue();
    const email = emails.sent.at(-1)!;
    expect(email.text).toContain('Chairperson of Praise team');
    const token = new URL(/https?:\/\/\S+/.exec(email.text)![0]).searchParams.get('token')!;
    const accepted = await portal(app)
      .post(`/v1/invitations/${token}/accept`, { password: 'kilimanjaro sunrise tea' })
      .expect(200);
    const leader = sessionCookie(accepted);

    const me = await portal(app).get('/v1/auth/me', leader).expect(200);
    expect(me.body.permissions).toEqual(
      expect.arrayContaining(['departments.own.read', 'departments.own.members']),
    );
    expect(me.body.roleLabels).toEqual(['Chairperson, Praise team']);
    expect(me.body.modules.map((m: { key: string }) => m.key)).toContain('departments');

    const mine = await portal(app).get('/v1/departments/mine', leader).expect(200);
    expect(mine.body).toMatchObject([{ id: praise.id, name: 'Praise team', title: 'Chairperson' }]);

    // Anyone in People can be a member; a visitor is fine.
    const singer = await createPerson(db, { fullName: 'Amani Singer', phone: '754000123' });
    const found = await portal(app)
      .get(`/v1/departments/${praise.id}/member-candidates?q=amani`, leader)
      .expect(200);
    expect(found.body).toEqual([
      { personId: singer.id, name: 'Amani Singer', stage: 'VISITOR', phoneTail: '…123' },
    ]);
    await portal(app)
      .post(`/v1/departments/${praise.id}/members`, { personId: singer.id }, leader)
      .expect(201);
    const detail = await portal(app).get(`/v1/departments/${praise.id}`, leader).expect(200);
    expect(detail.body.members).toMatchObject([{ name: 'Amani Singer', phoneTail: '…123' }]);
    // A leader is not told about accounts; that is the administrators' business.
    expect(detail.body.leaders[0].account).toBeNull();
  });

  it('links an existing account instead of inviting a second one', async () => {
    const cookie = await administrator();
    const dept = await createDepartment(db, { name: 'Ushers' });
    const staff = await createUserWithPermissions(db, ['admin.users.read'], {
      email: 'grace@example.com',
    });
    const person = await createPerson(db, {
      stage: 'CONFIRMED_MEMBER',
      email: 'grace@example.com',
    });

    const res = await portal(app)
      .post(
        `/v1/admin/departments/${dept.id}/leaders`,
        { personId: person.id, title: 'Chairperson' },
        cookie,
      )
      .expect(201);
    expect(res.body).toEqual({ invited: false });
    const { rows } = await db.query(`select person_id from users where id = $1`, [staff.id]);
    expect(rows[0].person_id).toBe(person.id);
    await app.get(EmailService).sendDue();
    expect(emails.sent).toHaveLength(0);
  });

  it('keeps a leader to their own department', async () => {
    const choir = await createDepartment(db, { name: 'Choir' });
    const ushers = await createDepartment(db, { name: 'Ushers' });
    const leader = await createLeader(db, choir.id);
    const cookie = await signIn(leader.email, leader.password);
    const someone = await createPerson(db);

    await portal(app)
      .post(`/v1/departments/${choir.id}/members`, { personId: someone.id }, cookie)
      .expect(201);
    const refused = await portal(app)
      .post(`/v1/departments/${ushers.id}/members`, { personId: someone.id }, cookie)
      .expect(403);
    expect(refused.body.error.message).toMatch(/do not lead/);
    await portal(app).get(`/v1/departments/${ushers.id}`, cookie).expect(403);
    // And naming leaders is never theirs.
    await portal(app)
      .post(
        `/v1/admin/departments/${choir.id}/leaders`,
        { personId: someone.id, title: 'Secretary' },
        cookie,
      )
      .expect(403);
  });

  it('takes a leader’s access away the moment the leadership ends', async () => {
    const cookie = await administrator();
    const choir = await createDepartment(db, { name: 'Choir' });
    const leader = await createLeader(db, choir.id);
    const theirs = await signIn(leader.email, leader.password);
    await portal(app).get('/v1/departments/mine', theirs).expect(200);

    await portal(app)
      .post(`/v1/admin/departments/${choir.id}/leaders/${leader.leaderId}/end`, {}, cookie)
      .expect(204);

    // Same session, next request: nothing to do with leading is left.
    const me = await portal(app).get('/v1/auth/me', theirs).expect(200);
    expect(me.body.permissions).not.toContain('departments.own.read');
    await portal(app).get('/v1/departments/mine', theirs).expect(403);

    // Archiving a department does the same for everyone who led it.
    const ushers = await createDepartment(db, { name: 'Ushers' });
    const other = await createLeader(db, ushers.id);
    const otherCookie = await signIn(other.email, other.password);
    await portal(app)
      .put(`/v1/admin/departments/${ushers.id}/archived`, { archived: true }, cookie)
      .expect(204);
    await portal(app).get('/v1/departments/mine', otherCookie).expect(403);
  });

  it('never lets a role hold what leading gives', async () => {
    const cookie = await administrator();
    const res = await portal(app)
      .post(
        '/v1/admin/roles',
        {
          moduleKey: 'departments',
          name: 'Pretend leader',
          description: '',
          permissionKeys: ['departments.own.members'],
        },
        cookie,
      )
      .expect(422);
    expect(res.body.error.message).toMatch(/leading a department/);
  });

  it('keeps who led and who belonged: the application cannot delete them', async () => {
    const appRole = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await appRole.connect();
    try {
      for (const table of ['departments', 'department_leaders', 'department_members']) {
        await expect(appRole.query(`delete from ${table}`)).rejects.toThrow(/permission denied/);
      }
    } finally {
      await appRole.end();
    }
  });
});

import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
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

describe('audiences: who a message reaches, and who may reach them', () => {
  let app: NestExpressApplication;
  let db: pg.Client;

  beforeAll(async () => {
    app = await createApp();
    db = await ownerDb();
  });
  afterAll(async () => {
    await db.end();
    await app.close();
  });
  beforeEach(async () => {
    await truncateAll(db);
    await createChurch(db, 'IRCA', ['admin', 'comms', 'membership']);
    await app.get(RegistrySync).sync();
  });

  const signIn = async (user: { email: string; password: string }) =>
    sessionCookie(await portal(app).post('/v1/auth/login', user).expect(200));
  const member = (departmentId: string, personId: string) =>
    db.query(`insert into department_members (id, department_id, person_id) values ($1, $2, $3)`, [
      randomUUID(),
      departmentId,
      personId,
    ]);
  const count = (cookie: string, departmentId: string | null, key: string, params = {}) =>
    portal(app).post(
      '/v1/comms/audience-count',
      { departmentId, audience: { key, params } },
      cookie,
    );

  it('leaves alone whoever opted out or is blocked, sends once per number, and counts them', async () => {
    const choir = await createDepartment(db, { name: 'Choir' });
    const leader = await createLeader(db, choir.id);
    const { rows } = await db.query(`select phone from people where id = $1`, [leader.personId]);
    // The leader is also listed as a member, and a second person shares her number.
    await member(choir.id, leader.personId);
    await member(choir.id, (await createPerson(db, { phone: rows[0].phone })).id);
    await member(choir.id, (await createPerson(db)).id);
    const stopped = await createPerson(db);
    await db.query(`update people set sms_opt_out = true where id = $1`, [stopped.id]);
    await member(choir.id, stopped.id);
    const blocked = await createPerson(db, { phone: '713000111' });
    await db.query(
      `insert into comms_blocked_numbers (phone, reason) values ('+255713000111', 'replied STOP')`,
    );
    await member(choir.id, blocked.id);
    await member(choir.id, (await createPerson(db, { phone: '12' })).id);

    const cookie = await signIn(leader);
    const res = await count(cookie, choir.id, 'departments.everyone', {
      departmentIds: [choir.id],
    }).expect(200);
    // Seven listed: the leader (once as leader, once as member), her twin number,
    // one ordinary member, one opted out, one blocked, one with no real number.
    expect(res.body).toEqual({ name: 'Everyone in Choir', reach: 2, leftAlone: 5 });
  });

  it('keeps a leader to their own department, and to what Communications gave it', async () => {
    const choir = await createDepartment(db, { name: 'Choir' });
    const ushers = await createDepartment(db, { name: 'Ushers' });
    const leader = await createLeader(db, choir.id);
    await createPerson(db, { stage: 'CONFIRMED_MEMBER' });
    const cookie = await signIn(leader);

    await count(cookie, choir.id, 'departments.leaders', { departmentIds: [choir.id] }).expect(200);
    const other = await count(cookie, ushers.id, 'departments.everyone', {
      departmentIds: [ushers.id],
    }).expect(403);
    expect(other.body.error.message).toMatch(/do not lead/);
    const across = await count(cookie, choir.id, 'departments.everyone', {
      departmentIds: [choir.id, ushers.id],
    }).expect(403);
    expect(across.body.error.message).toMatch(/its own people only/);
    await count(cookie, choir.id, 'departments.leaders', {}).expect(403);
    await count(cookie, null, 'church.members').expect(403);

    const wide = await count(cookie, choir.id, 'church.members').expect(403);
    expect(wide.body.error.message).toMatch(/has not been given "Confirmed members"/);
    let options = await portal(app)
      .get(`/v1/comms/audience-options?departmentId=${choir.id}`, cookie)
      .expect(200);
    expect(options.body.audiences.map((a: { key: string }) => a.key)).not.toContain(
      'church.members',
    );

    // Communications gives it, and it works; takes it back, and it does not.
    const lead = await signIn(
      await createUserWithPermissions(db, ['comms.audiences.manage', 'comms.audiences.read'], {
        moduleKey: 'comms',
      }),
    );
    await portal(app)
      .put(`/v1/comms/audiences/church.members/departments/${choir.id}`, {}, lead)
      .expect(204);
    await count(cookie, choir.id, 'church.members').expect(200);
    options = await portal(app)
      .get(`/v1/comms/audience-options?departmentId=${choir.id}`, cookie)
      .expect(200);
    expect(options.body.audiences.map((a: { key: string }) => a.key)).toContain('church.members');
    const listed = await portal(app).get('/v1/comms/audiences', lead).expect(200);
    // The confirmed member made above, and the leader, who has to be one.
    expect(listed.body.find((a: { key: string }) => a.key === 'church.members')).toMatchObject({
      reach: 2,
      departments: [{ id: choir.id, name: 'Choir' }],
    });

    await portal(app)
      .del(`/v1/comms/audiences/church.members/departments/${choir.id}`, lead)
      .expect(204);
    await count(cookie, choir.id, 'church.members').expect(403);
  });

  it('lets Communications reach every leader at once, or the leaders of the departments it picks', async () => {
    const choir = await createDepartment(db, { name: 'Choir' });
    const ushers = await createDepartment(db, { name: 'Ushers' });
    await createLeader(db, choir.id);
    await createLeader(db, choir.id, 'Secretary');
    await createLeader(db, ushers.id);
    const cookie = await signIn(
      await createUserWithPermissions(db, ['comms.messages.send'], { moduleKey: 'comms' }),
    );

    expect((await count(cookie, null, 'departments.leaders').expect(200)).body).toMatchObject({
      name: 'Every department leader',
      reach: 3,
    });
    expect(
      (await count(cookie, null, 'departments.leaders', { departmentIds: [ushers.id] }).expect(200))
        .body,
    ).toMatchObject({ name: 'Leaders of Ushers', reach: 1 });
    expect(
      (
        await count(cookie, null, 'departments.everyone', {
          departmentIds: [choir.id, ushers.id],
        }).expect(200)
      ).body,
    ).toMatchObject({ name: 'Everyone in Choir and Ushers', reach: 3 });

    const missing = await count(cookie, null, 'departments.everyone', { departmentIds: [] }).expect(
      422,
    );
    expect(missing.body.error.details.audience).toEqual(['Choose at least one department']);
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { outreachModule } from '@irca/shared';
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

describe('Outreach (Phase 8)', () => {
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
    await createChurch(db, 'IRCA', ['admin', 'outreach']);
    await app.get(RegistrySync).sync();
  });

  const signIn = async (email: string, password: string) =>
    sessionCookie(await portal(app).post('/v1/auth/login', { email, password }).expect(200));
  const MEMBER = outreachModule.systemRoles.find((r) => r.key === 'outreach.member')!.permissions;
  const VIEWER = outreachModule.systemRoles.find((r) => r.key === 'outreach.viewer')!.permissions;

  /** The Outreach department, its leader signed in, and three members. */
  async function outreach() {
    const department = await createDepartment(db, { name: 'Outreach', moduleKey: 'outreach' });
    const leader = await createLeader(db, department.id);
    const members = [];
    for (const fullName of ['Peter Mushi', 'John Laizer', 'Grace Kimaro']) {
      const person = await createPerson(db, { fullName });
      await db.query(
        `insert into department_members (id, department_id, person_id) values ($1, $2, $3)`,
        [randomUUID(), department.id, person.id],
      );
      members.push(person.id);
    }
    return {
      department,
      leader,
      members,
      cookie: await signIn(leader.email, leader.password),
    };
  }

  /** Someone who records on Saturdays: the Outreach member role, and no leadership. */
  async function member() {
    const user = await createUserWithPermissions(db, MEMBER, { moduleKey: 'outreach' });
    return signIn(user.email, user.password);
  }

  /** A pastor or overseer: reads everything, changes nothing. */
  async function viewer() {
    const user = await createUserWithPermissions(db, VIEWER, { moduleKey: 'outreach' });
    return signIn(user.email, user.password);
  }

  const permissionsOf = async (cookie: string) =>
    (await portal(app).get('/v1/auth/me', cookie).expect(200)).body.permissions as string[];

  describe("a portal's own leaders run it (D29)", () => {
    it('gives Outreach to its leaders, and not to the leaders of other departments', async () => {
      const outreach = await createDepartment(db, { name: 'Outreach', moduleKey: 'outreach' });
      const choir = await createDepartment(db, { name: 'Choir' });
      const theirs = await createLeader(db, outreach.id);
      const other = await createLeader(db, choir.id);

      const leading = await permissionsOf(await signIn(theirs.email, theirs.password));
      expect(leading).toContain('outreach.sessions.manage');
      expect(leading).toContain('outreach.dashboard.read');
      // And what every leader holds, for their own department.
      expect(leading).toContain('departments.own.members');

      const elsewhere = await permissionsOf(await signIn(other.email, other.password));
      expect(elsewhere).toContain('departments.own.members');
      expect(elsewhere.filter((p) => p.startsWith('outreach.'))).toEqual([]);
    });

    it('takes it away when the leadership ends, the department is archived or the portal is off', async () => {
      const outreach = await createDepartment(db, { name: 'Outreach', moduleKey: 'outreach' });
      const leader = await createLeader(db, outreach.id);
      const cookie = await signIn(leader.email, leader.password);
      const holds = async () => (await permissionsOf(cookie)).includes('outreach.sessions.manage');
      expect(await holds()).toBe(true);

      await db.query(`update module_state set enabled = false where module_key = 'outreach'`);
      expect(await holds()).toBe(false);
      await db.query(`update module_state set enabled = true where module_key = 'outreach'`);
      expect(await holds()).toBe(true);

      await db.query(`update departments set archived_at = now() where id = $1`, [outreach.id]);
      expect(await holds()).toBe(false);
      await db.query(`update departments set archived_at = null where id = $1`, [outreach.id]);
      expect(await holds()).toBe(true);

      await db.query(`update department_leaders set ended_at = now() where id = $1`, [
        leader.leaderId,
      ]);
      expect(await holds()).toBe(false);
    });
  });

  describe('the team and partner groups (8.4)', () => {
    it('is the department: its leaders and members, and nobody else', async () => {
      const { cookie, members, leader } = await outreach();
      await createPerson(db, { fullName: 'Not On The Team' });
      const choir = await createDepartment(db, { name: 'Choir' });
      await createLeader(db, choir.id);

      const { body } = await portal(app).get('/v1/outreach/team', cookie).expect(200);
      expect(body.youLead).toBe(true);
      expect(body.people.map((p: { personId: string }) => p.personId).sort()).toEqual(
        [leader.personId, ...members].sort(),
      );
      expect(
        body.people.find((p: { personId: string }) => p.personId === leader.personId).title,
      ).toBe('Chairperson');
      // A member sees the team too, and is told they do not keep it.
      const theirs = await portal(app)
        .get('/v1/outreach/team', await member())
        .expect(200);
      expect(theirs.body.youLead).toBe(false);
    });

    it('makes a group of two or three from the team, and names whoever is not on it', async () => {
      const { cookie, members } = await outreach();
      const outsider = await createPerson(db, { fullName: 'Juma Outsider' });

      await portal(app)
        .post('/v1/outreach/groups', { name: 'Alone', personIds: [members[0]] }, cookie)
        .expect(422);
      await portal(app)
        .post(
          '/v1/outreach/groups',
          { name: 'Crowd', personIds: [...members, outsider.id] },
          cookie,
        )
        .expect(422);
      const refused = await portal(app)
        .post(
          '/v1/outreach/groups',
          { name: 'Mixed', personIds: [members[0], outsider.id] },
          cookie,
        )
        .expect(422);
      expect(refused.body.error.message).toMatch(/Juma Outsider is not on the Outreach team/);

      const made = await portal(app)
        .post('/v1/outreach/groups', { name: 'Njiro pair', personIds: members.slice(0, 2) }, cookie)
        .expect(201);
      const twice = await portal(app)
        .post('/v1/outreach/groups', { name: 'njiro PAIR', personIds: members.slice(1, 3) }, cookie)
        .expect(409);
      expect(twice.body.error.code).toBe('ALREADY_EXISTS');

      // Switched off, never deleted.
      await portal(app)
        .put(`/v1/outreach/groups/${made.body.id}/active`, { active: false }, cookie)
        .expect(204);
      const { body } = await portal(app).get('/v1/outreach/team', cookie).expect(200);
      expect(body.groups).toEqual([expect.objectContaining({ name: 'Njiro pair', active: false })]);
    });

    it('leaves groups to the leaders', async () => {
      const { members } = await outreach();
      const refused = await portal(app)
        .post(
          '/v1/outreach/groups',
          { name: 'Pair', personIds: members.slice(0, 2) },
          await member(),
        )
        .expect(403);
      expect(refused.body.error.details.required).toEqual(['outreach.groups.manage']);
    });
  });
  describe('Saturdays (8.5)', () => {
    /** A planned Saturday with one team, made by the leader. */
    async function saturday(cookie: string, personIds: string[], area = 'Sombetini') {
      const session = await portal(app)
        .post('/v1/outreach/sessions', { heldOn: '2026-09-26', title: 'Sombetini push' }, cookie)
        .expect(201);
      const team = await portal(app)
        .post(`/v1/outreach/sessions/${session.body.id}/teams`, { area, personIds }, cookie)
        .expect(201);
      return { sessionId: session.body.id as string, teamId: team.body.id as string };
    }

    it('plans a Saturday, sends teams from the team, and closes it', async () => {
      const { cookie, members } = await outreach();
      const outsider = await createPerson(db, { fullName: 'Juma Outsider' });
      const { sessionId, teamId } = await saturday(cookie, members.slice(0, 2));

      const refused = await portal(app)
        .post(
          `/v1/outreach/sessions/${sessionId}/teams`,
          { area: 'Kaloleni', personIds: [members[2], outsider.id] },
          cookie,
        )
        .expect(422);
      expect(refused.body.error.message).toMatch(/Juma Outsider is not on the Outreach team/);

      const { body } = await portal(app)
        .get(`/v1/outreach/sessions/${sessionId}`, cookie)
        .expect(200);
      expect(body).toMatchObject({ heldOn: '2026-09-26', status: 'PLANNED' });
      expect(body.teams).toEqual([
        expect.objectContaining({ id: teamId, area: 'Sombetini', reached: 0 }),
      ]);
      expect(body.teams[0].people.map((p: { name: string }) => p.name)).toEqual([
        'John Laizer',
        'Peter Mushi',
      ]);

      await portal(app)
        .put(`/v1/outreach/sessions/${sessionId}/status`, { status: 'COMPLETED' }, cookie)
        .expect(204);
      // A closed Saturday keeps its teams until it is opened again.
      await portal(app)
        .put(
          `/v1/outreach/sessions/${sessionId}/teams/${teamId}`,
          { area: 'Elsewhere', personIds: members.slice(0, 1) },
          cookie,
        )
        .expect(409);
      await portal(app)
        .put(`/v1/outreach/sessions/${sessionId}/status`, { status: 'PLANNED' }, cookie)
        .expect(204);
      await portal(app)
        .del(`/v1/outreach/sessions/${sessionId}/teams/${teamId}`, cookie)
        .expect(204);

      // Areas already used come back as suggestions.
      await saturday(cookie, members.slice(0, 1), 'Sombetini');
      const areas = await portal(app).get('/v1/outreach/areas?q=somb', cookie).expect(200);
      expect(areas.body).toEqual(['Sombetini']);

      const list = await portal(app).get('/v1/outreach/sessions', cookie).expect(200);
      expect(list.body).toHaveLength(2);
    });

    it('lets the team type who they spoke to, and leaves planning to the leaders', async () => {
      const { cookie, members } = await outreach();
      const { sessionId, teamId } = await saturday(cookie, members.slice(0, 2));
      const theirs = await member();

      await portal(app)
        .put(`/v1/outreach/teams/${teamId}/spoken-to`, { spokenToOnly: 7 }, theirs)
        .expect(204);
      const { body } = await portal(app)
        .get(`/v1/outreach/sessions/${sessionId}`, theirs)
        .expect(200);
      expect(body.teams[0].spokenToOnly).toBe(7);

      const refused = await portal(app)
        .post('/v1/outreach/sessions', { heldOn: '2026-10-03' }, theirs)
        .expect(403);
      expect(refused.body.error.details.required).toEqual(['outreach.sessions.manage']);
    });
  });
  describe('the people reached (8.5)', () => {
    const neema = {
      fullName: 'Neema Mollel',
      dial: '+255',
      phone: '0712 345 678',
      mayMessage: true,
    };

    it('records someone in four fields, and fills the rest from their team', async () => {
      const { cookie, members } = await outreach();
      const session = await portal(app)
        .post('/v1/outreach/sessions', { heldOn: '2026-09-19' }, cookie)
        .expect(201);
      const team = await portal(app)
        .post(
          `/v1/outreach/sessions/${session.body.id}/teams`,
          { area: 'Sombetini', personIds: members.slice(0, 2) },
          cookie,
        )
        .expect(201);

      const saved = await portal(app)
        .post('/v1/outreach/reached', { ...neema, teamId: team.body.id }, await member())
        .expect(201);
      expect(saved.body.known).toBe(false);

      const person = await db.query(
        `select full_name, phone, source, stage, sms_opt_out from people where id = $1`,
        [saved.body.personId],
      );
      expect(person.rows[0]).toEqual({
        full_name: 'Neema Mollel',
        phone: '0712345678',
        source: 'OUTREACH',
        stage: 'VISITOR',
        sms_opt_out: false,
      });
      const lines = await db.query(
        `select kind, summary, at::date::text as on from person_interactions where person_id = $1`,
        [saved.body.personId],
      );
      expect(lines.rows).toEqual([
        {
          kind: 'EVANGELISED',
          summary: 'Evangelised by Peter Mushi and John Laizer, Sombetini',
          on: '2026-09-19',
        },
      ]);

      const { body } = await portal(app).get('/v1/outreach/reached', cookie).expect(200);
      expect(body.rows).toEqual([
        expect.objectContaining({
          name: 'Neema Mollel',
          phone: '+255 0712345678',
          area: 'Sombetini',
          reachedOn: '2026-09-19',
          reachedBy: ['Peter Mushi', 'John Laizer'],
          thin: { phone: false, area: false },
        }),
      ]);

      // Filled in later: the area, the note, whether they still need following up.
      await portal(app)
        .patch(
          `/v1/outreach/reached/${body.rows[0].id}`,
          { note: 'Lives behind the market', needsFollowUp: false },
          cookie,
        )
        .expect(204);
    });

    it('opts a new person out when they said no', async () => {
      const { cookie } = await outreach();
      const no = await portal(app)
        .post('/v1/outreach/reached', { ...neema, mayMessage: false }, cookie)
        .expect(201);
      const optOut = async (id: string) =>
        (await db.query(`select sms_opt_out, sms_opt_out_source from people where id = $1`, [id]))
          .rows[0];
      expect(await optOut(no.body.personId)).toEqual({
        sms_opt_out: true,
        sms_opt_out_source: 'outreach',
      });
    });

    it('leaves a viewer reading, never writing', async () => {
      const { cookie, members } = await outreach();
      const session = await portal(app)
        .post('/v1/outreach/sessions', { heldOn: '2026-09-19' }, cookie)
        .expect(201);
      const reached = await portal(app).post('/v1/outreach/reached', neema, cookie).expect(201);
      const theirs = await viewer();

      await portal(app).get('/v1/outreach/reached', theirs).expect(200);
      await portal(app).get(`/v1/outreach/sessions/${session.body.id}`, theirs).expect(200);
      await portal(app).post('/v1/outreach/reached', neema, theirs).expect(403);
      await portal(app)
        .patch(`/v1/outreach/reached/${reached.body.reachedId}`, { note: 'x' }, theirs)
        .expect(403);
      await portal(app).post('/v1/outreach/sessions', { heldOn: '2026-09-26' }, theirs).expect(403);
      await portal(app)
        .post('/v1/outreach/groups', { name: 'Pair', personIds: members.slice(0, 2) }, theirs)
        .expect(403);
    });
  });
});

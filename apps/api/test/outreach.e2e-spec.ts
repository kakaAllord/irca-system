import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { outreachModule } from '@irca/shared';
import { RegistrySync } from '../src/core/rbac/registry-sync.service.js';
import { UsageSnapshot } from '../src/core/usage/usage-snapshot.service.js';
import { UsageService } from '../src/core/usage/usage.service.js';
import { MemoryFileStorage } from '../src/core/files/memory.storage.js';
import {
  createApp,
  createChurch,
  createDepartment,
  createLeader,
  createPerson,
  createTemplate,
  createUserWithPermissions,
  ownerDb,
  portal,
  sessionCookie,
  setCommsSettings,
  truncateAll,
} from './helpers.js';
import { guardedRoutes, refusedByGuard } from './routes.js';

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
    await createChurch(db, 'IRCA', ['admin', 'comms', 'membership', 'outreach']);
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

    it('keeps who was partnered with whom, from when until when', async () => {
      const { cookie, members } = await outreach();
      const [peter, john, grace] = members as [string, string, string];
      const made = await portal(app)
        .post('/v1/outreach/groups', { name: 'Njiro pair', personIds: [peter, john] }, cookie)
        .expect(201);
      const group = async () =>
        (await portal(app).get('/v1/outreach/team', cookie).expect(200)).body.groups[0] as {
          active: boolean;
          people: { personId: string }[];
          history: { personId: string; from: string; to: string | null }[];
        };

      // John makes way for Grace: his row ends, hers starts, Peter's runs on.
      await portal(app)
        .put(
          `/v1/outreach/groups/${made.body.id}`,
          { name: 'Njiro pair', personIds: [peter, grace] },
          cookie,
        )
        .expect(204);
      let g = await group();
      expect(g.people.map((p) => p.personId).sort()).toEqual([peter, grace].sort());
      const rowOf = (id: string) => g.history.filter((h) => h.personId === id);
      expect(rowOf(peter)).toEqual([expect.objectContaining({ to: null })]);
      expect(rowOf(john)).toEqual([expect.objectContaining({ to: expect.any(String) })]);
      expect(rowOf(grace)).toEqual([expect.objectContaining({ to: null })]);

      // Switched off, the partnership ends; brought back, it starts again with the same people.
      await portal(app)
        .put(`/v1/outreach/groups/${made.body.id}/active`, { active: false }, cookie)
        .expect(204);
      g = await group();
      expect(g.people).toEqual([]);
      expect(g.history.every((h) => h.to !== null)).toBe(true);
      await portal(app)
        .put(`/v1/outreach/groups/${made.body.id}/active`, { active: true }, cookie)
        .expect(204);
      g = await group();
      expect(g.people.map((p) => p.personId).sort()).toEqual([peter, grace].sort());
      expect(g.history).toHaveLength(5);

      // The history is never rewritten by the application.
      const appRole = new pg.Client({ connectionString: process.env.DATABASE_URL });
      await appRole.connect();
      try {
        await expect(appRole.query('delete from outreach_group_members')).rejects.toThrow(
          /permission denied/,
        );
        await expect(
          appRole.query('update outreach_group_members set added_at = now()'),
        ).rejects.toThrow(/permission denied/);
      } finally {
        await appRole.end();
      }
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
  describe('a big team', () => {
    it('takes a team of a hundred and fifty: its list, a Saturday team and a register', async () => {
      const { cookie, department } = await outreach();
      const values: string[] = [];
      const params: string[] = [];
      for (let i = 0; i < 147; i++) {
        const id = randomUUID();
        params.push(id);
        values.push(`($${params.length}::uuid, 'Team Member ${i + 1}', now())`);
      }
      await db.query(
        `insert into people (id, full_name, updated_at) values ${values.join(', ')}`,
        params,
      );
      await db.query(
        `insert into department_members (id, department_id, person_id)
         select gen_random_uuid(), $1, id from people where full_name like 'Team Member %'`,
        [department.id],
      );

      const team = await portal(app).get('/v1/outreach/team', cookie).expect(200);
      expect(team.body.people).toHaveLength(151);
      const everyone = team.body.people.map((p: { personId: string }) => p.personId) as string[];

      const session = await portal(app)
        .post('/v1/outreach/sessions', { heldOn: '2026-09-19' }, cookie)
        .expect(201);
      await portal(app)
        .post(
          `/v1/outreach/sessions/${session.body.id}/teams`,
          { area: 'Everywhere', personIds: everyone.slice(0, 60) },
          cookie,
        )
        .expect(201);

      const training = await portal(app)
        .post(
          '/v1/outreach/trainings',
          { topic: 'All hands', date: '2026-09-18', time: '18:00' },
          cookie,
        )
        .expect(201);
      await portal(app)
        .put(
          `/v1/outreach/trainings/${training.body.id}/attendance`,
          { marks: everyone.map((personId) => ({ personId, mark: 'ATTENDED' })) },
          cookie,
        )
        .expect(204);
      const marked = await portal(app)
        .get(`/v1/outreach/trainings/${training.body.id}`, cookie)
        .expect(200);
      expect(
        marked.body.register.filter((p: { mark: string }) => p.mark === 'ATTENDED'),
      ).toHaveLength(151);
    }, 60_000);
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
          phone: '+255712345678',
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

    it('asks "same person?" for a number already known, however it was typed', async () => {
      const { cookie } = await outreach();
      const first = await portal(app).post('/v1/outreach/reached', neema, cookie).expect(201);

      const asked = await portal(app)
        .post(
          '/v1/outreach/reached',
          { ...neema, fullName: 'Neema M.', phone: '+255712345678' },
          cookie,
        )
        .expect(409);
      expect(asked.body.error.code).toBe('POSSIBLE_MATCH');
      expect(asked.body.error.details.candidates).toEqual([
        {
          personId: first.body.personId,
          name: 'Neema Mollel',
          last: expect.stringMatching(/^reached /),
        },
      ]);

      // Same person: a second reach and a second line, on one person.
      const same = await portal(app)
        .post('/v1/outreach/reached', { ...neema, samePersonId: first.body.personId }, cookie)
        .expect(201);
      expect(same.body).toMatchObject({ personId: first.body.personId, known: true });
      const count = await db.query(
        `select (select count(*)::int from people) as people,
                (select count(*)::int from person_interactions where person_id = $1) as lines`,
        [first.body.personId],
      );
      expect(count.rows[0]).toEqual({ people: 5, lines: 2 }); // the leader, three members, and Neema

      // Someone else: a new person, even with the same number.
      const other = await portal(app)
        .post(
          '/v1/outreach/reached',
          { ...neema, fullName: 'Neema Sister', notSamePerson: true },
          cookie,
        )
        .expect(201);
      expect(other.body.personId).not.toBe(first.body.personId);
    });

    it('refuses a reach on a Saturday still to come', async () => {
      const { cookie, members } = await outreach();
      const ahead = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
      const session = await portal(app)
        .post('/v1/outreach/sessions', { heldOn: ahead }, cookie)
        .expect(201);
      const team = await portal(app)
        .post(
          `/v1/outreach/sessions/${session.body.id}/teams`,
          { area: 'Sombetini', personIds: members.slice(0, 1) },
          cookie,
        )
        .expect(201);
      const refused = await portal(app)
        .post('/v1/outreach/reached', { ...neema, teamId: team.body.id }, cookie)
        .expect(422);
      expect(refused.body.error.message).toMatch(/has not come yet/);
    });

    it('matches on the name only when there is no number', async () => {
      const { cookie } = await outreach();
      await createPerson(db, { fullName: 'Baraka Swai' });
      const asked = await portal(app)
        .post('/v1/outreach/reached', { fullName: 'Baraka Swai', mayMessage: true }, cookie)
        .expect(409);
      expect(asked.body.error.details.candidates[0]).toMatchObject({
        name: 'Baraka Swai',
        last: expect.stringMatching(/^registered /),
      });
    });

    it('opts a new person out when they said no, and never back in', async () => {
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
      // A yes on a later Saturday does not undo it: only the person, through the office, can.
      await portal(app)
        .post(
          '/v1/outreach/reached',
          { ...neema, mayMessage: true, samePersonId: no.body.personId },
          cookie,
        )
        .expect(201);
      expect((await optOut(no.body.personId)).sms_opt_out).toBe(true);
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
  describe('follow-up and the timeline (8.6)', () => {
    const grace = { fullName: 'Grace Lema', dial: '+255', phone: '0754 111 222', mayMessage: true };

    it('keeps every call and visit, in order, with who recorded it', async () => {
      const { cookie } = await outreach();
      const { body } = await portal(app).post('/v1/outreach/reached', grace, cookie).expect(201);
      const theirs = await member();
      const follow = (kind: string, note: string, on: string, who = theirs) =>
        portal(app)
          .post(`/v1/outreach/people/${body.personId}/followups`, { kind, note, on }, who)
          .expect(204);
      await follow('CALL', 'no answer', '2026-09-01');
      await follow('CALL', 'will come on Sunday', '2026-09-02');
      await follow('VISIT', 'met her husband', '2026-09-03', cookie);
      await follow('CALL', 'reminded her', '2026-09-04');
      await follow('VISIT', 'prayed together', '2026-09-05');
      await follow('ATTENDED_SERVICE', '', '2026-09-06', cookie);
      await follow('ATTENDED_SERVICE', '', '2026-09-07', cookie);

      const person = await portal(app)
        .get(`/v1/outreach/people/${body.personId}`, theirs)
        .expect(200);
      expect(
        person.body.timeline
          .slice(0, 7)
          .map((l: { summary: string; portal: string }) => `${l.summary} · ${l.portal}`),
      ).toEqual([
        'Follow-up call — no answer · Outreach',
        'Follow-up call — will come on Sunday · Outreach',
        'Home visit — met her husband · Outreach',
        'Follow-up call — reminded her · Outreach',
        'Home visit — prayed together · Outreach',
        'First time at church · Outreach',
        'Came to church again · Outreach',
      ]);
      // Recorded today, after all of those: the doorstep itself comes last here.
      expect(person.body.timeline.at(-1).summary).toBe('Evangelised');
      // Each line says which staff account recorded it.
      expect(person.body.timeline.every((l: { by: string | null }) => l.by)).toBe(true);
    });

    it('shows one timeline in both portals', async () => {
      const { cookie } = await outreach();
      const { body } = await portal(app).post('/v1/outreach/reached', grace, cookie).expect(201);
      // Something Membership recorded about her.
      await db.query(
        `insert into person_interactions (id, person_id, kind, at, module_key, summary)
         values (gen_random_uuid(), $1, 'CONFIRMED', now(), 'membership', 'Confirmed as a member')`,
        [body.personId],
      );
      await portal(app)
        .post(`/v1/outreach/people/${body.personId}/followups`, { kind: 'CALL' }, cookie)
        .expect(204);

      const office = await createUserWithPermissions(db, ['membership.people.read'], {
        moduleKey: 'membership',
      });
      const inMembership = await portal(app)
        .get(
          `/v1/membership/people/${body.personId}/timeline`,
          await signIn(office.email, office.password),
        )
        .expect(200);
      const inOutreach = await portal(app)
        .get(`/v1/outreach/people/${body.personId}`, await member())
        .expect(200);
      const lines = (t: { summary: string }[]) => t.map((l) => l.summary).sort();
      expect(lines(inMembership.body)).toEqual([
        'Confirmed as a member',
        'Evangelised',
        'Follow-up call',
      ]);
      expect(lines(inOutreach.body.timeline)).toEqual(lines(inMembership.body));
    });

    it('answers 404 for anyone Outreach never reached', async () => {
      const { cookie } = await outreach();
      const stranger = await createPerson(db, { fullName: 'Not Reached' });
      const theirs = await member();
      await portal(app).get(`/v1/outreach/people/${stranger.id}`, theirs).expect(404);
      await portal(app)
        .post(`/v1/outreach/people/${stranger.id}/followups`, { kind: 'CALL' }, cookie)
        .expect(404);
      await portal(app).get(`/v1/outreach/people/not-a-uuid`, theirs).expect(404);
      // And nothing under Membership at all.
      await portal(app).get(`/v1/membership/people/${stranger.id}`, theirs).expect(403);
    });

    it('lists who still needs following up, until someone says they are done', async () => {
      const { cookie } = await outreach();
      const { body } = await portal(app).post('/v1/outreach/reached', grace, cookie).expect(201);
      const pending = async () =>
        (await portal(app).get('/v1/outreach/followup', cookie).expect(200)).body as {
          name: string;
          phone: string;
        }[];
      expect(await pending()).toEqual([
        expect.objectContaining({ name: 'Grace Lema', phone: '+255754111222' }),
      ]);
      await portal(app)
        .post(
          `/v1/outreach/people/${body.personId}/followups`,
          { kind: 'VISIT', done: true },
          cookie,
        )
        .expect(204);
      expect(await pending()).toEqual([]);
      // A viewer reads it and records nothing.
      await portal(app)
        .post(`/v1/outreach/people/${body.personId}/followups`, { kind: 'CALL' }, await viewer())
        .expect(403);
    });
  });
  describe('Friday training (8.7)', () => {
    /** Seven more on the team, making ten with the leader and the three members. */
    async function tenOnTheTeam(departmentId: string) {
      for (let i = 1; i <= 6; i++) {
        const person = await createPerson(db, { fullName: `Team Member ${i}` });
        await db.query(
          `insert into department_members (id, department_id, person_id) values ($1, $2, $3)`,
          [randomUUID(), departmentId, person.id],
        );
      }
    }

    it('marks who came, once on each timeline however often it is marked', async () => {
      const { cookie, department } = await outreach();
      await tenOnTheTeam(department.id);
      const made = await portal(app)
        .post(
          '/v1/outreach/trainings',
          {
            topic: 'Sharing your story',
            trainer: 'Pastor Sarah',
            date: '2026-09-18',
            time: '18:00',
          },
          cookie,
        )
        .expect(201);
      const { body } = await portal(app)
        .get(`/v1/outreach/trainings/${made.body.id}`, cookie)
        .expect(200);
      expect(body).toMatchObject({ date: '2026-09-18', time: '18:00' });
      // 18:00 in Arusha is 15:00 UTC.
      expect(body.heldAt).toBe('2026-09-18T15:00:00.000Z');
      expect(body.register).toHaveLength(10);

      const marks = body.register.map((p: { personId: string }, i: number) => ({
        personId: p.personId,
        mark: i === 0 ? 'MISSED' : 'ATTENDED',
      }));
      await portal(app)
        .put(`/v1/outreach/trainings/${made.body.id}/attendance`, { marks }, cookie)
        .expect(204);
      // Marked again: still nine lines.
      await portal(app)
        .put(`/v1/outreach/trainings/${made.body.id}/attendance`, { marks }, cookie)
        .expect(204);
      const lines = await db.query(
        `select count(*)::int as n from person_interactions where kind = 'TRAINING'`,
      );
      expect(lines.rows[0].n).toBe(9);

      const history = await portal(app).get('/v1/outreach/trainings/history', cookie).expect(200);
      expect(history.body.trainings).toHaveLength(1);
      expect(
        history.body.people.filter((p: { marks: string[] }) => p.marks[0] === 'ATTENDED'),
      ).toHaveLength(9);

      // Only the leaders mark it.
      await portal(app)
        .put(`/v1/outreach/trainings/${made.body.id}/attendance`, { marks }, await member())
        .expect(403);
    });

    it('reminds the team through the department, and only its leaders send', async () => {
      const { cookie, department } = await outreach();
      await setCommsSettings(db, { dailyCap: '50000' });
      const template = await createTemplate(db, {
        departmentId: department.id,
        name: 'Training reminder',
        bodies: { sw: 'Mafunzo ni Ijumaa saa 12 jioni.', en: 'Training is on Friday at 6pm.' },
      });
      const request = {
        departmentId: department.id,
        audience: { key: 'departments.everyone', params: { departmentIds: [department.id] } },
        templateId: template.id,
        fields: {},
      };
      const preview = await portal(app)
        .post('/v1/comms/messages/preview', request, cookie)
        .expect(200);
      expect(preview.body.reach).toBe(4);
      const sent = await portal(app).post('/v1/comms/messages', request, cookie).expect(201);
      expect(sent.body.recipientCount).toBe(4);

      // An Outreach member who does not lead the department sends nothing.
      await portal(app)
        .post('/v1/comms/messages', request, await member())
        .expect(403);
    });

    it('keeps the people reached from Outreach until Communications grants them', async () => {
      const { cookie, department } = await outreach();
      await portal(app)
        .post(
          '/v1/outreach/reached',
          { fullName: 'Juma Reached', phone: '0765 000 111', mayMessage: true },
          cookie,
        )
        .expect(201);
      const count = () =>
        portal(app).post(
          '/v1/comms/audience-count',
          { departmentId: department.id, audience: { key: 'outreach.reached', params: {} } },
          cookie,
        );
      await count().expect(403);

      const comms = await createUserWithPermissions(
        db,
        ['comms.audiences.manage', 'comms.audiences.read'],
        { moduleKey: 'comms' },
      );
      await portal(app)
        .put(
          `/v1/comms/audiences/outreach.reached/departments/${department.id}`,
          {},
          await signIn(comms.email, comms.password),
        )
        .expect(204);
      const granted = await count().expect(200);
      expect(granted.body).toMatchObject({ reach: 1 });
    });
  });
  describe('the dashboard (8.8)', () => {
    it('counts a known month by hand, and every number opens its own list', async () => {
      // Counts earlier tests left in memory are written, and cleared, first.
      await app.get(UsageService).flush();
      await db.query('truncate usage_daily');
      const { cookie, members, leader } = await outreach();
      const post = (path: string, body: object) =>
        portal(app)
          .post(path, body, cookie)
          .expect((r) => expect(r.status).toBeLessThan(300));
      const saturday = async (heldOn: string, teams: { area: string; people: string[] }[]) => {
        const s = await post('/v1/outreach/sessions', { heldOn });
        const ids: string[] = [];
        for (const t of teams) {
          const made = await post(`/v1/outreach/sessions/${s.body.id}/teams`, {
            area: t.area,
            personIds: t.people,
          });
          ids.push(made.body.id);
        }
        return { id: s.body.id as string, teams: ids };
      };
      const reach = async (teamId: string, fullName: string, phone: string, extra = {}) =>
        (
          await post('/v1/outreach/reached', {
            teamId,
            fullName,
            phone,
            mayMessage: true,
            ...extra,
          })
        ).body.personId as string;
      const follow = (personId: string, kind: string, on: string, done = false) =>
        post(`/v1/outreach/people/${personId}/followups`, { kind, on, done });

      // August: outside the period, but D still needs following up.
      const august = await saturday('2026-08-29', [{ area: 'Old Town', people: [members[0]!] }]);
      const d = await reach(august.teams[0]!, 'Daudi Four', '0711 000 004');
      // A cancelled Saturday in the period counts for nothing.
      const cancelled = await saturday('2026-09-12', [
        { area: 'Ngarenaro', people: [members[1]!] },
      ]);
      await portal(app)
        .put(`/v1/outreach/sessions/${cancelled.id}/status`, { status: 'CANCELLED' }, cookie)
        .expect(204);

      // The Saturday: two teams, eight spoken to without details.
      const sept = await saturday('2026-09-19', [
        { area: 'Sombetini', people: [members[0]!, members[1]!] },
        { area: 'Kaloleni', people: [members[2]!, leader.personId] },
      ]);
      await portal(app)
        .put(`/v1/outreach/teams/${sept.teams[0]}/spoken-to`, { spokenToOnly: 5 }, cookie)
        .expect(204);
      await portal(app)
        .put(`/v1/outreach/teams/${sept.teams[1]}/spoken-to`, { spokenToOnly: 3 }, cookie)
        .expect(204);
      const a = await reach(sept.teams[0]!, 'Amina One', '0711 000 001');
      const b = await reach(sept.teams[0]!, 'Baraka Two', '0711 000 002');
      const c = await reach(sept.teams[1]!, 'Cecilia Three', '0711 000 003');
      await reach(sept.teams[1]!, 'Amina One', '0711 000 001', { samePersonId: a });
      await portal(app)
        .put(`/v1/outreach/sessions/${sept.id}/status`, { status: 'COMPLETED' }, cookie)
        .expect(204);

      await follow(a, 'CALL', '2026-09-20');
      await follow(a, 'VISIT', '2026-09-20');
      await follow(b, 'VISIT', '2026-09-21');
      await follow(c, 'INVITED', '2026-09-21', true);
      await follow(a, 'ATTENDED_SERVICE', '2026-09-20');
      await follow(a, 'ATTENDED_SERVICE', '2026-09-24');

      const training = await post('/v1/outreach/trainings', {
        topic: 'Sharing your story',
        date: '2026-09-18',
        time: '18:00',
      });
      await portal(app)
        .put(
          `/v1/outreach/trainings/${training.body.id}/attendance`,
          {
            marks: [
              { personId: members[0], mark: 'ATTENDED' },
              { personId: members[1], mark: 'ATTENDED' },
              { personId: members[2], mark: 'MISSED' },
            ],
          },
          cookie,
        )
        .expect(204);

      const period = 'from=2026-09-01&to=2026-09-30';
      const { body } = await portal(app)
        .get(`/v1/outreach/dashboard?${period}`, await viewer())
        .expect(200);
      const value = (key: string) => body.figures[key].value;
      expect({
        reached: value('reached'),
        spokenTo: value('spokenTo'),
        awaiting: value('awaiting'),
        followups: value('followups'),
        visited: value('visited'),
        firstTime: value('firstTime'),
        sessions: value('sessions'),
        areas: value('areas'),
        participation: value('participation'),
        training: `${value('training')} of ${body.figures.training.of}`,
      }).toEqual({
        reached: 4, // A twice, B, C; not D in August
        spokenTo: 8,
        awaiting: 3, // A, B and D; C was done
        followups: 4, // a call, two visits and an invitation; not the Sundays
        visited: 2,
        firstTime: 1, // A, once, however often she comes
        sessions: 1, // not the cancelled one, not August's
        areas: 2,
        participation: 4,
        training: '2 of 3',
      });
      expect(d).toBeTruthy();

      // Every number is the list it opens.
      for (const [key, figure] of Object.entries(body.figures) as [
        string,
        { value: number; of: number | null },
      ][]) {
        const list = await portal(app)
          .get(`/v1/outreach/dashboard/${key}?${period}`, cookie)
          .expect(200);
        const sum = list.body.rows.reduce((n: number, r: { n: number }) => n + r.n, 0);
        expect([key, sum]).toEqual([key, figure.value]);
      }
      // The weeks add up to the period's figure too.
      const reachedWeeks = body.trends.find((t: { metric: string }) => t.metric === 'reached');
      expect(reachedWeeks.points.reduce((n: number, p: { value: number }) => n + p.value, 0)).toBe(
        4,
      );

      // The same work, as the dev console counts it.
      await app.get(UsageSnapshot).run();
      await app.get(UsageService).flush();
      const usage = await db.query<{ metric: string; value: number }>(
        `select metric, sum(value)::int as value from usage_daily
         where metric like 'outreach.%' group by metric order by metric`,
      );
      expect(Object.fromEntries(usage.rows.map((r) => [r.metric, r.value]))).toEqual({
        'outreach.followups': 4,
        'outreach.followups.pending': 3,
        'outreach.reached': 5,
        'outreach.sessions': 1,
        'outreach.training.attendance': 2,
        'outreach.visits': 2,
      });
    });

    it('refuses a period that ends before it starts, or runs past a year', async () => {
      const { cookie } = await outreach();
      await portal(app)
        .get('/v1/outreach/dashboard?from=2026-09-30&to=2026-09-01', cookie)
        .expect(422);
      await portal(app)
        .get('/v1/outreach/dashboard?from=2024-01-01&to=2026-09-01', cookie)
        .expect(422);
      await portal(app).get('/v1/outreach/dashboard/nothing', cookie).expect(404);
    });
  });
  describe('the session report (8.9)', () => {
    const pdf = (size = 4096) => Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(size)]);

    it('uploads straight to the bucket, is checked, and opens through a short-lived link', async () => {
      const bucket = app.get(MemoryFileStorage);
      bucket.reset();
      const { cookie } = await outreach();
      const session = await portal(app)
        .post('/v1/outreach/sessions', { heldOn: '2026-09-19' }, cookie)
        .expect(201);
      const base = `/v1/outreach/sessions/${session.body.id}/report`;

      const { body } = await portal(app).post(`${base}/upload`, {}, cookie).expect(201);
      expect(body.key).toMatch(
        new RegExp(`^outreach/sessions/${session.body.id}/[0-9a-f-]+\\.pdf$`),
      );
      expect(body.policy).toMatchObject({ contentType: 'application/pdf', maxBytes: 10_485_760 });
      // What the bucket makes of a 12 MB file and a Word document under that policy.
      expect(() => bucket.upload(body.key, pdf(12 * 1_048_576), 'application/pdf')).toThrow();
      expect(() =>
        bucket.upload(body.key, Buffer.from('PK'), 'application/vnd.openxmlformats'),
      ).toThrow();

      // Not uploaded yet, then for another Saturday: both refused.
      await portal(app).post(base, { key: body.key, name: 'report.pdf' }, cookie).expect(422);
      await portal(app)
        .post(base, { key: 'outreach/sessions/elsewhere/x.pdf', name: 'report.pdf' }, cookie)
        .expect(422);

      bucket.upload(body.key, pdf(), 'application/pdf');
      await portal(app)
        .post(base, { key: body.key, name: 'Sombetini report.pdf' }, cookie)
        .expect(201);

      const link = await portal(app)
        .get(base, await member())
        .expect(200);
      expect(link.body.name).toBe('Sombetini report.pdf');
      expect(bucket.open(link.body.url)).not.toBeNull();
      expect(bucket.open(link.body.url, Date.now() + 6 * 60_000)).toBeNull();

      // A second report keeps the first as an earlier version.
      const again = await portal(app).post(`${base}/upload`, {}, cookie).expect(201);
      bucket.upload(again.body.key, pdf(8192), 'application/pdf');
      await portal(app)
        .post(base, { key: again.body.key, name: 'Corrected.pdf' }, cookie)
        .expect(201);
      const versions = await portal(app).get(`${base}/versions`, cookie).expect(200);
      expect(versions.body.current.name).toBe('Corrected.pdf');
      expect(versions.body.earlier.map((v: { name: string }) => v.name)).toEqual([
        'Sombetini report.pdf',
      ]);
      const earlier = await portal(app)
        .get(`${base}?file=${versions.body.earlier[0].id}`, cookie)
        .expect(200);
      expect(earlier.body.name).toBe('Sombetini report.pdf');
    });

    it('leaves attaching to the leaders, and reading to those who may', async () => {
      const { cookie } = await outreach();
      const session = await portal(app)
        .post('/v1/outreach/sessions', { heldOn: '2026-09-19' }, cookie)
        .expect(201);
      const base = `/v1/outreach/sessions/${session.body.id}/report`;
      await portal(app)
        .post(`${base}/upload`, {}, await member())
        .expect(403);
      await portal(app)
        .post(`${base}/upload`, {}, await viewer())
        .expect(403);
      const outsider = await createUserWithPermissions(db, ['outreach.dashboard.read'], {
        moduleKey: 'outreach',
      });
      const refused = await portal(app)
        .get(base, await signIn(outsider.email, outsider.password))
        .expect(403);
      expect(refused.body.error.details.required).toEqual(['outreach.reports.read']);
      await portal(app).get(base, cookie).expect(404);
    });
  });
  describe('proving it (8.10)', () => {
    const ID = '00000000-0000-4000-8000-000000000000';
    const call = (route: { method: string; path: string }, cookie: string) => {
      const url = route.path.replace(/:[A-Za-z]+/g, ID);
      const p = portal(app);
      return route.method === 'get'
        ? p.get(url, cookie)
        : route.method === 'del'
          ? p.del(url, cookie)
          : p[route.method as 'post' | 'put' | 'patch'](url, {}, cookie);
    };
    const needs = (r: { rule: { all?: string[]; any?: string[] } }) => r.rule.all ?? r.rule.any!;
    const kind = (permission: string) =>
      outreachModule.permissions[permission as keyof typeof outreachModule.permissions]?.kind;

    it('lets a viewer open every Outreach page, and refuses every write', async () => {
      await outreach();
      const cookie = await viewer();
      const routes = guardedRoutes(app).filter((r) =>
        needs(r).every((p) => p.startsWith('outreach.')),
      );
      expect(routes.length).toBeGreaterThan(25);
      const wrong: string[] = [];
      for (const route of routes) {
        const res = await call(route, cookie);
        const writes = needs(route).some((p) => kind(p) === 'write');
        if (writes !== refusedByGuard(res))
          wrong.push(`${route.method} ${route.path} → ${res.status}`);
      }
      expect(wrong).toEqual([]);
    });

    it('keeps an Outreach member out of everything under Membership', async () => {
      await outreach();
      const cookie = await member();
      const routes = guardedRoutes(app).filter((r) => r.path.startsWith('/v1/membership'));
      expect(routes.length).toBeGreaterThan(10);
      const leaks: string[] = [];
      for (const route of routes) {
        const res = await call(route, cookie);
        if (!refusedByGuard(res)) leaks.push(`${route.method} ${route.path} → ${res.status}`);
      }
      expect(leaks).toEqual([]);
    });

    it('turns fifty records with overlapping numbers and names into exactly the people there are', async () => {
      const { cookie } = await outreach();
      const { rows: before } = await db.query<{ n: number }>(
        `select count(*)::int as n from people`,
      );
      // Twenty people with numbers, each met two or three times, the number
      // typed a different way each time; and five with no number, met twice.
      const withPhone = Array.from({ length: 20 }, (_, i) => ({
        name: `Mtu Namba ${i + 1}`,
        digits: `7${String(i + 1).padStart(2, '0')}555${String(i + 1).padStart(3, '0')}`,
      }));
      const noPhone = [
        'Zawadi Kileo',
        'Imani Swai',
        'Faraja Mbise',
        'Upendo Lyimo',
        'Tumaini Kaaya',
      ];
      const typed = (d: string, n: number) =>
        [`0${d}`, `+255${d}`, `0${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`][n % 3]!;
      const records = [
        ...withPhone.flatMap((p, i) =>
          Array.from({ length: i < 5 ? 3 : 2 }, (_, n) => ({
            fullName: n ? p.name.toUpperCase() : p.name,
            phone: typed(p.digits, n),
          })),
        ),
        ...noPhone.flatMap((name) => [
          { fullName: name, phone: '' },
          { fullName: name, phone: '' },
        ]),
      ];
      expect(records).toHaveLength(55);

      // The recorder answers every "same person?" with the first candidate.
      for (const r of records) {
        const body = { ...r, mayMessage: true };
        const first = await portal(app).post('/v1/outreach/reached', body, cookie);
        if (first.status === 409) {
          await portal(app)
            .post(
              '/v1/outreach/reached',
              { ...body, samePersonId: first.body.error.details.candidates[0].personId },
              cookie,
            )
            .expect(201);
        } else expect(first.status).toBe(201);
      }

      const { rows } = await db.query<{ people: number; reaches: number; orphans: number }>(
        `select (select count(*)::int from people) - $1::int as people,
                (select count(*)::int from outreach_reached) as reaches,
                (select count(*)::int from outreach_reached r
                  where not exists (select 1 from people p where p.id = r.person_id)) as orphans`,
        [before[0]!.n],
      );
      expect(rows[0]).toEqual({ people: 25, reaches: 55, orphans: 0 });
    });
  });
});

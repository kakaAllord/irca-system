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
});

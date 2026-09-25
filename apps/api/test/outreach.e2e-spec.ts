import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import pg from 'pg';
import { RegistrySync } from '../src/core/rbac/registry-sync.service.js';
import {
  createApp,
  createChurch,
  createDepartment,
  createLeader,
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
});

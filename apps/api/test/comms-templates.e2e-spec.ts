import type { NestExpressApplication } from '@nestjs/platform-express';
import pg from 'pg';
import { RegistrySync } from '../src/core/rbac/registry-sync.service.js';
import {
  createApp,
  createChurch,
  createDepartment,
  createLeader,
  createUserWithPermissions,
  ownerDb,
  portal,
  sessionCookie,
  truncateAll,
} from './helpers.js';

describe('templates: written by the department, approved once (07 step 7.9)', () => {
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
    await createChurch(db, 'IRCA', ['admin', 'comms']);
    await app.get(RegistrySync).sync();
  });

  const signIn = async (user: { email: string; password: string }) =>
    sessionCookie(await portal(app).post('/v1/auth/login', user).expect(200));
  const approver = async () =>
    signIn(
      await createUserWithPermissions(db, ['comms.templates.read', 'comms.templates.approve'], {
        moduleKey: 'comms',
      }),
    );

  it('goes draft → pending → active, and never lets the author approve it', async () => {
    const choir = await createDepartment(db, { name: 'Choir' });
    const leader = await signIn(await createLeader(db, choir.id));
    const made = await portal(app)
      .post(
        '/v1/comms/templates',
        {
          departmentId: choir.id,
          name: 'Practice reminder',
          bodies: {
            sw: 'Habari {{first_name}}, mazoezi ni {{date}} saa {{time}}.',
            en: 'Hi {{first_name}}, practice is on {{date}} at {{time}}.',
          },
        },
        leader,
      )
      .expect(201);
    expect(made.body).toMatchObject({
      status: 'DRAFT',
      version: 1,
      fields: ['first_name', 'date', 'time'],
    });
    const id = made.body.id as string;

    await portal(app).post(`/v1/comms/templates/${id}/submit`, {}, leader).expect(204);
    // A leader holds no approve permission; and a Communications lead who
    // wrote something cannot approve it either.
    await portal(app).post(`/v1/comms/templates/${id}/approve`, {}, leader).expect(403);
    const lead = await signIn(
      await createUserWithPermissions(
        db,
        ['comms.templates.read', 'comms.templates.draft', 'comms.templates.approve'],
        { moduleKey: 'comms' },
      ),
    );
    const own = await portal(app)
      .post(
        '/v1/comms/templates',
        { name: 'Welcome', bodies: { en: 'Welcome to {{church_name}}!' } },
        lead,
      )
      .expect(201);
    await portal(app).post(`/v1/comms/templates/${own.body.id}/submit`, {}, lead).expect(204);
    const self = await portal(app)
      .post(`/v1/comms/templates/${own.body.id}/approve`, {}, lead)
      .expect(409);
    expect(self.body.error).toMatchObject({ code: 'CANNOT_DECIDE_OWN_REQUEST' });
    expect(self.body.error.message).toMatch(/Nobody approves their own/);

    await portal(app).post(`/v1/comms/templates/${id}/approve`, { note: 'Good' }, lead).expect(204);
    const active = await portal(app).get(`/v1/comms/templates/${id}`, leader).expect(200);
    expect(active.body.status).toBe('ACTIVE');
  });

  it('makes version 2 on a change, keeps version 1 until it is approved, then retires it', async () => {
    const choir = await createDepartment(db, { name: 'Choir' });
    const leader = await signIn(await createLeader(db, choir.id));
    const v1 = (
      await portal(app)
        .post(
          '/v1/comms/templates',
          { departmentId: choir.id, name: 'Reminder', bodies: { sw: 'Mazoezi leo.' } },
          leader,
        )
        .expect(201)
    ).body;
    await portal(app).post(`/v1/comms/templates/${v1.id}/submit`, {}, leader).expect(204);
    const lead = await approver();
    await portal(app).post(`/v1/comms/templates/${v1.id}/approve`, {}, lead).expect(204);

    const v2 = (
      await portal(app)
        .put(
          `/v1/comms/templates/${v1.id}`,
          { name: 'Reminder', bodies: { sw: 'Mazoezi leo jioni.' } },
          leader,
        )
        .expect(200)
    ).body;
    expect(v2).toMatchObject({ version: 2, status: 'DRAFT', familyId: v1.familyId });
    const both = await portal(app)
      .get(`/v1/comms/templates?departmentId=${choir.id}`, leader)
      .expect(200);
    expect(
      both.body.map((t: { version: number; status: string }) => [t.version, t.status]),
    ).toEqual([
      [2, 'DRAFT'],
      [1, 'ACTIVE'],
    ]);
    // A second change goes to the version already being written.
    await portal(app)
      .put(`/v1/comms/templates/${v1.id}`, { name: 'Reminder', bodies: { sw: 'Tena.' } }, leader)
      .expect(409);

    await portal(app).post(`/v1/comms/templates/${v2.id}/submit`, {}, leader).expect(204);
    await portal(app).post(`/v1/comms/templates/${v2.id}/approve`, {}, lead).expect(204);
    const after = await portal(app)
      .get(`/v1/comms/templates?departmentId=${choir.id}`, leader)
      .expect(200);
    expect(
      after.body.map((t: { version: number; status: string }) => [t.version, t.status]),
    ).toEqual([
      [2, 'ACTIVE'],
      [1, 'RETIRED'],
    ]);
  });

  it('refuses a blank no message can fill, by name, and another department’s template', async () => {
    const choir = await createDepartment(db, { name: 'Choir' });
    const ushers = await createDepartment(db, { name: 'Ushers' });
    const leader = await signIn(await createLeader(db, choir.id));
    const res = await portal(app)
      .post(
        '/v1/comms/templates',
        { departmentId: choir.id, name: 'Hi', bodies: { en: 'Hi {{nickname}}' } },
        leader,
      )
      .expect(422);
    expect(res.body.error.message).toMatch(/\{\{nickname\}\} cannot be filled/);
    await portal(app)
      .post(
        '/v1/comms/templates',
        { departmentId: ushers.id, name: 'Hi', bodies: { en: 'Hi' } },
        leader,
      )
      .expect(403);
    await portal(app)
      .post('/v1/comms/templates', { departmentId: null, name: 'Hi', bodies: { en: 'Hi' } }, leader)
      .expect(403);
  });

  it('never lets the words of a submitted template change, even behind the API', async () => {
    const lead = await signIn(
      await createUserWithPermissions(db, ['comms.templates.read', 'comms.templates.draft'], {
        moduleKey: 'comms',
      }),
    );
    const made = await portal(app)
      .post('/v1/comms/templates', { name: 'Welcome', bodies: { en: 'Welcome!' } }, lead)
      .expect(201);
    await portal(app).post(`/v1/comms/templates/${made.body.id}/submit`, {}, lead).expect(204);
    const appRole = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await appRole.connect();
    try {
      await expect(
        appRole.query(`update comms_template_bodies set body = 'Changed' where template_id = $1`, [
          made.body.id,
        ]),
      ).rejects.toThrow(/cannot change; make a new version/);
      await expect(appRole.query(`delete from comms_templates`)).rejects.toThrow(
        /permission denied/,
      );
    } finally {
      await appRole.end();
    }
  });
});

import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import { RegistrySync } from '../src/core/rbac/registry-sync.service.js';
import { MemorySmsProvider } from '../src/core/sms/providers/memory.provider.js';
import { OutboxService } from '../src/modules/comms/outbox.service.js';
import { SchedulesService } from '../src/modules/comms/schedules.service.js';
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

/**
 * The Communication system's walls (07 step 7.15). Each of these was watched
 * failing with its guard taken out before it was trusted.
 */
describe('the Communication system’s walls', () => {
  let app: NestExpressApplication;
  let db: pg.Client;
  let sms: MemorySmsProvider;

  beforeAll(async () => {
    app = await createApp();
    db = await ownerDb();
    sms = app.get(MemorySmsProvider);
  });
  afterAll(async () => {
    await db.end();
    await app.close();
  });
  beforeEach(async () => {
    await truncateAll(db);
    sms.reset();
    await createChurch(db, 'IRCA', ['admin', 'comms', 'dev']);
    await app.get(RegistrySync).sync();
    await setCommsSettings(db, { dailyCap: '100000' });
  });

  const signIn = async (user: { email: string; password: string }) =>
    sessionCookie(await portal(app).post('/v1/auth/login', user).expect(200));
  const member = (departmentId: string, personId: string) =>
    db.query(`insert into department_members (id, department_id, person_id) values ($1, $2, $3)`, [
      randomUUID(),
      departmentId,
      personId,
    ]);
  const everyone = (id: string) => ({
    key: 'departments.everyone',
    params: { departmentIds: [id] },
  });

  it('never sends while someone is being viewed as, even as the Communications lead', async () => {
    const lead = await createUserWithPermissions(
      db,
      ['comms.messages.read', 'comms.messages.send', 'comms.messages.send_adhoc'],
      { moduleKey: 'comms' },
    );
    const dev = await createUserWithPermissions(db, ['dev.users.impersonate', 'dev.health.read'], {
      moduleKey: 'dev',
    });
    const choir = await createDepartment(db, { name: 'Choir' });
    await createLeader(db, choir.id);
    const cookie = await signIn(dev);
    await portal(app).post('/v1/impersonation', { subjectUserId: lead.id }, cookie).expect(200);

    const res = await portal(app)
      .post(
        '/v1/comms/messages',
        {
          audience: { key: 'departments.leaders', params: {} },
          bodies: { en: 'Costs real money.' },
        },
        cookie,
      )
      .expect(403);
    expect(res.body.error.code).toBe('IMPERSONATION_READ_ONLY');
    const { rows } = await db.query(`select 1 from comms_messages`);
    expect(rows).toHaveLength(0);
  });

  it('keeps each department to its own people, history and words', async () => {
    const choir = await createDepartment(db, { name: 'Choir' });
    const ushers = await createDepartment(db, { name: 'Ushers' });
    const choirLeader = await signIn(await createLeader(db, choir.id));
    const ushersLeader = await signIn(await createLeader(db, ushers.id));
    await member(ushers.id, (await createPerson(db)).id);
    const ushersWords = await createTemplate(db, {
      departmentId: ushers.id,
      bodies: { en: 'Ushers: arrive at 8.' },
    });
    const sent = await portal(app)
      .post(
        '/v1/comms/messages',
        { departmentId: ushers.id, audience: everyone(ushers.id), templateId: ushersWords.id },
        ushersLeader,
      )
      .expect(201);

    // Not their audience, not their words, not their history.
    await portal(app)
      .post(
        '/v1/comms/messages',
        { departmentId: ushers.id, audience: everyone(ushers.id), templateId: ushersWords.id },
        choirLeader,
      )
      .expect(403);
    await portal(app)
      .post(
        '/v1/comms/messages',
        { departmentId: choir.id, audience: everyone(choir.id), templateId: ushersWords.id },
        choirLeader,
      )
      .expect(403);
    await portal(app)
      .post(
        '/v1/comms/messages',
        {
          departmentId: choir.id,
          audience: { key: 'church.staff', params: {} },
          templateId: ushersWords.id,
        },
        choirLeader,
      )
      .expect(403);
    await portal(app).get(`/v1/comms/messages?departmentId=${ushers.id}`, choirLeader).expect(403);
    await portal(app).get(`/v1/comms/messages/${sent.body.id}`, choirLeader).expect(403);
    await portal(app).get('/v1/comms/messages', choirLeader).expect(403);
    await portal(app).get(`/v1/comms/templates?departmentId=${ushers.id}`, choirLeader).expect(403);
    await portal(app).get(`/v1/comms/templates/${ushersWords.id}`, choirLeader).expect(403);
  });

  it('leaves a blocked number alone in a send, a preview and a beat alike', async () => {
    const choir = await createDepartment(db, { name: 'Choir' });
    const leader = await createLeader(db, choir.id);
    await member(choir.id, (await createPerson(db, { phone: '713000999' })).id);
    await db.query(
      `insert into comms_blocked_numbers (phone, reason) values ('+255713000999', 'replied STOP')`,
    );
    const words = await createTemplate(db, {
      departmentId: choir.id,
      bodies: { en: 'Practice tonight.' },
    });
    const cookie = await signIn(leader);
    const body = { departmentId: choir.id, audience: everyone(choir.id), templateId: words.id };

    const preview = await portal(app).post('/v1/comms/messages/preview', body, cookie).expect(200);
    expect(preview.body).toMatchObject({ reach: 1, leftAlone: { optedOut: 1 } });

    await portal(app).post('/v1/comms/messages', body, cookie).expect(201);

    const beat = await portal(app)
      .post(
        '/v1/comms/schedules',
        {
          ...body,
          templateIds: [words.id],
          name: 'Nightly',
          daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
          timeOfDay: '18:00',
          startsOn: '2026-01-01',
        },
        cookie,
      )
      .expect(201);
    const morning = new Date('2030-03-05T10:00:00+03:00');
    await db.query(`update comms_schedules set next_run_at = $2 where id = $1`, [
      beat.body.id,
      morning,
    ]);
    await app.get(SchedulesService).runDue(morning);

    await app.get(OutboxService).sendDue();
    expect(sms.sent.map((m) => m.to)).not.toContain('+255713000999');
    const { rows } = await db.query<{ status: string }>(
      `select status::text from comms_recipients where phone = '+255713000999'`,
    );
    expect(rows.map((r) => r.status)).toEqual(['SKIPPED_OPT_OUT', 'SKIPPED_OPT_OUT']);
  });
});

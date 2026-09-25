import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import { RegistrySync } from '../src/core/rbac/registry-sync.service.js';
import { SchedulesService } from '../src/modules/comms/schedules.service.js';
import {
  createApp,
  createChurch,
  createDepartment,
  createLeader,
  createPerson,
  createTemplate,
  ownerDb,
  portal,
  sessionCookie,
  setCommsSettings,
  truncateAll,
} from './helpers.js';

/** A weekday morning in Arusha, well outside quiet hours. */
const MORNING = new Date('2030-03-05T10:00:00+03:00');

describe('beats: the same message on a rhythm (07 step 7.11)', () => {
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
    await setCommsSettings(db, { dailyCap: '100000' });
  });

  async function choirBeat() {
    const choir = await createDepartment(db, { name: 'Choir' });
    const leader = await createLeader(db, choir.id);
    const person = await createPerson(db, { fullName: 'Juma Kessy', lang: 'sw' });
    await db.query(
      `insert into department_members (id, department_id, person_id) values ($1, $2, $3)`,
      [randomUUID(), choir.id, person.id],
    );
    const a = await createTemplate(db, {
      departmentId: choir.id,
      name: 'Reminder A',
      bodies: { sw: 'Mazoezi leo saa kumi na mbili.' },
    });
    const b = await createTemplate(db, {
      departmentId: choir.id,
      name: 'Reminder B',
      bodies: { sw: 'Tukutane mazoezini leo jioni.' },
    });
    const cookie = sessionCookie(await portal(app).post('/v1/auth/login', leader).expect(200));
    const made = await portal(app)
      .post(
        '/v1/comms/schedules',
        {
          departmentId: choir.id,
          name: 'Tuesday practice',
          audience: { key: 'departments.everyone', params: { departmentIds: [choir.id] } },
          templateIds: [a.id, b.id],
          daysOfWeek: [2],
          timeOfDay: '18:00',
          jitterMinutes: 10,
          startsOn: '2026-01-01',
        },
        cookie,
      )
      .expect(201);
    // Due now, as if Tuesday had come.
    await db.query(`update comms_schedules set next_run_at = $2 where id = $1`, [
      made.body.id,
      MORNING,
    ]);
    return { choir, leader, cookie, id: made.body.id as string, templates: [a.id, b.id] };
  }

  it('sends from one of its templates when due, through the ordinary send, and moves its next run on', async () => {
    const { id, templates, cookie, choir } = await choirBeat();
    expect(await app.get(SchedulesService).runDue(MORNING)).toEqual({
      sent: 1,
      refused: 0,
      waited: 0,
    });

    const { rows } = await db.query(
      `select template_id, schedule_id, created_by_id, recipient_count from comms_messages`,
    );
    expect(rows).toHaveLength(1);
    expect(templates).toContain(rows[0].template_id);
    expect(rows[0]).toMatchObject({ schedule_id: id, created_by_id: null, recipient_count: 2 });

    const listed = await portal(app)
      .get(`/v1/comms/schedules?departmentId=${choir.id}`, cookie)
      .expect(200);
    expect(new Date(listed.body[0].nextRunAt).getTime()).toBeGreaterThan(MORNING.getTime());
    expect(listed.body[0]).toMatchObject({ lastError: null, lastMessage: { status: 'SENDING' } });
  });

  it('sends once a month when asked: the first Tuesday', async () => {
    const { id, templates, cookie, choir } = await choirBeat();
    await portal(app)
      .put(
        `/v1/comms/schedules/${id}`,
        {
          departmentId: choir.id,
          name: 'Monthly practice',
          audience: { key: 'departments.everyone', params: { departmentIds: [choir.id] } },
          templateIds: templates,
          daysOfWeek: [2],
          weeksOfMonth: [1],
          timeOfDay: '18:00',
          jitterMinutes: 0,
          startsOn: '2026-01-01',
        },
        cookie,
      )
      .expect(204);
    const listed = await portal(app)
      .get(`/v1/comms/schedules?departmentId=${choir.id}`, cookie)
      .expect(200);
    expect(listed.body[0].weeksOfMonth).toEqual([1]);
    // A Tuesday in the first seven days of a month, in Arusha.
    const next = new Date(new Date(listed.body[0].nextRunAt).getTime() + 3 * 3_600_000);
    expect(next.getUTCDay()).toBe(2);
    expect(next.getUTCDate()).toBeLessThanOrEqual(7);
  });

  it('stops sending, and says why, once its leader steps down', async () => {
    const { id, leader } = await choirBeat();
    await db.query(`update department_leaders set ended_at = now() where id = $1`, [
      leader.leaderId,
    ]);
    expect(await app.get(SchedulesService).runDue(MORNING)).toEqual({
      sent: 0,
      refused: 1,
      waited: 0,
    });
    const { rows } = await db.query(`select last_error from comms_schedules where id = $1`, [id]);
    expect(rows[0].last_error).toMatch(/do not lead this department/);
    const { rows: none } = await db.query(`select 1 from comms_messages`);
    expect(none).toHaveLength(0);
  });

  it('waits until morning when it comes due in quiet hours', async () => {
    const { id } = await choirBeat();
    const night = new Date('2030-03-05T23:30:00+03:00');
    await db.query(`update comms_schedules set next_run_at = $2 where id = $1`, [id, night]);
    expect(await app.get(SchedulesService).runDue(night)).toEqual({
      sent: 0,
      refused: 0,
      waited: 1,
    });
    const { rows } = await db.query(`select next_run_at from comms_schedules where id = $1`, [id]);
    expect(new Date(rows[0].next_run_at)).toEqual(new Date('2030-03-06T07:00:00+03:00'));
  });

  it('pauses, and is written down when it does', async () => {
    const { id, cookie } = await choirBeat();
    await portal(app)
      .put(`/v1/comms/schedules/${id}/active`, { active: false }, cookie)
      .expect(204);
    expect(await app.get(SchedulesService).runDue(MORNING)).toEqual({
      sent: 0,
      refused: 0,
      waited: 0,
    });
    const { rows } = await db.query(
      `select summary from audit_events where action = 'comms.schedule.paused'`,
    );
    expect(rows[0].summary).toBe('Paused "Tuesday practice"');
  });
});

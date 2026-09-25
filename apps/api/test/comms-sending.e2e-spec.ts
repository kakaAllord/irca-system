import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import { OPT_OUT } from '@irca/shared';
import { z } from 'zod';
import { RegistrySync } from '../src/core/rbac/registry-sync.service.js';
import { AudienceRegistry } from '../src/core/comms/audience.registry.js';
import { MemorySmsProvider } from '../src/core/sms/providers/memory.provider.js';
import { UsageService } from '../src/core/usage/usage.service.js';
import { OutboxService } from '../src/modules/comms/outbox.service.js';
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

const BODIES = {
  sw: 'Habari {{first_name}}, mazoezi ni {{date}}.',
  en: 'Hi {{first_name}}, practice is on {{date}}.',
};

describe('sending: refused for a reason you can read, whenever it should be (07 step 7.10)', () => {
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
    await createChurch(db, 'IRCA', ['admin', 'comms']);
    await app.get(RegistrySync).sync();
    await setCommsSettings(db, { dailyCap: '50000' });
  });

  const signIn = async (user: { email: string; password: string }) =>
    sessionCookie(await portal(app).post('/v1/auth/login', user).expect(200));
  const member = (departmentId: string, personId: string) =>
    db.query(`insert into department_members (id, department_id, person_id) values ($1, $2, $3)`, [
      randomUUID(),
      departmentId,
      personId,
    ]);

  /** The choir: a leader (Swahili), Juma (Swahili), Grace (English), Paul (French), and Anna, who opted out. */
  async function choir() {
    const dept = await createDepartment(db, { name: 'Choir' });
    const leader = await createLeader(db, dept.id);
    await db.query(`update people set lang = 'sw' where id = $1`, [leader.personId]);
    await member(
      dept.id,
      (await createPerson(db, { fullName: 'Juma Kessy', lang: 'sw', phone: '713000001' })).id,
    );
    await member(
      dept.id,
      (await createPerson(db, { fullName: 'Grace Mollel', lang: 'en', phone: '713000002' })).id,
    );
    await member(
      dept.id,
      (await createPerson(db, { fullName: 'Paul Laizer', lang: 'fr', phone: '713000003' })).id,
    );
    const anna = await createPerson(db, { fullName: 'Anna Mushi', phone: '713000004' });
    await db.query(`update people set sms_opt_out = true where id = $1`, [anna.id]);
    await member(dept.id, anna.id);
    const template = await createTemplate(db, { departmentId: dept.id, bodies: BODIES });
    return { dept, leader, cookie: await signIn(leader), template };
  }
  const send = (cookie: string, body: object) =>
    portal(app).post('/v1/comms/messages', body, cookie);
  const everyone = (id: string) => ({
    key: 'departments.everyone',
    params: { departmentIds: [id] },
  });

  it('lets a leader send to their department: each in their language, with the way to stop once', async () => {
    const { dept, cookie, template } = await choir();
    const preview = await portal(app)
      .post(
        '/v1/comms/messages/preview',
        {
          departmentId: dept.id,
          audience: everyone(dept.id),
          templateId: template.id,
          fields: { date: 'Ijumaa' },
        },
        cookie,
      )
      .expect(200);
    expect(preview.body).toMatchObject({
      audienceName: 'Everyone in Choir',
      reach: 4,
      leftAlone: { optedOut: 1, noPhone: 0, duplicate: 0 },
      segments: 4,
      cost: '120.00',
      costText: '120 TZS',
      problem: null,
    });

    const sent = await send(cookie, {
      departmentId: dept.id,
      audience: everyone(dept.id),
      templateId: template.id,
      fields: { date: 'Ijumaa' },
    }).expect(201);
    expect(sent.body).toMatchObject({ recipientCount: 4, skipped: 1, cost: '120.00' });

    // Nothing has left yet: it is owed, until the background sender runs.
    expect(sms.sent).toHaveLength(0);
    await app.get(OutboxService).sendDue();
    const bodies = sms.sent.map((m) => m.body).sort();
    expect(bodies).toEqual(
      [
        `Habari Juma, mazoezi ni Ijumaa. ${OPT_OUT.sw}`,
        `Habari Rehema, mazoezi ni Ijumaa. ${OPT_OUT.sw}`,
        `Hi Grace, practice is on Ijumaa. ${OPT_OUT.en}`,
        // No French words: the church's default language, Swahili.
        `Habari Paul, mazoezi ni Ijumaa. ${OPT_OUT.sw}`,
      ].sort(),
    );
    for (const body of bodies) expect(body.split(/Jibu ACHA|Reply STOP/).length).toBe(2);
    expect(sms.sent.map((m) => m.to)).not.toContain('+255713000004');

    const message = await portal(app).get(`/v1/comms/messages/${sent.body.id}`, cookie).expect(200);
    expect(message.body.status).toBe('SENT');
    expect(message.body.byStatus).toEqual({ SENT: 4, SKIPPED_OPT_OUT: 1 });
    // A leader does not hold Membership's sensitive permission: numbers are masked.
    expect(
      message.body.recipients.every(
        (r: { phone: string }) => r.phone === '' || r.phone.includes('•'),
      ),
    ).toBe(true);

    // The activity log names the audience and the template, never a number.
    const { rows } = await db.query(
      `select summary from audit_events where action = 'comms.message.sent'`,
    );
    expect(rows[0].summary).toBe(
      'Sent "Reminder" to Everyone in Choir for Choir: 4 people (1 left alone), 120 TZS',
    );
    expect(JSON.stringify(rows)).not.toMatch(/713|\+255/);

    // Each person sent to has it on their timeline, from whom but not what it said.
    const timeline = await db.query<{ summary: string; n: number }>(
      `select summary, count(*)::int as n from person_interactions
       where kind = 'MESSAGE_SENT' group by summary`,
    );
    expect(timeline.rows).toEqual([{ summary: 'Sent a text message from Choir', n: 4 }]);

    // Communications sees what each department spent this month.
    const viewer = await signIn(
      await createUserWithPermissions(db, ['comms.messages.read'], { moduleKey: 'comms' }),
    );
    const overview = await portal(app).get('/v1/comms/messages/overview', viewer).expect(200);
    expect(overview.body.byDepartment).toEqual([
      {
        department: { id: dept.id, name: 'Choir' },
        messages: 1,
        people: 4,
        segments: 4,
        cost: '120.00',
        delivered: 0,
        failed: 0,
      },
    ]);

    // And it is counted.
    await app.get(UsageService).flush();
    const { rows: usage } = await db.query(
      `select metric, value::int from usage_daily where metric in ('sms.queued', 'sms.cost', 'sms.sent') order by metric`,
    );
    expect(usage).toEqual([
      { metric: 'sms.cost', value: 120 },
      { metric: 'sms.queued', value: 4 },
      { metric: 'sms.sent', value: 4 },
    ]);
  });

  it('refuses another department’s leader, unapproved words, free text, and a blank it cannot fill', async () => {
    const { dept, template } = await choir();
    const ushers = await createDepartment(db, { name: 'Ushers' });
    const other = await signIn(await createLeader(db, ushers.id));
    const refused = await send(other, {
      departmentId: dept.id,
      audience: everyone(dept.id),
      templateId: template.id,
      fields: { date: 'Ijumaa' },
    }).expect(403);
    expect(refused.body.error.message).toMatch(/do not lead/);

    const leader = await signIn(await createLeader(db, dept.id, 'Secretary'));
    const draft = await createTemplate(db, {
      departmentId: dept.id,
      bodies: { en: 'Hi' },
      status: 'DRAFT',
    });
    const unapproved = await send(leader, {
      departmentId: dept.id,
      audience: everyone(dept.id),
      templateId: draft.id,
    }).expect(403);
    expect(unapproved.body.error.message).toMatch(/not approved yet/);

    const theirs = await createTemplate(db, { departmentId: ushers.id, bodies: { en: 'Hi' } });
    await send(leader, {
      departmentId: dept.id,
      audience: everyone(dept.id),
      templateId: theirs.id,
    }).expect(403);

    const free = await send(leader, {
      departmentId: dept.id,
      audience: everyone(dept.id),
      bodies: { en: 'Anything' },
    }).expect(403);
    expect(free.body.error.message).toMatch(
      /Only Communications may send words no template covers/,
    );

    const blank = await send(leader, {
      departmentId: dept.id,
      audience: everyone(dept.id),
      templateId: template.id,
    }).expect(422);
    expect(blank.body.error.message).toBe('Fill in date before sending.');

    // A figure only an audience knows cannot go to one that does not know it.
    const owed = await createTemplate(db, {
      departmentId: dept.id,
      bodies: { sw: 'Salamu {{first_name}}, bado {{balance}}.' },
    });
    const unfilled = await send(leader, {
      departmentId: dept.id,
      audience: everyone(dept.id),
      templateId: owed.id,
    }).expect(422);
    expect(unfilled.body.error.message).toMatch(
      /\{\{balance\}\} can only be sent to people who still owe/,
    );
  });

  it('sends with no limit saved, and refuses a send over a saved limit with the figure', async () => {
    const { dept, cookie, template } = await choir();
    const body = {
      departmentId: dept.id,
      audience: everyone(dept.id),
      templateId: template.id,
      fields: { date: 'Ijumaa' },
    };

    await setCommsSettings(db, { dailyCap: '200', pricePerSegment: '30' });
    await send(cookie, body).expect(201);
    const over = await send(cookie, body).expect(409);
    expect(over.body.error.message).toBe(
      "This would bring today's messages to 240 TZS; the daily limit is 200 TZS.",
    );

    // The limit taken away: no limit, whatever has been spent today.
    await setCommsSettings(db, { dailyCap: null });
    await send(cookie, body).expect(201);
  });

  it('reaches nobody twice within the cooldown from an audience that reminds', async () => {
    const { dept } = await choir();
    // A reminding audience, as Finance's pledge one is: here, the choir.
    app.get(AudienceRegistry).register({
      key: 'test.reminding',
      label: 'Reminded',
      description: 'For this test',
      scope: 'church',
      cooldown: true,
      params: z.object({ note: z.string().optional() }),
      describe: async () => 'Reminded',
      resolve: async (tx) =>
        (
          await tx.person.findMany({
            where: { departments: { some: { departmentId: dept.id } } },
          })
        ).map((p) => ({
          personId: p.id,
          name: p.fullName,
          dial: p.dial,
          phone: p.phone,
          lang: p.lang,
          optedOut: p.smsOptOut,
        })),
    });
    const lead = await signIn(
      await createUserWithPermissions(
        db,
        ['comms.messages.read', 'comms.messages.send', 'comms.messages.send_adhoc'],
        { moduleKey: 'comms' },
      ),
    );
    const remind = (note: string) =>
      send(lead, {
        departmentId: null,
        audience: { key: 'test.reminding', params: { note } },
        bodies: { sw: 'Kumbukumbu.' },
      });

    const first = await remind('Ujenzi').expect(201);
    expect(first.body.recipientCount).toBe(3);

    // Another reminder the same day, about something else: one text each is enough.
    const second = await remind('Bus').expect(409);
    expect(second.body.error.message).toMatch(/in the last 14 days/);

    // Someone new joins: they alone are reminded, and the rest are counted as left alone.
    await member(
      dept.id,
      (await createPerson(db, { fullName: 'Rose Newcomer', phone: '713000009' })).id,
    );
    const third = await remind('Bus').expect(201);
    expect(third.body).toMatchObject({ recipientCount: 1 });
    const { rows } = await db.query<{ status: string; n: number }>(
      `select status, count(*)::int as n from comms_recipients where message_id = $1
       group by status order by status`,
      [third.body.id],
    );
    expect(rows).toEqual([
      { status: 'PENDING', n: 1 },
      { status: 'SKIPPED_OPT_OUT', n: 1 },
      { status: 'SKIPPED_RECENT', n: 3 },
    ]);

    // A cooldown of 0 days, saved in Comms → Settings, lets it remind again.
    await setCommsSettings(db, { personCooldownDays: 0 });
    await remind('Again').expect(201);
  });

  it('lets Communications send free text, schedule it, and stop it before it goes', async () => {
    await choir();
    const lead = await signIn(
      await createUserWithPermissions(
        db,
        [
          'comms.messages.read',
          'comms.messages.send',
          'comms.messages.send_adhoc',
          'comms.messages.cancel',
        ],
        { moduleKey: 'comms' },
      ),
    );
    const later = new Date(Date.now() + 3 * 3_600_000).toISOString();
    const scheduled = await send(lead, {
      audience: { key: 'departments.leaders', params: {} },
      bodies: { en: 'No service today: the road is flooded.' },
      scheduledFor: later,
    }).expect(201);

    await app.get(OutboxService).sendDue();
    expect(sms.sent).toHaveLength(0);
    const waiting = await portal(app)
      .get(`/v1/comms/messages/${scheduled.body.id}`, lead)
      .expect(200);
    expect(waiting.body.status).toBe('SCHEDULED');

    await portal(app).post(`/v1/comms/messages/${scheduled.body.id}/cancel`, {}, lead).expect(204);
    const stopped = await portal(app)
      .get(`/v1/comms/messages/${scheduled.body.id}`, lead)
      .expect(200);
    expect(stopped.body).toMatchObject({ status: 'CANCELLED', byStatus: { CANCELLED: 1 } });
  });

  it('retries a failure, blocks a number the carrier says is impossible, and records delivery', async () => {
    const { dept, cookie, template } = await choir();
    sms.failures.push(
      { error: 'Beem 503: busy', permanent: false },
      { error: 'Invalid number', permanent: true },
    );
    await send(cookie, {
      departmentId: dept.id,
      audience: everyone(dept.id),
      templateId: template.id,
      fields: { date: 'Ijumaa' },
    }).expect(201);

    const outbox = app.get(OutboxService);
    await outbox.sendDue();
    const { rows } = await db.query<{ status: string; attempts: number }>(
      `select status::text, attempts from comms_recipients where status in ('PENDING', 'FAILED', 'SENT')`,
    );
    expect(rows.map((r) => r.status).sort()).toEqual(['FAILED', 'PENDING', 'SENT', 'SENT']);
    const { rows: blocked } = await db.query(`select reason from comms_blocked_numbers`);
    expect(blocked).toEqual([{ reason: 'invalid number' }]);

    // Beem answers delivery when asked, five minutes on.
    sms.deliveries.set(sms.sent[0]!.id, 'DELIVERED');
    await db.query(
      `update comms_recipients set sent_at = now() - interval '10 minutes' where status = 'SENT'`,
    );
    expect(await outbox.pollDelivery()).toEqual({ delivered: 1, undelivered: 0 });
  });
});

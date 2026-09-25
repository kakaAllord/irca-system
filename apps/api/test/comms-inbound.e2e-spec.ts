import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import request from 'supertest';
import { RegistrySync } from '../src/core/rbac/registry-sync.service.js';
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

const SECRET = process.env.BEEM_INBOUND_SECRET!;

describe('replies: a STOP is honoured for good (07 step 7.12)', () => {
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

  /** As Beem calls it: no portal header, no cookie, the secret in the URL. */
  const beem = (key: string, body: object) =>
    request(app.getHttpServer())
      .post(`/v1/public/comms/inbound?key=${encodeURIComponent(key)}`)
      .send(body);
  const reply = (from: string, text: string, id: string = randomUUID()) => ({
    from,
    to: '255700000000',
    channel: 'sms',
    transaction_id: id,
    message: { text, media: { mediaUrl: '' }, custom: {} },
  });

  it('blocks the number, marks the person, and the next send leaves them alone', async () => {
    const choir = await createDepartment(db, { name: 'Choir' });
    const leader = await createLeader(db, choir.id);
    const juma = await createPerson(db, { fullName: 'Juma Kessy', phone: '0713 000 111' });
    await db.query(
      `insert into department_members (id, department_id, person_id) values ($1, $2, $3)`,
      [randomUUID(), choir.id, juma.id],
    );
    const template = await createTemplate(db, {
      departmentId: choir.id,
      bodies: { sw: 'Mazoezi leo.' },
    });

    const res = await beem(SECRET, reply('255713000111', ' Acha ', 'tx-1')).expect(200);
    expect(res.body).toEqual({ transaction_id: 'tx-1', successful: true });

    const { rows: blocked } = await db.query(
      `select phone, reason, person_id from comms_blocked_numbers`,
    );
    expect(blocked).toEqual([
      { phone: '+255713000111', reason: 'replied STOP', person_id: juma.id },
    ]);
    const { rows: people } = await db.query(
      `select sms_opt_out, sms_opt_out_source from people where id = $1`,
      [juma.id],
    );
    expect(people[0]).toEqual({ sms_opt_out: true, sms_opt_out_source: 'reply' });

    const cookie = sessionCookie(await portal(app).post('/v1/auth/login', leader).expect(200));
    const preview = await portal(app)
      .post(
        '/v1/comms/messages/preview',
        {
          departmentId: choir.id,
          audience: { key: 'departments.everyone', params: { departmentIds: [choir.id] } },
          templateId: template.id,
        },
        cookie,
      )
      .expect(200);
    expect(preview.body).toMatchObject({ reach: 1, leftAlone: { optedOut: 1 } });
  });

  it('keeps any other reply for Communications to read, exactly as it came', async () => {
    await beem(SECRET, reply('255713000222', 'Asante, nitakuja!')).expect(200);
    const { rows } = await db.query(`select kind, phone, body, action, raw from comms_inbound`);
    expect(rows).toEqual([
      expect.objectContaining({
        kind: 'reply',
        phone: '+255713000222',
        body: 'Asante, nitakuja!',
        action: 'kept',
      }),
    ]);
    expect(rows[0].raw.channel).toBe('sms');
    const { rows: blocked } = await db.query(`select 1 from comms_blocked_numbers`);
    expect(blocked).toHaveLength(0);
  });

  it('refuses a call without the secret, and writes nothing', async () => {
    await beem('wrong-secret', reply('255713000111', 'STOP')).expect(401);
    await request(app.getHttpServer())
      .post('/v1/public/comms/inbound')
      .send(reply('255713000111', 'STOP'))
      .expect(401);
    for (const table of ['comms_inbound', 'comms_blocked_numbers']) {
      const { rows } = await db.query(`select 1 from ${table}`);
      expect(rows).toHaveLength(0);
    }
  });
});

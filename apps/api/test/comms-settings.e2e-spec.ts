import type { NestExpressApplication } from '@nestjs/platform-express';
import pg from 'pg';
import { RegistrySync } from '../src/core/rbac/registry-sync.service.js';
import {
  createPerson,
  createApp,
  createChurch,
  createUserWithPermissions,
  ownerDb,
  portal,
  sessionCookie,
  truncateAll,
} from './helpers.js';

describe('Comms → Settings, and the Beem key kept out of sight (D26)', () => {
  let app: NestExpressApplication;
  let db: pg.Client;
  let cookie: string;

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
    const lead = await createUserWithPermissions(db, ['comms.settings.manage'], {
      moduleKey: 'comms',
    });
    cookie = sessionCookie(
      await portal(app)
        .post('/v1/auth/login', { email: lead.email, password: lead.password })
        .expect(200),
    );
  });

  it('starts with no daily limit, and keeps the one saved', async () => {
    const before = await portal(app).get('/v1/comms/settings', cookie).expect(200);
    expect(before.body).toMatchObject({
      pricePerSegment: '30.00',
      dailyCap: null,
      defaultLang: 'sw',
      quietHours: '21:00-07:00',
      beem: { saved: false, canSave: true },
    });

    await portal(app)
      .put(
        '/v1/comms/settings',
        { pricePerSegment: '28', dailyCap: '50000', defaultLang: 'sw', quietHours: '21:30-06:30' },
        cookie,
      )
      .expect(204);
    const after = await portal(app).get('/v1/comms/settings', cookie).expect(200);
    expect(after.body).toMatchObject({
      pricePerSegment: '28.00',
      dailyCap: '50000.00',
      quietHours: '21:30-06:30',
    });

    const bad = await portal(app)
      .put(
        '/v1/comms/settings',
        { pricePerSegment: '-1', dailyCap: null, defaultLang: 'de', quietHours: 'late' },
        cookie,
      )
      .expect(400);
    expect(Object.keys(bad.body.error.details)).toEqual(
      expect.arrayContaining(['pricePerSegment', 'defaultLang', 'quietHours']),
    );
  });

  it('saves the Beem key sealed, shows only its last four characters, and never writes it down', async () => {
    const key = 'beem-api-key-abcd1234';
    const secret = 'beem-secret-that-must-not-leak';
    await portal(app)
      .put('/v1/comms/settings/beem', { apiKey: key, secretKey: secret, senderId: 'IRCA' }, cookie)
      .expect(204);

    const shown = await portal(app).get('/v1/comms/settings', cookie).expect(200);
    expect(shown.body.beem).toMatchObject({ saved: true, senderId: 'IRCA', keyHint: '…1234' });
    expect(JSON.stringify(shown.body)).not.toContain('abcd1234');

    // Sealed in the database, not stored as typed.
    const { rows } = await db.query(`select api_key_enc, secret_key_enc from comms_beem_account`);
    expect(Buffer.from(rows[0].api_key_enc).toString('latin1')).not.toContain(key);
    expect(Buffer.from(rows[0].secret_key_enc).toString('latin1')).not.toContain(secret);

    // The log says what changed, never the key.
    const { rows: log } = await db.query(
      `select summary, before, after from audit_events where action = 'comms.beem.saved'`,
    );
    expect(log[0].summary).toBe(
      'Saved the Beem account: the key, the secret, the sender name (IRCA)',
    );
    expect(JSON.stringify(log)).not.toContain('abcd');

    // Changing only the sender name keeps the key.
    await portal(app)
      .put('/v1/comms/settings/beem', { senderId: 'IRCA CHURCH' }, cookie)
      .expect(204);
    const again = await portal(app).get('/v1/comms/settings', cookie).expect(200);
    expect(again.body.beem).toMatchObject({ senderId: 'IRCA CHURCH', keyHint: '…1234' });

    // Test connection answers from the provider in use.
    const tested = await portal(app).post('/v1/comms/settings/beem/test', {}, cookie).expect(201);
    expect(tested.body.ok).toBe(true);
  });

  it('asks for both the key and the secret the first time', async () => {
    const res = await portal(app)
      .put('/v1/comms/settings/beem', { apiKey: 'only-a-key', senderId: 'IRCA' }, cookie)
      .expect(422);
    expect(res.body.error.details).toEqual({ secretKey: ['Needed'] });
  });

  it('lets the office set how a person is written to, and staff turn texts off themselves', async () => {
    await createChurch(db, 'IRCA', ['admin', 'comms', 'membership']);
    const office = await createUserWithPermissions(
      db,
      ['membership.people.read', 'membership.people.update'],
      {
        moduleKey: 'membership',
      },
    );
    const officeCookie = sessionCookie(
      await portal(app)
        .post('/v1/auth/login', { email: office.email, password: office.password })
        .expect(200),
    );
    const person = await createPerson(db, { fullName: 'Juma Kessy' });
    await portal(app)
      .put(
        `/v1/membership/people/${person.id}/messaging`,
        { lang: 'sw', optOut: true },
        officeCookie,
      )
      .expect(204);
    const detail = await portal(app)
      .get(`/v1/membership/people/${person.id}`, officeCookie)
      .expect(200);
    expect(detail.body.messaging).toEqual({ lang: 'sw', optOut: true, optOutSource: 'office' });
    const { rows } = await db.query(
      `select summary from audit_events where action = 'membership.person.messaging'`,
    );
    expect(rows[0].summary).toBe(
      'Changed how Juma Kessy is messaged: language en → sw, no messages',
    );

    // Staff turn their own texts off on the Account page.
    expect((await portal(app).get('/v1/me/messages', cookie).expect(200)).body.optOut).toBe(false);
    await portal(app).put('/v1/me/messages', { optOut: true }, cookie).expect(204);
    expect((await portal(app).get('/v1/me/messages', cookie).expect(200)).body.optOut).toBe(true);
  });

  it('never lets someone viewed as read the sealed account', async () => {
    const reader = new pg.Client({ connectionString: process.env.DATABASE_URL_READONLY });
    await reader.connect();
    try {
      await expect(reader.query('select * from comms_beem_account')).rejects.toThrow(
        /permission denied/,
      );
    } finally {
      await reader.end();
    }
  });
});

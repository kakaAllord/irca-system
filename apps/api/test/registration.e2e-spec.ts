import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import {
  asForm,
  createApiClient,
  createChurch,
  createApp,
  ownerDb,
  truncateAll,
} from './helpers.js';

/** Enough of the first screen to pass its rules. */
const WHO = {
  fullname: 'Neema Mollel',
  gender: 'Female',
  age: '25-34',
  occ: 'Professional',
  dialCc: 'TZ',
  dial: '+255',
  phone: '712345678',
};

describe('the registration form, served by the API', () => {
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
  beforeEach(() => truncateAll(db));

  /** A church with a form of its own. */
  async function church(code = 'IRCA') {
    await createChurch(db, code, ['admin', 'membership']);
    return { form: asForm(app, await createApiClient(db)) };
  }

  const start = async (form: ReturnType<typeof asForm>, lang = 'en') =>
    (await form.post('/v1/public/registrations', { lang }).expect(201)).body as {
      token: string;
      lang: string;
      currentStep: string;
      values: Record<string, unknown>;
    };

  it('starts a registration, in the language asked for, and makes a person', async () => {
    const { form } = await church();
    const registration = await start(form, 'sw');

    expect(registration.token).toMatch(/^[a-f0-9]{32}$/);
    expect(registration.lang).toBe('sw');
    expect(registration.currentStep).toBe('who');
    // The office should see somebody from the first tap, finished or not.
    const { rows } = await db.query(`select stage from people`);
    expect(rows).toHaveLength(1);
    expect(rows[0].stage).toBe('VISITOR');
  });

  it('falls back to English for a language it does not know', async () => {
    const { form } = await church();
    expect((await start(form, 'de')).lang).toBe('en');
  });

  it("refuses a step until it is answered, in the visitor's own language", async () => {
    const { form } = await church();
    const { token } = await start(form, 'sw');

    const missing = await form
      .post(`/v1/public/registrations/${token}/steps/who`, { draft: { fullname: 'Neema' } })
      .expect(200);
    expect(missing.body.ok).toBe(false);
    // Swahili, because that is the language this registration is in.
    expect(missing.body.error).toMatch(/Bado/i);

    const done = await form
      .post(`/v1/public/registrations/${token}/steps/who`, { draft: WHO })
      .expect(200);
    expect(done.body).toEqual({ ok: true, next: 'heard' });
  });

  it('keeps only the keys the step owns', async () => {
    const { form } = await church();
    const { token } = await start(form);
    await form.post(`/v1/public/registrations/${token}/steps/who`, {
      draft: { ...WHO, prayer: 'not this step' },
    });

    const read = await form.get(`/v1/public/registrations/${token}`).expect(200);
    expect(read.body.values.fullname).toBe('Neema Mollel');
    expect(read.body.values.prayer).toBe('');
  });

  it('remembers the furthest question even after walking back', async () => {
    const { form } = await church();
    const { token } = await start(form);
    await form.post(`/v1/public/registrations/${token}/steps/who`, { draft: WHO });
    await form.post(`/v1/public/registrations/${token}/steps/heard`, {
      draft: { heard: ['A friend'], friendName: 'Joyce' },
    });

    // Back to the first question, and save it again.
    await form.post(`/v1/public/registrations/${token}/steps/who`, { draft: WHO });
    const read = await form.get(`/v1/public/registrations/${token}`).expect(200);
    expect(read.body.currentStep).toBe('heard');
    expect(read.body.furthestStep).not.toBe('who');
  });

  it('saves a half-typed answer without judging it', async () => {
    const { form } = await church();
    const { token } = await start(form);

    await form
      .post(`/v1/public/registrations/${token}/draft`, {
        stepId: 'who',
        values: { fullname: 'Nee', phone: '71' },
      })
      .expect(204);

    const read = await form.get(`/v1/public/registrations/${token}`).expect(200);
    expect(read.body.values.fullname).toBe('Nee');
    expect(read.body.values.phone).toBe('71');
  });

  it('will not let two people register the same number', async () => {
    const { form } = await church();
    const first = await start(form);
    const second = await start(form);
    await form.post(`/v1/public/registrations/${first.token}/steps/who`, { draft: WHO });

    const taken = await form
      .post(`/v1/public/registrations/${second.token}/steps/who`, { draft: WHO })
      .expect(200);
    expect(taken.body.ok).toBe(false);
    expect(taken.body.error).toMatch(/already/i);
  });

  it('changes the language of a registration already under way, and ignores nonsense', async () => {
    const { form } = await church();
    const { token } = await start(form);

    await form.put(`/v1/public/registrations/${token}/lang`, { lang: 'fr' }).expect(204);
    expect((await form.get(`/v1/public/registrations/${token}`)).body.lang).toBe('fr');

    await form.put(`/v1/public/registrations/${token}/lang`, { lang: 'de' }).expect(204);
    expect((await form.get(`/v1/public/registrations/${token}`)).body.lang).toBe('fr');
  });

  it('refuses a request with no key, a made-up key, or a revoked one', async () => {
    const { form } = await church();
    const { token } = await start(form);

    await asForm(app, 'irk_nonsense').get(`/v1/public/registrations/${token}`).expect(401);
    const key = await createApiClient(db);
    await db.query(`update api_clients set revoked_at = now() where key_hash is not null`);
    await asForm(app, key).get(`/v1/public/registrations/${token}`).expect(401);
  });

  it('sends the form in at the last question, and records it once', async () => {
    const { form } = await church();
    const { token } = await start(form);

    // The whole path a visitor who lives in Arusha is shown.
    const walk: [string, Record<string, unknown>][] = [
      ['who', WHO],
      ['heard', { heard: ['A friend'], friendName: 'Joyce' }],
      [
        'visit',
        { visit: ['First time visitor'], where: 'arusha', ward: 'Njiro', often: 'Every Sunday' },
      ],
      ['prayer', { liked: 'The singing', wantMore: false, interest: [], prayer: '' }],
    ];
    for (const [step, draft] of walk) {
      const res = await form.post(`/v1/public/registrations/${token}/steps/${step}`, { draft });
      expect(res.body.ok).toBe(true);
    }

    const read = await form.get(`/v1/public/registrations/${token}`).expect(200);
    expect(read.body.status).toBe('submitted');
    expect(read.body.currentStep).toBe('done');
    expect(read.body.submittedAt).not.toBeNull();

    // One line in the log for the whole form, and nobody is the actor: the
    // visitor is not a user of this system.
    const { rows } = await db.query(`select action, actor_user_id from audit_events`);
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('membership.registration.submitted');
    expect(rows[0].actor_user_id).toBeNull();
  });

  it('will not take another answer once it has been sent in', async () => {
    const { form } = await church();
    const { token } = await start(form);
    for (const [step, draft] of [
      ['who', WHO],
      ['heard', { heard: ['A friend'], friendName: 'Joyce' }],
      [
        'visit',
        { visit: ['First time visitor'], where: 'arusha', ward: 'Njiro', often: 'Every Sunday' },
      ],
      ['prayer', { liked: 'The singing', wantMore: false, interest: [], prayer: '' }],
    ] as [string, Record<string, unknown>][]) {
      await form.post(`/v1/public/registrations/${token}/steps/${step}`, { draft });
    }

    const after = await form
      .post(`/v1/public/registrations/${token}/steps/who`, {
        draft: { ...WHO, fullname: 'Someone Else' },
      })
      .expect(200);
    expect(after.body).toEqual({ ok: true, next: 'done' });
    const read = await form.get(`/v1/public/registrations/${token}`);
    expect(read.body.values.fullname).toBe('Neema Mollel');
  });

  it('slows down one visitor starting registration after registration', async () => {
    // One visitor address for all of them; the limit is per visitor.
    const form = asForm(app, await createApiClient(db), '41.1.2.3');
    for (let i = 0; i < 20; i++) {
      await form.post('/v1/public/registrations', { lang: 'en' }).expect(201);
    }
    await form.post('/v1/public/registrations', { lang: 'en' }).expect(429);
  });
});

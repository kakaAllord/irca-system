import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import { membershipModule } from '@irca/shared';
import {
  asForm,
  createApiClient,
  createApp,
  createChurch,
  createUserWithPermissions,
  ownerDb,
  portal,
  sessionCookie,
  truncateAll,
} from './helpers.js';

const ALL = Object.keys(membershipModule.permissions);
const WITHOUT_SENSITIVE = ALL.filter((p) => p !== 'membership.people.read_sensitive');

const WHO = {
  fullname: 'Neema Mollel',
  gender: 'Female',
  age: '19–35',
  occ: 'Professional',
  dialCc: 'TZ',
  dial: '+255',
  phone: '712345678',
};
/** What someone asking to join is asked on top: work, faith, family, serving. */
const MEMBER_STEPS: [string, Record<string, unknown>][] = [
  ['occDetail', { profession: 'Nurse' }],
  [
    'faith',
    {
      dob: '1995-04-12',
      saved: true,
      savedYear: '2015',
      bapt: false,
      holy: false,
      prevChurch: false,
    },
  ],
  ['family', { marital: 'Single', kids: false }],
  ['serve', { ministries: ['Ushering'] }],
];
const TO_THE_END: [string, Record<string, unknown>][] = [
  ['who', WHO],
  ['heard', { heard: ['A friend'], friendName: 'Joyce' }],
  ['visit', { visit: ['First time visitor'], where: 'arusha', ward: 'Njiro', often: 'Every week' }],
  [
    'prayer',
    { liked: 'The singing', wantMore: true, interest: ['Salvation'], prayer: 'For my mother' },
  ],
];

describe('the Membership portal', () => {
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

  const signIn = async (email: string, password: string) =>
    sessionCookie(await portal(app).post('/v1/auth/login', { email, password }).expect(200));

  /** A church running Membership, with its form, and someone holding these permissions. */
  async function church(permissions: string[] = ALL, code = 'IRCA') {
    await createChurch(db, code, ['admin', 'membership']);
    const form = asForm(app, await createApiClient(db));
    const person = await createUserWithPermissions(db, permissions, {
      moduleKey: 'membership',
    });
    return { form, cookie: await signIn(person.email, person.password) };
  }

  async function also(permissions: string[]) {
    const person = await createUserWithPermissions(db, permissions, {
      moduleKey: 'membership',
    });
    return signIn(person.email, person.password);
  }

  /** Someone who filled in the whole form, and their Person's id. */
  async function registered(
    form: ReturnType<typeof asForm>,
    overrides: Record<string, unknown> = {},
  ) {
    const { body } = await form.post('/v1/public/registrations', { lang: 'en' }).expect(201);
    const joining = (overrides.interest as string[] | undefined)?.includes('Joining the church');
    for (const [step, draft] of [...TO_THE_END, ...(joining ? MEMBER_STEPS : [])]) {
      // Each step keeps only its own keys, so the overrides can go to all.
      const res = await form.post(`/v1/public/registrations/${body.token}/steps/${step}`, {
        draft: { ...draft, ...overrides },
      });
      expect(res.body.ok).toBe(true);
    }
    const { rows } = await db.query<{ id: string }>(
      `select p.id from people p join registrations r on r.id = p.registration_id where r.token = $1`,
      [body.token],
    );
    return { token: body.token as string, personId: rows[0]!.id };
  }

  describe('what people wrote in confidence', () => {
    it('is in the record for those allowed, and not even a key for anyone else', async () => {
      const { form, cookie } = await church();
      const { personId } = await registered(form);
      const followUp = await also(WITHOUT_SENSITIVE);

      const full = await portal(app).get(`/v1/membership/people/${personId}`, cookie).expect(200);
      expect(full.body.sensitive.prayer).toBe('For my mother');
      expect(full.body.notes).toEqual([]);

      const limited = await portal(app)
        .get(`/v1/membership/people/${personId}`, followUp)
        .expect(200);
      expect(limited.body.fullName).toBe('Neema Mollel');
      expect('sensitive' in limited.body).toBe(false);
      expect('notes' in limited.body).toBe(false);
      expect(JSON.stringify(limited.body)).not.toContain('For my mother');
    });

    it('cannot be found by searching for an email one may not see', async () => {
      const { form, cookie } = await church();
      await registered(form, { email: 'neema@example.com' });
      const followUp = await also(WITHOUT_SENSITIVE);

      const found = await portal(app).get('/v1/membership/people?q=neema@example', cookie);
      expect(found.body.total).toBe(1);
      const hidden = await portal(app).get('/v1/membership/people?q=neema@example', followUp);
      expect(hidden.body.total).toBe(0);
    });
  });

  describe('the Members list', () => {
    it('counts every tab with the other filters applied', async () => {
      const { form, cookie } = await church();
      await registered(form);
      // One who never finished.
      const { body } = await form.post('/v1/public/registrations', { lang: 'en' }).expect(201);
      await form.post(`/v1/public/registrations/${body.token}/draft`, {
        stepId: 'who',
        values: { fullname: 'Half Way' },
      });

      const all = await portal(app).get('/v1/membership/people', cookie).expect(200);
      expect(all.body.tabCounts.all).toBe(2);
      expect(all.body.tabCounts.incomplete).toBe(1);
      // Unfinished first, as the office list always had it.
      expect(all.body.rows[0].complete).toBe(false);
      expect(all.body.rows[0].progress.of).toBeGreaterThan(0);

      const women = await portal(app).get('/v1/membership/people?gender=Female', cookie);
      expect(women.body.tabCounts.all).toBe(1);
    });

    it('goes by the form until the office says otherwise', async () => {
      const { form, cookie } = await church();
      const { personId } = await registered(form);

      const before = await portal(app).get(`/v1/membership/people/${personId}`, cookie);
      expect(before.body.saved).toEqual({ value: false, source: 'none' });

      await portal(app)
        .post(`/v1/membership/people/${personId}/saved`, { value: true }, cookie)
        .expect(204);
      const after = await portal(app).get(`/v1/membership/people/${personId}`, cookie);
      expect(after.body.saved).toEqual({ value: true, source: 'office' });
      // A saved visitor is a new convert, and the move is written down.
      expect(after.body.stage).toBe('NEW_CONVERT');
      expect(after.body.history[0]).toMatchObject({ from: 'VISITOR', to: 'NEW_CONVERT' });
    });
  });

  describe('the journey', () => {
    it('moves one step at a time, and back only with a note', async () => {
      const { form, cookie } = await church();
      const { personId } = await registered(form);

      const skip = await portal(app)
        .post(`/v1/membership/people/${personId}/stage`, { to: 'AWAITING_BAPTISM' }, cookie)
        .expect(422);
      expect(skip.body.error.code).toBe('STAGE_MOVE_NOT_ALLOWED');

      await portal(app)
        .post(`/v1/membership/people/${personId}/stage`, { to: 'NEW_CONVERT' }, cookie)
        .expect(204);
      await portal(app)
        .post(`/v1/membership/people/${personId}/stage`, { to: 'VISITOR' }, cookie)
        .expect(422);
      await portal(app)
        .post(
          `/v1/membership/people/${personId}/stage`,
          { to: 'VISITOR', note: 'Marked by mistake' },
          cookie,
        )
        .expect(204);

      // The last two stages belong to the pastors' decision, not a drag.
      const byHand = await portal(app)
        .post(`/v1/membership/people/${personId}/stage`, { to: 'MEMBERSHIP_REVIEW' }, cookie)
        .expect(422);
      expect(byHand.body.error.message).toMatch(/Applications/);
    });

    it('takes someone through the foundation class', async () => {
      const { form, cookie } = await church();
      const { personId } = await registered(form);
      await portal(app).post(`/v1/membership/people/${personId}/saved`, { value: true }, cookie);

      const group = await portal(app)
        .post('/v1/membership/discipleship/groups', { name: 'Thursday group' }, cookie)
        .expect(201);
      const enrollment = await portal(app)
        .post(
          '/v1/membership/discipleship/enrollments',
          { personId, groupId: group.body.id },
          cookie,
        )
        .expect(201);
      // Once only.
      await portal(app)
        .post(
          '/v1/membership/discipleship/enrollments',
          { personId, groupId: group.body.id },
          cookie,
        )
        .expect(409);

      // Two missed in a row is a warning, never an automatic drop.
      for (const [sessionNo, mark] of [
        [1, 'MISSED'],
        [2, 'MISSED'],
      ] as const) {
        await portal(app)
          .put(
            '/v1/membership/discipleship/attendance',
            { enrollmentId: enrollment.body.id, sessionNo, mark },
            cookie,
          )
          .expect(204);
      }
      const register = await portal(app).get(
        `/v1/membership/discipleship/register?group=${group.body.id}`,
        cookie,
      );
      expect(register.body.rows[0].atRisk).toBe(true);
      const still = await portal(app).get(`/v1/membership/people/${personId}`, cookie);
      expect(still.body.stage).toBe('FOUNDATION_CLASS');

      for (let sessionNo = 1; sessionNo <= 6; sessionNo++) {
        await portal(app).put(
          '/v1/membership/discipleship/attendance',
          { enrollmentId: enrollment.body.id, sessionNo, mark: 'ATTENDED' },
          cookie,
        );
      }
      const done = await portal(app).get(`/v1/membership/people/${personId}`, cookie);
      expect(done.body.stage).toBe('AWAITING_BAPTISM');
    });
  });

  describe('applications', () => {
    it('are the pastors’ to decide, and confirm only after the probation month', async () => {
      const { form, cookie } = await church();
      const { personId } = await registered(form);
      const office = await also(ALL.filter((p) => p !== 'membership.applications.decide'));

      const created = await portal(app)
        .post('/v1/membership/applications', { personId }, office)
        .expect(201);
      await portal(app).post('/v1/membership/applications', { personId }, office).expect(409);

      await portal(app)
        .post(`/v1/membership/applications/${created.body.id}/approve`, {}, office)
        .expect(403);
      await portal(app)
        .post(`/v1/membership/applications/${created.body.id}/approve`, {}, cookie)
        .expect(204);

      const early = await portal(app)
        .post(`/v1/membership/applications/${created.body.id}/confirm`, {}, cookie)
        .expect(422);
      expect(early.body.error.code).toBe('PROBATION_NOT_OVER');
      expect(early.body.error.details.availableOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // A month later.
      await db.query(
        `update membership_applications set decided_at = now() - interval '31 days' where id = $1`,
        [created.body.id],
      );
      const confirmed = await portal(app)
        .post(`/v1/membership/applications/${created.body.id}/confirm`, {}, cookie)
        .expect(200);
      expect(confirmed.body.memberNumber).toBe(1);

      const person = await portal(app).get(`/v1/membership/people/${personId}`, cookie);
      expect(person.body.stage).toBe('CONFIRMED_MEMBER');
      expect(person.body.memberNumber).toBe(1);
    });

    it('arrive by themselves when the form asks to join', async () => {
      const { form, cookie } = await church();
      await registered(form, { interest: ['Joining the church'] });

      const list = await portal(app).get('/v1/membership/applications', cookie).expect(200);
      expect(list.body.rows).toHaveLength(1);
      expect(list.body.rows[0].source).toBe('FORM');
    });

    it('send someone back to where they were when rejected', async () => {
      const { form, cookie } = await church();
      const { personId } = await registered(form);
      await portal(app).post(`/v1/membership/people/${personId}/saved`, { value: true }, cookie);
      const created = await portal(app)
        .post('/v1/membership/applications', { personId }, cookie)
        .expect(201);

      await portal(app)
        .post(`/v1/membership/applications/${created.body.id}/reject`, {}, cookie)
        .expect(400);
      await portal(app)
        .post(
          `/v1/membership/applications/${created.body.id}/reject`,
          { reason: 'Not yet through the class' },
          cookie,
        )
        .expect(204);
      const person = await portal(app).get(`/v1/membership/people/${personId}`, cookie);
      expect(person.body.stage).toBe('NEW_CONVERT');
    });
  });

  describe('sending someone their link', () => {
    it('gives the link and a WhatsApp message in their own language', async () => {
      const { form, cookie } = await church();
      const { body } = await form.post('/v1/public/registrations', { lang: 'sw' }).expect(201);
      await form.post(`/v1/public/registrations/${body.token}/draft`, {
        stepId: 'who',
        values: { fullname: 'Neema Mollel', phone: '712345678' },
      });
      const { rows } = await db.query<{ id: string }>(
        `select p.id from people p join registrations r on r.id = p.registration_id where r.token = $1`,
        [body.token],
      );

      const link = await portal(app)
        .get(`/v1/membership/people/${rows[0]!.id}/registration-link`, cookie)
        .expect(200);
      expect(link.body.url).toContain(`/r/${body.token}`);
      expect(link.body.message).toMatch(/^Habari Neema/);
      expect(link.body.whatsappUrl).toMatch(/^https:\/\/wa\.me\/255712345678\?text=/);

      await portal(app)
        .post(`/v1/membership/people/${rows[0]!.id}/reminders`, { channel: 'WHATSAPP' }, cookie)
        .expect(204);
      const sent = await db.query(`select channel from registration_reminders`);
      expect(sent.rows[0].channel).toBe('WHATSAPP');
    });
  });

  describe('the built-in roles', () => {
    /** What each role must be able to do, and what it must be refused. */
    const ROLES: Record<string, readonly string[]> = Object.fromEntries(
      membershipModule.systemRoles.map((role) => [role.key, role.permissions]),
    );
    const ROUTES: { need: string; call: (cookie: string, personId: string) => Promise<number> }[] =
      [
        {
          need: 'membership.people.read',
          call: async (c) => (await portal(app).get('/v1/membership/people', c)).status,
        },
        {
          need: 'membership.people.update',
          call: async (c, id) =>
            (await portal(app).post(`/v1/membership/people/${id}/baptised`, { value: true }, c))
              .status,
        },
        {
          need: 'membership.people.export',
          call: async (c) => (await portal(app).get('/v1/membership/people/export.csv', c)).status,
        },
        {
          need: 'membership.notes.write',
          call: async (c, id) =>
            (
              await portal(app).post(
                `/v1/membership/people/${id}/notes`,
                { kind: 'VISIT', body: 'Visited' },
                c,
              )
            ).status,
        },
        {
          need: 'membership.applications.read',
          call: async (c) => (await portal(app).get('/v1/membership/applications', c)).status,
        },
        {
          need: 'membership.insights.read',
          call: async (c) => (await portal(app).get('/v1/membership/insights', c)).status,
        },
        {
          need: 'membership.discipleship.manage',
          call: async (c) =>
            (
              await portal(app).post(
                '/v1/membership/discipleship/groups',
                { name: `Group ${Math.random()}` },
                c,
              )
            ).status,
        },
      ];

    it.each(Object.keys(ROLES))('%s can do exactly what it says', async (roleKey) => {
      const { form } = await church();
      const { personId } = await registered(form);
      const cookie = await also([...ROLES[roleKey]!]);

      for (const route of ROUTES) {
        const status = await route.call(cookie, personId);
        const allowed = ROLES[roleKey]!.includes(route.need);
        expect({ route: route.need, ok: status < 300 }).toEqual({ route: route.need, ok: allowed });
        if (!allowed) expect(status).toBe(403);
      }
    });
  });

  describe('while being viewed as', () => {
    it('refuses every change, and still shows the pages', async () => {
      const { form } = await church();
      const { personId } = await registered(form);
      const pastor = await createUserWithPermissions(db, ALL, { moduleKey: 'membership' });
      const admin = await createUserWithPermissions(
        db,
        ['admin.users.impersonate', 'admin.users.read'],
        { moduleKey: 'admin' },
      );
      const cookie = await signIn(admin.email, admin.password);
      await portal(app).post('/v1/impersonation', { subjectUserId: pastor.id }, cookie).expect(200);

      for (const call of [
        () => portal(app).post(`/v1/membership/people/${personId}/saved`, { value: true }, cookie),
        () =>
          portal(app).post(
            `/v1/membership/people/${personId}/notes`,
            { kind: 'NOTE', body: 'x x' },
            cookie,
          ),
        () => portal(app).post('/v1/membership/applications', { personId }, cookie),
        () => portal(app).post('/v1/membership/discipleship/groups', { name: 'Tuesday' }, cookie),
      ]) {
        const res = await call();
        expect(res.status).toBe(403);
      }
      await portal(app).get(`/v1/membership/people/${personId}`, cookie).expect(200);
    });
  });

  describe('member numbers', () => {
    it('are never given twice, even when two are confirmed at once', async () => {
      const { form, cookie } = await church();
      const ids: string[] = [];
      for (const phone of ['712000001', '712000002']) {
        const { personId } = await registered(form, { phone });
        const app_ = await portal(app)
          .post('/v1/membership/applications', { personId }, cookie)
          .expect(201);
        await portal(app)
          .post(`/v1/membership/applications/${app_.body.id}/approve`, {}, cookie)
          .expect(204);
        ids.push(app_.body.id);
      }
      await db.query(`update membership_applications set decided_at = now() - interval '31 days'`);

      const [a, b] = await Promise.all(
        ids.map((id) => portal(app).post(`/v1/membership/applications/${id}/confirm`, {}, cookie)),
      );
      expect([a!.body.memberNumber, b!.body.memberNumber].sort((x, y) => x - y)).toEqual([1, 2]);
    });
  });
});

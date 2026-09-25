import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import pg from 'pg';
import { PrismaDb } from '../src/core/database/prisma-clients.js';
import { erasePerson } from '../src/cli/commands/person-erase.js';
import { createApp, createChurch, createUser, ownerDb, truncateAll } from './helpers.js';

describe('erasing one person, at their request', () => {
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

  /** A person with everything a person can have, and another one beside her. */
  async function seed() {
    const staff = await createUser(db);
    const registrationId = randomUUID();
    const personId = randomUUID();
    await db.query(
      `insert into registrations (id, token, lang, status, fullname, phone, prayer, updated_at)
       values ($1, $2, 'sw', 'submitted', 'Neema Mollel', '712345678', 'Pray for my mother', now())`,
      [registrationId, 'n'.repeat(32)],
    );
    await db.query(
      `insert into people (id, registration_id, full_name, phone, stage, updated_at)
       values ($1, $2, 'Neema Mollel', '712345678', 'VISITOR', now())`,
      [personId, registrationId],
    );
    await db.query(
      `insert into person_notes (id, person_id, kind, body, author_id, created_at)
       values (gen_random_uuid(), $1, 'VISIT', 'Visited at home', $2, now())`,
      [personId, staff.id],
    );
    await db.query(
      `insert into person_stage_events (id, person_id, to_stage, at)
       values (gen_random_uuid(), $1, 'VISITOR', now())`,
      [personId],
    );
    await db.query(
      `insert into membership_applications (id, person_id, source, submitted_at)
       values (gen_random_uuid(), $1, 'FORM', now())`,
      [personId],
    );
    const groupId = randomUUID();
    await db.query(`insert into foundation_groups (id, name) values ($1, 'Thursday group')`, [
      groupId,
    ]);
    const enrollmentId = randomUUID();
    await db.query(
      `insert into foundation_enrollments (id, person_id, group_id) values ($1, $2, $3)`,
      [enrollmentId, personId, groupId],
    );
    await db.query(
      `insert into foundation_attendance (enrollment_id, session_no, mark, marked_by_id, marked_at)
       values ($1, 1, 'ATTENDED', $2, now())`,
      [enrollmentId, staff.id],
    );
    const departmentId = randomUUID();
    await db.query(`insert into departments (id, name, updated_at) values ($1, 'Choir', now())`, [
      departmentId,
    ]);
    await db.query(
      `insert into department_members (id, department_id, person_id) values ($1, $2, $3)`,
      [randomUUID(), departmentId, personId],
    );
    await db.query(
      `insert into person_interactions (id, person_id, kind, at, module_key, summary)
       values (gen_random_uuid(), $1, 'REGISTERED', now(), 'membership', 'Filled in the registration form')`,
      [personId],
    );
    // Reached on a Saturday themselves, and one of the team who reached
    // someone else, whose timeline names them.
    const saturday = randomUUID();
    await db.query(
      `insert into outreach_sessions (id, held_on, created_by_id) values ($1, '2026-09-19', $2)`,
      [saturday, staff.id],
    );
    await db.query(
      `insert into outreach_reached (id, person_id, session_id, reached_on, reached_by_ids, recorded_by_id)
       values (gen_random_uuid(), $1, $3, current_date, '{}', $2)`,
      [personId, staff.id, saturday],
    );
    // The leader's report of that Saturday, which may name them.
    await db.query(
      `insert into files (id, module_key, entity_type, entity_id, key, original_name, content_type, bytes, uploaded_by_id)
       values (gen_random_uuid(), 'outreach', 'outreach_session', $1, $2, 'Sombetini.pdf', 'application/pdf', 10, $3)`,
      [saturday, `outreach/sessions/${saturday}/report.pdf`, staff.id],
    );
    const other = randomUUID();
    await db.query(
      `insert into people (id, full_name, updated_at) values ($1, 'Baraka Laizer', now())`,
      [other],
    );
    await db.query(
      `insert into outreach_reached (id, person_id, reached_on, reached_by_ids, recorded_by_id)
       values (gen_random_uuid(), $1, current_date, array[$2::uuid], $3)`,
      [other, personId, staff.id],
    );
    await db.query(
      `insert into person_interactions (id, person_id, kind, at, module_key, summary)
       values (gen_random_uuid(), $1, 'EVANGELISED', now(), 'outreach',
               'Evangelised by Neema Mollel, Sombetini')`,
      [other],
    );
    await db.query(
      `insert into audit_events (id, source, action, entity_type, entity_id, summary, after)
       values (gen_random_uuid(), 'feature', 'membership.person.added', 'person', $1,
               'Added Neema Mollel to the people', '{"fullName":"Neema Mollel"}')`,
      [personId],
    );
    // A pledge and a payment towards it: never deleted, even now.
    const campaignId = randomUUID();
    const pledgeId = randomUUID();
    await db.query(
      `insert into pledge_campaigns (id, name, starts_on, created_by_id, updated_at)
       values ($1, 'Ujenzi 2027', '2026-01-01', $2, now())`,
      [campaignId, staff.id],
    );
    await db.query(
      `insert into pledges (id, campaign_id, person_id, amount, promised_on, recorded_by_id, client_request_id)
       values ($1, $2, $3, 100000, '2026-09-01', $4, $5)`,
      [pledgeId, campaignId, personId, staff.id, randomUUID()],
    );
    await db.query(
      `insert into pledge_payments (id, pledge_id, amount, paid_on, recorded_by_id, client_request_id)
       values ($1, $2, 25000, '2026-09-20', $3, $4)`,
      [randomUUID(), pledgeId, staff.id, randomUUID()],
    );
    return { personId, registrationId };
  }

  const erase = (personId: string, dryRun = false) =>
    erasePerson({
      personId,
      dryRun,
      db: app.get(PrismaDb),
      ownerUrl: process.env.DIRECT_DATABASE_URL!,
    });

  const rows = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows;

  it('takes everything about them, and leaves the log standing without their name', async () => {
    await createChurch(db, 'IRCA', ['admin', 'membership']);
    const { personId, registrationId } = await seed();

    const result = await erase(personId);

    expect(result).toMatchObject({
      registrationErased: true,
      notes: 1,
      stageEvents: 1,
      applications: 1,
      enrollments: 1,
      attendance: 1,
      departments: 1,
      interactions: 1,
      outreach: 1,
      pledgesKept: 1,
      timelinesRewritten: 1,
      reports: [
        {
          heldOn: '2026-09-19',
          name: 'Sombetini.pdf',
          key: expect.stringMatching(/^outreach\/sessions\//),
          replaced: false,
        },
      ],
    });
    // Baraka, whom they reached, stays; they are gone from his reach and his timeline.
    expect(await rows('select reached_by_ids from outreach_reached')).toEqual([
      { reached_by_ids: [] },
    ]);
    expect(await rows('select summary from person_interactions')).toEqual([
      { summary: 'Evangelised by [erased], Sombetini' },
    ]);
    expect(await rows('select 1 from people where id = $1', [personId])).toHaveLength(0);
    // The money stays, belonging to nobody.
    expect(await rows('select person_id, amount::text as amount from pledges')).toEqual([
      { person_id: null, amount: '100000.00' },
    ]);
    expect(await rows('select 1 from pledge_payments')).toHaveLength(1);
    for (const table of [
      'person_notes',
      'person_stage_events',
      'membership_applications',
      'foundation_enrollments',
      'foundation_attendance',
      'department_members',
    ]) {
      expect(await rows(`select 1 from ${table}`)).toHaveLength(0);
    }
    // The prayer request goes with the registration; that is the point.
    expect(await rows('select 1 from registrations where id = $1', [registrationId])).toHaveLength(
      0,
    );

    // The log keeps its lines, without the name and without the details.
    const log = await rows('select action, summary, after from audit_events order by action');
    expect(log).toEqual([
      expect.objectContaining({
        action: 'membership.person.added',
        summary: 'Added [erased] to the people',
        after: null,
      }),
      expect.objectContaining({
        action: 'person.erased',
        summary: 'Erased everything about one person, at their request',
      }),
    ]);
    expect(JSON.stringify(log)).not.toContain('Neema');
  });

  it('changes nothing on a dry run', async () => {
    await createChurch(db, 'IRCA', ['admin', 'membership']);
    const { personId } = await seed();

    const result = await erase(personId, true);

    expect(result.notes).toBe(1);
    expect(await rows('select 1 from people where id = $1', [personId])).toHaveLength(1);
    expect(await rows('select 1 from registrations')).toHaveLength(1);
    expect(await rows(`select 1 from audit_events where action = 'person.erased'`)).toHaveLength(0);
  });

  it('will not take a confirmation that is not the person id', async () => {
    await createChurch(db, 'IRCA', ['admin', 'membership']);
    const { personId } = await seed();

    await expect(
      erasePerson({
        personId,
        dryRun: false,
        db: app.get(PrismaDb),
        ownerUrl: process.env.DIRECT_DATABASE_URL!,
        confirm: async () => 'yes',
      }),
    ).rejects.toThrow(/the id did not match/);
    expect(await rows('select 1 from people where id = $1', [personId])).toHaveLength(1);
  });
});

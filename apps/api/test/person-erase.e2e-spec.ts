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
  async function seed(churchId: string) {
    const staff = await createUser(db, { churchId });
    const registrationId = randomUUID();
    const personId = randomUUID();
    await db.query(
      `insert into registrations (id, church_id, token, lang, status, fullname, phone, prayer, updated_at)
       values ($1, $2, $3, 'sw', 'submitted', 'Neema Mollel', '712345678', 'Pray for my mother', now())`,
      [registrationId, churchId, 'n'.repeat(32)],
    );
    await db.query(
      `insert into people (id, church_id, registration_id, full_name, phone, stage, updated_at)
       values ($1, $2, $3, 'Neema Mollel', '712345678', 'VISITOR', now())`,
      [personId, churchId, registrationId],
    );
    await db.query(
      `insert into person_notes (id, church_id, person_id, kind, body, author_id, created_at)
       values (gen_random_uuid(), $1, $2, 'VISIT', 'Visited at home', $3, now())`,
      [churchId, personId, staff.id],
    );
    await db.query(
      `insert into person_stage_events (id, church_id, person_id, to_stage, at)
       values (gen_random_uuid(), $1, $2, 'VISITOR', now())`,
      [churchId, personId],
    );
    await db.query(
      `insert into membership_applications (id, church_id, person_id, source, submitted_at)
       values (gen_random_uuid(), $1, $2, 'FORM', now())`,
      [churchId, personId],
    );
    const groupId = randomUUID();
    await db.query(
      `insert into foundation_groups (id, church_id, name) values ($1, $2, 'Thursday group')`,
      [groupId, churchId],
    );
    const enrollmentId = randomUUID();
    await db.query(
      `insert into foundation_enrollments (id, church_id, person_id, group_id) values ($1, $2, $3, $4)`,
      [enrollmentId, churchId, personId, groupId],
    );
    await db.query(
      `insert into foundation_attendance (church_id, enrollment_id, session_no, mark, marked_by_id, marked_at)
       values ($1, $2, 1, 'ATTENDED', $3, now())`,
      [churchId, enrollmentId, staff.id],
    );
    await db.query(
      `insert into audit_events (id, church_id, source, action, entity_type, entity_id, summary, after)
       values (gen_random_uuid(), $1, 'feature', 'membership.person.added', 'person', $2,
               'Added Neema Mollel to the people', '{"fullName":"Neema Mollel"}')`,
      [churchId, personId],
    );
    return { personId, registrationId };
  }

  const erase = (churchCode: string, personId: string, dryRun = false) =>
    erasePerson({
      churchCode,
      personId,
      dryRun,
      db: app.get(PrismaDb),
      ownerUrl: process.env.DIRECT_DATABASE_URL!,
    });

  const rows = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows;

  it('takes everything about them, and leaves the log standing without their name', async () => {
    const church = await createChurch(db, 'IRCA', ['admin', 'membership']);
    const { personId, registrationId } = await seed(church.id);

    const result = await erase(church.code, personId);

    expect(result).toMatchObject({
      registrationErased: true,
      notes: 1,
      stageEvents: 1,
      applications: 1,
      enrollments: 1,
      attendance: 1,
    });
    for (const table of [
      'people',
      'person_notes',
      'person_stage_events',
      'membership_applications',
      'foundation_enrollments',
      'foundation_attendance',
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
    const church = await createChurch(db, 'IRCA', ['admin', 'membership']);
    const { personId } = await seed(church.id);

    const result = await erase(church.code, personId, true);

    expect(result.notes).toBe(1);
    expect(await rows('select 1 from people')).toHaveLength(1);
    expect(await rows('select 1 from registrations')).toHaveLength(1);
    expect(await rows(`select 1 from audit_events where action = 'person.erased'`)).toHaveLength(0);
  });

  it('refuses a person who belongs to another church', async () => {
    const irca = await createChurch(db, 'IRCA', ['admin', 'membership']);
    const other = await createChurch(db, 'TEST', ['admin', 'membership']);
    const { personId } = await seed(irca.id);

    await expect(erase(other.code, personId)).rejects.toThrow(/No person/);
    expect(await rows('select 1 from people')).toHaveLength(1);
  });

  it('will not take a confirmation that is not the person id', async () => {
    const church = await createChurch(db, 'IRCA', ['admin', 'membership']);
    const { personId } = await seed(church.id);

    await expect(
      erasePerson({
        churchCode: church.code,
        personId,
        dryRun: false,
        db: app.get(PrismaDb),
        ownerUrl: process.env.DIRECT_DATABASE_URL!,
        confirm: async () => 'yes',
      }),
    ).rejects.toThrow(/the id did not match/);
    expect(await rows('select 1 from people')).toHaveLength(1);
  });
});

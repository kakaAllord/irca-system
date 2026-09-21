import { readFileSync } from 'node:fs';
import type { NestExpressApplication } from '@nestjs/platform-express';
import pg from 'pg';
import { PrismaCore } from '../src/core/database/prisma-clients.js';
import { importRegistrations } from '../src/cli/commands/registrations-import.js';
import { createApp, createChurch, ownerDb, truncateAll } from './helpers.js';

/** A stand-in for the first database: its own schema, in its own database. */
const OLD_DB = 'irca_old_registrations_test';

describe('copying the live registrations across', () => {
  let app: NestExpressApplication;
  let db: pg.Client;
  let old: pg.Client;
  let oldUrl: string;

  beforeAll(async () => {
    app = await createApp();
    db = await ownerDb();
    const exists = await db.query(`select 1 from pg_database where datname = $1`, [OLD_DB]);
    if (!exists.rows.length) await db.query(`create database ${OLD_DB}`);

    const url = new URL(process.env.DIRECT_DATABASE_URL!);
    url.pathname = `/${OLD_DB}`;
    oldUrl = url.toString();
    old = new pg.Client({ connectionString: oldUrl });
    await old.connect();
    await old.query('drop table if exists registrations cascade');
    await old.query(readFileSync('../registration/db/schema.sql', 'utf8'));
  });
  afterAll(async () => {
    await old.end();
    await db.end();
    await app.close();
  });
  beforeEach(async () => {
    await truncateAll(db);
    await old.query('truncate registrations restart identity');
  });

  /** Rows as the first database holds them, with microseconds in every time. */
  async function seedOld() {
    await old.query(`
      insert into registrations (token, lang, status, fullname, phone, created_at, updated_at, submitted_at)
      values
        ('${'a'.repeat(32)}', 'sw', 'submitted', 'Neema Mollel', '712345678',
         '2026-06-01 09:15:00.123456+00', '2026-06-01 09:20:00.654321+00', '2026-06-01 09:20:00.654321+00'),
        ('${'b'.repeat(32)}', 'en', 'in_progress', '', '',
         '2026-06-02 10:00:00.000001+00', '2026-06-02 10:01:00.999999+00', null)`);
  }

  const run = (dryRun = false) =>
    importRegistrations({
      from: oldUrl,
      churchCode: 'IRCA',
      dryRun,
      db: app.get(PrismaCore),
    });

  it('copies every row with its token and exact times, and a person for each', async () => {
    const church = await createChurch(db, 'IRCA', ['admin', 'membership']);
    await seedOld();
    await run();

    const { rows } = await db.query(
      `select token, lang, status, fullname, legacy_id,
              created_at::text as created, updated_at::text as updated, submitted_at::text as submitted
       from registrations where church_id = $1 order by token`,
      [church.id],
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      token: 'a'.repeat(32),
      lang: 'sw',
      status: 'submitted',
      fullname: 'Neema Mollel',
      legacy_id: '1',
    });
    // To the microsecond: "registered on" must not move by a hair.
    expect(rows[0].created).toBe('2026-06-01 09:15:00.123456+00');
    expect(rows[0].updated).toBe('2026-06-01 09:20:00.654321+00');
    expect(rows[1].created).toBe('2026-06-02 10:00:00.000001+00');

    const people = await db.query(`select count(*)::int as n from people where church_id = $1`, [
      church.id,
    ]);
    expect(people.rows[0].n).toBe(2);
  });

  it('changes nothing when run again, and brings across only what changed', async () => {
    const church = await createChurch(db, 'IRCA', ['admin', 'membership']);
    await seedOld();
    await run();
    const before = await db.query(
      `select token, updated_at::text as updated from registrations where church_id = $1 order by token`,
      [church.id],
    );

    await run();
    const again = await db.query(
      `select token, updated_at::text as updated from registrations where church_id = $1 order by token`,
      [church.id],
    );
    expect(again.rows).toEqual(before.rows);
    const people = await db.query(`select count(*)::int as n from people`);
    expect(people.rows[0].n).toBe(2);

    // The visitor finishes in the old form after the first copy.
    await old.query(
      `update registrations set fullname = 'Joyce', status = 'submitted', updated_at = '2026-06-03 08:00:00.5+00'
       where token = $1`,
      ['b'.repeat(32)],
    );
    await run();
    const delta = await db.query(`select fullname, status from registrations where token = $1`, [
      'b'.repeat(32),
    ]);
    expect(delta.rows[0]).toEqual({ fullname: 'Joyce', status: 'submitted' });
  });

  it('writes nothing on a dry run', async () => {
    await createChurch(db, 'IRCA', ['admin', 'membership']);
    await seedOld();
    await run(true);
    const { rows } = await db.query(`select count(*)::int as n from registrations`);
    expect(rows[0].n).toBe(0);
  });
});

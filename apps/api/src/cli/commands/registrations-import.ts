import pg from 'pg';
import { PrismaCore } from '../../core/database/prisma-clients.js';

/* eslint-disable no-console -- a command-line tool reports to its terminal */

/** Every column of the first database's table, in its own words. */
const COLUMNS = [
  'token',
  'lang',
  'status',
  'current_step',
  'furthest_step',
  'heard',
  'heard_other_text',
  'friend_name',
  'fullname',
  'gender',
  'age',
  'visit',
  'visit_other_text',
  'where_at',
  'ward',
  'ward_other',
  'region',
  'country',
  'stay',
  'often',
  'dial_cc',
  'dial',
  'phone',
  'email',
  'occ',
  'school',
  'course',
  'year',
  'profession',
  'interest',
  'dob',
  'saved',
  'saved_year',
  'bapt',
  'bapt_year',
  'holy',
  'prev_church',
  'prev_church_name',
  'marital',
  'married_year',
  'kids',
  'children',
  'ministries',
  'other_ministry',
  'liked',
  'want_more',
  'prayer',
  'comments',
  'created_at',
  'updated_at',
  'submitted_at',
] as const;

const BATCH = 500;

/**
 * Timestamps as the text Postgres sends, not as JavaScript Dates.
 *
 * A Date holds milliseconds; Postgres holds microseconds. Parsing one on the
 * way through would quietly move every "registered at" by up to a
 * millisecond, and the copy would never compare equal to its original. Left
 * as text, the value goes back into Postgres exactly as it came out.
 */
const TIMESTAMPTZ = 1184;
const exactTimes = {
  getTypeParser: (oid: number, format?: 'text' | 'binary') =>
    oid === TIMESTAMPTZ ? (value: string) => value : pg.types.getTypeParser(oid, format as 'text'),
};

/**
 * Copies the live registrations into the shared database.
 *
 * Re-runnable on purpose: rows are matched on their token and only written
 * when the copy is older than the original, so running it again brings across
 * what changed since and nothing else. That is what makes a cutover calm —
 * import the day before, import again on the morning, and the difference is
 * a handful of rows.
 *
 * Tokens, and all three timestamps, are copied exactly. A link already sent
 * by SMS has to keep working, and "registered on" must not become the day of
 * the move. That is why this writes raw SQL rather than going through Prisma,
 * which would stamp updated_at itself.
 */
export async function importRegistrations(options: {
  from: string;
  churchCode: string;
  dryRun: boolean;
  db: PrismaCore;
}): Promise<void> {
  const { db } = options;
  const church = await db.church.findUnique({ where: { code: options.churchCode.toUpperCase() } });
  if (!church) throw new Error(`No church with the code ${options.churchCode}.`);

  const old = new pg.Client({ connectionString: options.from, types: exactTimes });
  await old.connect();

  try {
    const { rows: counts } = await old.query<{ count: string }>(
      'select count(*) as count from registrations',
    );
    console.log(`${counts[0]!.count} rows in the old database.`);

    let after = 0;
    let copied = 0;
    for (;;) {
      const { rows } = await old.query(
        `select id, ${COLUMNS.join(', ')} from registrations where id > $1 order by id limit ${BATCH}`,
        [after],
      );
      if (!rows.length) break;
      after = Number(rows.at(-1)!.id);

      await db.$transaction(async (tx) => {
        for (const row of rows) {
          const values = [church.id, row.id, ...COLUMNS.map((c) => row[c])];
          const placeholders = values.map((_, i) => `$${i + 1}`);
          await tx.$executeRawUnsafe(
            `-- tenant: church_id is $1
             insert into registrations (id, church_id, legacy_id, ${COLUMNS.join(', ')})
             values (gen_random_uuid(), ${placeholders.join(', ')})
             on conflict (token) do update set
               ${COLUMNS.filter((c) => c !== 'token')
                 .map((c) => `${c} = excluded.${c}`)
                 .join(', ')}
             where registrations.updated_at < excluded.updated_at`,
            ...values,
          );
        }
        // Everyone who registered is somebody the church cares for, finished
        // or not; the Members list shows them as "Unknown — +255 622…".
        await tx.$executeRawUnsafe(
          `-- tenant: church_id is $1
           insert into people (id, church_id, registration_id, full_name, gender, age_group, dial, phone, email, updated_at)
           select gen_random_uuid(), r.church_id, r.id, left(r.fullname, 120), left(r.gender, 20),
                  left(r.age, 20), left(r.dial, 6), left(r.phone, 20), left(r.email, 254), now()
           from registrations r
           left join people p on p.registration_id = r.id
           where r.church_id = $1::uuid and p.id is null`,
          church.id,
        );
        copied += rows.length;
        if (options.dryRun) throw new RolledBack();
      });
    }

    await report(old, db, church.id, church.code);
    console.log(`${copied} rows read.`);
  } catch (err) {
    if (!(err instanceof RolledBack)) throw err;
    console.log('Dry run: everything was rolled back.');
  } finally {
    await old.end();
  }
}

/**
 * Copies rows changed in the new database back to the old one.
 *
 * Only for rolling a cutover back: if the Sunday goes wrong and the form is
 * pointed at its old database again, whatever was registered meanwhile must
 * not be lost.
 */
export async function exportRegistrationsBack(options: {
  to: string;
  churchCode: string;
  since: string;
  db: PrismaCore;
}): Promise<void> {
  const { db } = options;
  const church = await db.church.findUnique({ where: { code: options.churchCode.toUpperCase() } });
  if (!church) throw new Error(`No church with the code ${options.churchCode}.`);

  const target = new pg.Client({ connectionString: options.to, types: exactTimes });
  await target.connect();
  try {
    // Timestamps as text for the same reason as on the way in: Prisma would
    // hand them back as Dates and lose the microseconds.
    const select = COLUMNS.map((c) => (c.endsWith('_at') ? `${c}::text as ${c}` : c)).join(', ');
    const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(
      `-- tenant: church_id is $1
       select ${select} from registrations
       where church_id = $1::uuid and updated_at >= $2::timestamptz
       order by updated_at`,
      church.id,
      options.since,
    );
    for (const row of rows) {
      const values = COLUMNS.map((c) => row[c]);
      await target.query(
        `insert into registrations (${COLUMNS.join(', ')})
         values (${values.map((_, i) => `$${i + 1}`).join(', ')})
         on conflict (token) do update set
           ${COLUMNS.filter((c) => c !== 'token')
             .map((c) => `${c} = excluded.${c}`)
             .join(', ')}
         where registrations.updated_at < excluded.updated_at`,
        values,
      );
    }
    console.log(`${rows.length} rows written back to the old database.`);
  } finally {
    await target.end();
  }
}

/** Both sides, counted and fingerprinted. Exits non-zero if they differ. */
async function report(
  old: pg.Client,
  db: PrismaCore,
  churchId: string,
  code: string,
): Promise<void> {
  const oldCounts = await old.query<{ status: string; count: string }>(
    'select status, count(*)::text as count from registrations group by status order by status',
  );
  // Only the copied rows are compared. Once the form is pointed here, this
  // database also holds registrations of its own, and counting those in would
  // report a difference that is not one.
  const newCounts = await db.$queryRawUnsafe<{ status: string; count: string }[]>(
    `select status, count(*)::text as count from registrations
     where church_id = $1::uuid and legacy_id is not null
     group by status order by status`,
    churchId,
  );
  const [own] = await db.$queryRawUnsafe<{ count: string }[]>(
    `select count(*)::text as count from registrations
     where church_id = $1::uuid and legacy_id is null`,
    churchId,
  );
  // The instant, not its text: the two databases may print a timestamp in
  // different time zones and mean the same moment.
  const fingerprint = `md5(string_agg(token || ':' || extract(epoch from updated_at)::text, ',' order by token))`;
  const oldPrint = await old.query<{ md5: string }>(
    `select ${fingerprint} as md5 from registrations`,
  );
  const newPrint = await db.$queryRawUnsafe<{ md5: string }[]>(
    `select ${fingerprint} as md5
     from registrations where church_id = $1::uuid and legacy_id is not null`,
    churchId,
  );

  console.log('');
  console.log(`  old: ${describe(oldCounts.rows)}`);
  console.log(`  ${code}: ${describe(newCounts)} (copied)`);
  if (Number(own?.count ?? 0) > 0) {
    console.log(`  ${code}: ${own!.count} registered here since the switch, not compared`);
  }
  console.log(`  fingerprint old: ${oldPrint.rows[0]?.md5 ?? '-'}`);
  console.log(`  fingerprint new: ${newPrint[0]?.md5 ?? '-'}`);

  const same = oldPrint.rows[0]?.md5 === newPrint[0]?.md5;
  console.log('');
  console.log(same ? 'Both sides match.' : 'THE TWO SIDES DIFFER — do not cut over.');
  if (!same) process.exitCode = 1;
}

const describe = (rows: { status: string; count: string }[]) =>
  rows.map((r) => `${r.status} ${r.count}`).join(', ') || 'nothing';

/** Thrown to undo a dry run; never escapes this file. */
class RolledBack extends Error {}

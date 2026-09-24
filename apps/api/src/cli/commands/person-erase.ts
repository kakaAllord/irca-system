import pg from 'pg';
import type { PrismaDb } from '../../core/database/prisma-clients.js';

/* eslint-disable no-console -- a command-line tool reports to its terminal */

export type EraseResult = {
  personId: string;
  registrationErased: boolean;
  notes: number;
  stageEvents: number;
  applications: number;
  enrollments: number;
  attendance: number;
  /** The departments they led or belonged to, ended or not. */
  departments: number;
  summariesRewritten: number;
  detailsCleared: number;
};

/**
 * Erases one person, for an erasure request.
 *
 * Tanzania's Personal Data Protection Act gives people the right to have
 * their data removed, and a church that cannot honour one is not compliant
 * however good the rest of the system is. This is that button, deliberately
 * kept off the portal: it is not a mistake anyone should be able to make with
 * a mis-click, and it cannot be undone.
 *
 * What goes: the person, their registration and its answers (prayer requests
 * included), their notes, their moves along the journey, their application to
 * join, their class enrolment and attendance, and the departments they led or
 * belonged to (their account, if they had one, stays and loses its link).
 *
 * What stays: the activity log's shape. Lines are kept, because the log is
 * what proves who did what, but the person's name is replaced with "[erased]"
 * wherever it was written into a summary, and the before/after of their own
 * records is dropped. Finance entries are untouched: they are money, they
 * name no visitor, and the law does not ask for them.
 *
 * It runs as the database owner, on DIRECT_DATABASE_URL, because the running
 * API is refused update and delete on the activity log — that refusal is a
 * guarantee worth keeping, and erasure is the one act that steps around it,
 * out of band and by hand.
 */
export async function erasePerson(options: {
  personId: string;
  dryRun: boolean;
  db: PrismaDb;
  ownerUrl: string;
  /** Asked before anything is deleted; must answer with the person's id. */
  confirm?: (person: { fullName: string; phone: string }) => Promise<string>;
}): Promise<EraseResult> {
  const { db } = options;
  const church = await db.church.findFirstOrThrow();
  if (!/^[0-9a-f-]{36}$/i.test(options.personId)) throw new Error('That is not a person id.');

  const person = await db.person.findFirst({
    where: { id: options.personId },
  });
  if (!person) throw new Error(`No person ${options.personId} in ${church.code}.`);

  if (options.confirm) {
    const answer = await options.confirm({
      fullName: person.fullName,
      phone: `${person.dial}${person.phone}`,
    });
    if (answer.trim() !== person.id) throw new Error('Not erased: the id did not match.');
  }

  const owner = new pg.Client({ connectionString: options.ownerUrl });
  await owner.connect();
  try {
    await owner.query('begin');
    const count = async (sql: string, params: unknown[]) =>
      (await owner.query(sql, params)).rowCount ?? 0;

    // Counted before they go, so the report says what was actually erased.
    const before = {
      notes: await count('select 1 from person_notes where person_id = $1', [person.id]),
      stageEvents: await count('select 1 from person_stage_events where person_id = $1', [
        person.id,
      ]),
      applications: await count('select 1 from membership_applications where person_id = $1', [
        person.id,
      ]),
      enrollments: await count('select 1 from foundation_enrollments where person_id = $1', [
        person.id,
      ]),
      attendance: await count(
        `select 1 from foundation_attendance a
         join foundation_enrollments e on e.id = a.enrollment_id
         where e.person_id = $1`,
        [person.id],
      ),
      departments:
        (await count('select 1 from department_leaders where person_id = $1', [person.id])) +
        (await count('select 1 from department_members where person_id = $1', [person.id])),
    };

    // The person goes first; everything that hangs off them follows by cascade.
    await count('delete from people where id = $1', [person.id]);
    const registrationErased = person.registrationId
      ? (await count('delete from registrations where id = $1', [person.registrationId])) > 0
      : false;

    // The log keeps its lines; the name in them does not.
    const summariesRewritten = person.fullName.trim()
      ? await count(
          `update audit_events set summary = replace(summary, $1, '[erased]')
           where summary like '%' || $1 || '%'`,
          [person.fullName],
        )
      : 0;
    const detailsCleared = await count(
      `update audit_events set before = null, after = null, meta = null
       where entity_type in ('person', 'registration')
         and entity_id = any($1::text[])
         and (before is not null or after is not null or meta is not null)`,
      [[person.id, person.registrationId].filter(Boolean)],
    );

    // That it happened is itself a record, and it names nobody.
    await owner.query(
      `insert into audit_events (id, source, action, entity_type, entity_id, summary)
       values (gen_random_uuid(), 'feature', 'person.erased', 'person', $1,
               'Erased everything about one person, at their request')`,
      [person.id],
    );

    await owner.query(options.dryRun ? 'rollback' : 'commit');
    return {
      personId: person.id,
      registrationErased,
      ...before,
      summariesRewritten,
      detailsCleared,
    };
  } catch (err) {
    await owner.query('rollback');
    throw err;
  } finally {
    await owner.end();
  }
}

/** Prints the result the way the person running it needs to read it. */
export function reportErasure(result: EraseResult, dryRun: boolean): void {
  console.log('');
  console.log(`  person                ${result.personId}`);
  console.log(`  registration          ${result.registrationErased ? 'erased' : 'none'}`);
  console.log(`  notes                 ${result.notes}`);
  console.log(`  journey events        ${result.stageEvents}`);
  console.log(`  applications          ${result.applications}`);
  console.log(`  class enrolments      ${result.enrollments}`);
  console.log(`  attendance marks      ${result.attendance}`);
  console.log(`  departments           ${result.departments}`);
  console.log(`  log lines rewritten   ${result.summariesRewritten}`);
  console.log(`  log details cleared   ${result.detailsCleared}`);
  console.log('');
  console.log(dryRun ? 'Dry run: nothing was changed.' : 'Done. This cannot be undone.');
}

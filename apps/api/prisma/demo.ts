/* eslint-disable no-console -- a script reports to its terminal */
// Eighteen months of plausible history, so the dashboards, charts and trend
// lines can be looked at rather than imagined.
//
// The seed (`seed.ts`) stays small and exact: the browser tests count its rows.
// This script is the opposite — a lot of rows, none of them asserted on — and
// runs separately:
//
//     npm run db:reset && npm run db:seed && npm run db:demo
//
// Everything it writes comes from one fixed random seed, so two people running
// it see the same church, and a screenshot keeps meaning what it meant.
import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { formatTransactionCode, sequenceKey, type FinanceKind } from '@irca/shared';
import { PrismaClient } from '../src/generated/prisma/client.js';

config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env', quiet: true });

const env = process.env.NODE_ENV;
if (env !== 'development' && env !== 'test') {
  console.error(`Refusing to write demo data with NODE_ENV=${env ?? '(unset)'}.`);
  process.exit(1);
}

const MONTHS = Number(process.argv.find((a) => a.startsWith('--months='))?.slice(9) ?? 18);

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DIRECT_DATABASE_URL! }),
});

// ---------------------------------------------------------------------------
// Dice that always fall the same way.
// ---------------------------------------------------------------------------

/** mulberry32: small, fast, and identical on every machine. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260923);

const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
const chance = (p: number) => rand() < p;
/** A few of a list, without repeats. */
function some<T>(xs: readonly T[], min: number, max: number): T[] {
  const pool = [...xs];
  const out: T[] = [];
  for (let n = int(min, max); n > 0 && pool.length; n--)
    out.push(pool.splice(int(0, pool.length - 1), 1)[0]!);
  return out;
}

/** uuid v7, so rows generated in date order also sort that way by id. */
let lastMs = 0;
let counter = 0;
function uuid7(at: Date): string {
  const ms = at.getTime();
  if (ms === lastMs) counter++;
  else {
    lastMs = ms;
    counter = 0;
  }
  const hex = ms.toString(16).padStart(12, '0');
  const r = () => Math.floor(rand() * 16).toString(16);
  const seq = counter.toString(16).padStart(3, '0').slice(-3);
  const tail = Array.from({ length: 12 }, r).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${seq}-${(8 + Math.floor(rand() * 4)).toString(16) + r() + r() + r()}-${tail}`;
}

// ---------------------------------------------------------------------------
// Dates. The window ends today and runs back MONTHS months.
// ---------------------------------------------------------------------------

const today = new Date();
today.setUTCHours(0, 0, 0, 0);
const start = new Date(today);
start.setUTCMonth(start.getUTCMonth() - MONTHS);

const dayMs = 86_400_000;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * dayMs);
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const atHour = (d: Date, h: number, m = int(0, 59)) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m, int(0, 59)));

/** Every date in the window on which `weekday` falls (0 = Sunday). */
function weekdays(weekday: number): Date[] {
  const out: Date[] = [];
  const d = new Date(start);
  while (d.getUTCDay() !== weekday) d.setUTCDate(d.getUTCDate() + 1);
  for (; d <= today; d.setUTCDate(d.getUTCDate() + 7)) out.push(new Date(d));
  return out;
}

const allDays: Date[] = [];
for (let d = new Date(start); d <= today; d = addDays(d, 1)) allDays.push(new Date(d));

const sundays = weekdays(0);

// ---------------------------------------------------------------------------
// Arusha-flavoured name and place pools.
// ---------------------------------------------------------------------------

const FIRST_F = [
  'Neema',
  'Grace',
  'Joyce',
  'Upendo',
  'Happiness',
  'Rehema',
  'Anna',
  'Esther',
  'Mary',
  'Zawadi',
  'Glory',
  'Sarah',
  'Lucy',
  'Editha',
  'Prisca',
  'Devotha',
  'Sophia',
  'Jackline',
  'Asha',
  'Tumaini',
  'Hawa',
  'Frida',
  'Salome',
  'Christina',
  'Elizabeth',
  'Doreen',
  'Agnes',
  'Beatrice',
  'Consolata',
  'Gladness',
];
const FIRST_M = [
  'Emmanuel',
  'Daniel',
  'Peter',
  'John',
  'Baraka',
  'Elia',
  'Joseph',
  'Samuel',
  'Godfrey',
  'Frank',
  'Nelson',
  'Isaya',
  'Amani',
  'Nathan',
  'Thomas',
  'Method',
  'Erick',
  'Gideon',
  'Julius',
  'Wilson',
  'Moses',
  'Alfred',
  'Bariki',
  'Deogratias',
  'Ibrahim',
  'Michael',
  'Hosea',
  'Philemon',
  'Lazaro',
  'Onesmo',
];
const SURNAMES = [
  'Mollel',
  'Laizer',
  'Kimaro',
  'Massawe',
  'Shirima',
  'Mushi',
  'Urassa',
  'Nnko',
  'Swai',
  'Temba',
  'Lyimo',
  'Meena',
  'Sanka',
  'Ndosi',
  'Kileo',
  'Mbise',
  'Munisi',
  'Saitoti',
  'Olotu',
  'Kivuyo',
  'Marealle',
  'Macha',
  'Mtei',
  'Nkya',
  'Ngowi',
  'Kessy',
  'Chuwa',
  'Minja',
  'Moshi',
  'Pallangyo',
];

const WARDS = [
  'Sombetini',
  'Kaloleni',
  'Levolosi',
  'Sekei',
  'Themi',
  'Unga Limited',
  'Ngarenaro',
  'Daraja Mbili',
  'Elerai',
  'Moshono',
  'Olasiti',
  'Kimandolu',
  'Lemara',
  'Terrat',
  'Sanawari',
];
const AGE_GROUPS = ['under_18', '18_24', '25_34', '35_44', '45_54', '55_plus'];
const HEARD = ['friend', 'social_media', 'radio', 'walked_past', 'crusade', 'family'];
const VISIT = ['worship', 'prayer', 'first_time', 'invited', 'visiting_arusha'];
const INTEREST = ['membership', 'baptism', 'bible_study', 'choir', 'youth', 'counselling'];
const MINISTRIES = ['choir', 'ushering', 'media', 'children', 'intercession', 'outreach'];
const LANGS = ['en', 'en', 'en', 'sw', 'sw', 'sw', 'sw', 'fr'];

const fullName = (gender: string) =>
  `${pick(gender === 'female' ? FIRST_F : FIRST_M)} ${pick(SURNAMES)}`;

const phone = () => `7${int(0, 8)}${String(int(0, 9_999_999)).padStart(7, '0')}`;

// ---------------------------------------------------------------------------
// Who is doing all this.
// ---------------------------------------------------------------------------

const STAFF_NAMES = ['admin', 'pastor', 'office', 'followup', 'clerk', 'mhazini', 'dev'] as const;
type Staff = Record<(typeof STAFF_NAMES)[number], string>;

async function staffOf(): Promise<Staff> {
  const emails = STAFF_NAMES.map((n) => `${n}@irca.local`);
  const rows = await db.user.findMany({
    where: { email: { in: emails } },
    select: { id: true, email: true },
  });
  const by = new Map(rows.map((r) => [r.email.split('@')[0], r.id]));
  const missing = STAFF_NAMES.filter((n) => !by.has(n));
  if (missing.length) {
    console.error(`Missing accounts: ${missing.join(', ')}. Run npm run db:seed first.`);
    process.exit(1);
  }
  return Object.fromEntries(STAFF_NAMES.map((n) => [n, by.get(n)!])) as Staff;
}

// ---------------------------------------------------------------------------
// The work.
// ---------------------------------------------------------------------------

const audit: Record<string, unknown>[] = [];
const usage = new Map<string, bigint>();

/** One line in the activity log. */
function logged(
  at: Date,
  actorUserId: string,
  action: string,
  entityType: string,
  entityId: string,
  summary: string,
) {
  audit.push({
    id: uuid7(at),
    source: 'feature',
    actorUserId,
    action,
    entityType,
    entityId,
    summary,
    createdAt: at,
    ip: `41.${int(50, 90)}.${int(0, 255)}.${int(1, 254)}`,
    requestId: uuid7(at).slice(0, 32),
  });
  count(at, 'audit.events');
}

function count(at: Date, metric: string, by = 1) {
  const key = `${ymd(at)}|${metric}`;
  usage.set(key, (usage.get(key) ?? 0n) + BigInt(by));
}

function gauge(at: Date, metric: string, value: number) {
  usage.set(`${ymd(at)}|${metric}`, BigInt(Math.max(0, Math.round(value))));
}

async function writeHistory(staff: Staff) {
  const church = await db.church.findFirstOrThrow();
  const code = church.code;
  const currency = church.currency;
  const scale = 1;

  // -- registrations and the people behind them -----------------------------

  type Made = { id: string; name: string; at: Date; stage: string; lang: string; gender: string };
  const people: Made[] = [];
  const registrations: unknown[] = [];
  const peopleRows: unknown[] = [];
  const stageEvents: unknown[] = [];

  const STAGES = [
    'VISITOR',
    'NEW_CONVERT',
    'FOUNDATION_CLASS',
    'AWAITING_BAPTISM',
    'MEMBERSHIP_REVIEW',
    'CONFIRMED_MEMBER',
  ] as const;

  for (const sunday of sundays) {
    // Attendance grows slowly over the window, and Easter-ish months spike.
    const age = (sunday.getTime() - start.getTime()) / (today.getTime() - start.getTime());
    const base = Math.round((6 + age * 8) * scale);
    for (let i = 0; i < int(Math.max(1, base - 3), base + 4); i++) {
      const at = atHour(sunday, int(9, 17));
      const gender = chance(0.56) ? 'female' : 'male';
      const name = fullName(gender);
      const lang = pick(LANGS);
      const submitted = chance(0.82);
      const regId = uuid7(at);
      const membershipPath = submitted && chance(0.4);

      registrations.push({
        id: regId,
        token: uuid7(at).replace(/-/g, '').slice(0, 32),
        lang,
        status: submitted ? 'submitted' : 'in_progress',
        currentStep: submitted
          ? null
          : pick(['about-you', 'where-you-live', 'contact', 'walk-with-god']),
        furthestStep: submitted ? 'done' : pick(['about-you', 'where-you-live', 'contact']),
        heard: some(HEARD, 1, 2),
        fullname: name,
        gender,
        age: pick(AGE_GROUPS),
        visit: some(VISIT, 1, 3),
        whereAt: 'resident',
        ward: pick(WARDS),
        region: 'Arusha',
        country: 'Tanzania',
        stay: chance(0.8) ? 'permanent' : 'visiting',
        often: pick(['every_week', 'sometimes', 'first_time']),
        dialCc: 'TZ',
        dial: '+255',
        phone: phone(),
        email: chance(0.35) ? `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com` : '',
        occ: pick(['working', 'studying', 'both', '']),
        interest: some(INTEREST, 0, 3),
        saved: membershipPath ? chance(0.85) : null,
        bapt: membershipPath ? chance(0.6) : null,
        marital: membershipPath ? pick(['single', 'married', 'widowed']) : '',
        ministries: membershipPath ? some(MINISTRIES, 0, 2) : [],
        liked: chance(0.3)
          ? pick([
              'The worship was wonderful.',
              'I felt at home.',
              'The preaching was clear.',
              'Everyone was welcoming.',
            ])
          : '',
        wantMore: membershipPath ? true : submitted ? false : null,
        prayer: chance(0.25)
          ? pick([
              'Please pray for my family.',
              'Pray for my studies.',
              'Pray for healing for my mother.',
              'Pray for work.',
            ])
          : '',
        createdAt: at,
        updatedAt: at,
        submittedAt: submitted ? new Date(at.getTime() + int(4, 40) * 60_000) : null,
      });

      count(at, 'registrations.started');
      if (submitted) count(at, 'registrations.submitted');
      if (!submitted) continue;

      // How far along the journey they got depends on how long ago they came.
      const monthsSince = (today.getTime() - at.getTime()) / (30 * dayMs);
      const reach = Math.min(STAGES.length - 1, Math.floor(rand() * (1 + monthsSince / 2.2)));
      const stage = STAGES[reach]!;
      const pid = uuid7(at);

      peopleRows.push({
        id: pid,
        registrationId: regId,
        fullName: name,
        gender,
        ageGroup: pick(AGE_GROUPS),
        dial: '+255',
        phone: phone(),
        email: '',
        stage,
        saved: reach >= 1 ? true : null,
        baptised: reach >= 3 ? chance(0.7) : null,
        createdAt: at,
        updatedAt: at,
      });
      people.push({ id: pid, name, at, stage, lang, gender });

      // One event per step taken, spread out over the weeks that followed.
      let when = at;
      for (let s = 1; s <= reach; s++) {
        when = addDays(when, int(10, 45));
        if (when > today) break;
        stageEvents.push({
          id: uuid7(when),
          personId: pid,
          fromStage: STAGES[s - 1],
          toStage: STAGES[s],
          byId: pick([staff.pastor, staff.office, staff.followup]),
          at: when,
        });
      }
    }
  }

  await db.registration.createMany({ data: registrations as never });
  await db.person.createMany({ data: peopleRows as never });
  await db.personStageEvent.createMany({ data: stageEvents as never });
  console.log(`  ${code}: ${registrations.length} registrations, ${people.length} people`);

  // -- what the follow-up team wrote ----------------------------------------

  const notes: unknown[] = [];
  for (const p of people) {
    if (!chance(0.45)) continue;
    for (let n = int(1, 4); n > 0; n--) {
      const at = addDays(p.at, int(2, 120));
      if (at > today) continue;
      const kind = pick(['CALL', 'VISIT', 'NOTE'] as const);
      notes.push({
        id: uuid7(at),
        personId: p.id,
        kind,
        body: pick(
          {
            CALL: [
              'Called. Said she will come on Sunday.',
              'Phone off, will try again.',
              'Spoke briefly, asked for prayer.',
              'Happy to hear from the church.',
            ],
            VISIT: [
              'Visited at home, met her husband.',
              'Not at home, left a message with a neighbour.',
              'Prayed with the family.',
              'Home visit, shared about the foundation class.',
            ],
            NOTE: [
              'Asked about the choir.',
              'Works night shifts, Sundays are hard.',
              'Moving to Moshi next month.',
              'Interested in baptism.',
            ],
          }[kind],
        ),
        authorId: pick([staff.followup, staff.office]),
        createdAt: at,
      });
    }
  }
  await db.personNote.createMany({ data: notes as never });

  // -- applications, and the members they made ------------------------------

  const applications: unknown[] = [];
  const confirmed: { id: string; at: Date }[] = [];
  for (const p of people) {
    const reach = STAGES.indexOf(p.stage as (typeof STAGES)[number]);
    if (reach < 4) continue;
    const submittedAt = addDays(p.at, int(40, 150));
    if (submittedAt > today) continue;
    const decidedAt = addDays(submittedAt, int(3, 21));
    const isConfirmed = p.stage === 'CONFIRMED_MEMBER';
    const status = isConfirmed
      ? 'CONFIRMED'
      : decidedAt > today
        ? 'UNDER_REVIEW'
        : pick(['APPROVED', 'APPROVED', 'UNDER_REVIEW', 'REJECTED', 'WITHDRAWN'] as const);
    const confirmedAt = isConfirmed ? addDays(decidedAt, int(30, 60)) : null;

    applications.push({
      id: uuid7(submittedAt),
      personId: p.id,
      status,
      source: chance(0.7) ? 'FORM' : 'OFFICE',
      submittedAt,
      submittedById: chance(0.7) ? null : staff.office,
      decidedById: status === 'UNDER_REVIEW' ? null : staff.pastor,
      decidedAt: status === 'UNDER_REVIEW' ? null : decidedAt,
      rejectReason:
        status === 'REJECTED'
          ? pick(['Still attending elsewhere.', 'Asked to wait until after the class.'])
          : null,
      confirmedById: confirmedAt && confirmedAt <= today ? staff.pastor : null,
      confirmedAt: confirmedAt && confirmedAt <= today ? confirmedAt : null,
    });
    count(submittedAt, 'membership.applications.submitted');
    if (confirmedAt && confirmedAt <= today) {
      confirmed.push({ id: p.id, at: confirmedAt });
      count(confirmedAt, 'membership.members.confirmed');
      logged(
        confirmedAt,
        staff.pastor,
        'membership.application.confirmed',
        'person',
        p.id,
        `Confirmed ${p.name} as a member`,
      );
    }
  }
  await db.membershipApplication.createMany({ data: applications as never });

  // Member numbers are given out in the order people were confirmed.
  confirmed.sort((a, b) => a.at.getTime() - b.at.getTime());
  const highest = await db.person.aggregate({ where: {}, _max: { memberNumber: true } });
  let memberNumber = highest._max.memberNumber ?? 0;
  for (const c of confirmed) {
    memberNumber++;
    await db.person.update({
      where: { id: c.id },
      data: { memberNumber, confirmedAt: c.at },
    });
  }
  if (confirmed.length) {
    await db.sequence.upsert({
      where: { key: 'membership:member_number' },
      update: { lastValue: memberNumber },
      create: { key: 'membership:member_number', lastValue: memberNumber },
    });
  }
  console.log(
    `  ${code}: ${applications.length} applications, ${confirmed.length} confirmed members`,
  );

  // -- the foundation class -------------------------------------------------

  const groupNames = ['Thursday group', 'Saturday group', 'Sunday afternoon group', 'Youth group'];
  const groups: { id: string; name: string }[] = [];
  for (const name of groupNames.slice(0, scale > 0.5 ? 4 : 2)) {
    const row = await db.foundationGroup.upsert({
      where: { name },
      update: {},
      create: { id: uuid7(start), name },
    });
    groups.push({ id: row.id, name });
  }

  const enrollments: unknown[] = [];
  const attendance: unknown[] = [];
  for (const p of people) {
    const reach = STAGES.indexOf(p.stage as (typeof STAGES)[number]);
    if (reach < 2) continue;
    const enrolledAt = addDays(p.at, int(14, 60));
    if (enrolledAt > today) continue;
    const eid = uuid7(enrolledAt);
    const finished = reach > 2 || chance(0.3);
    const dropped = !finished && chance(0.15);
    const sessionsDone = finished ? 6 : dropped ? int(1, 3) : int(1, 5);

    enrollments.push({
      id: eid,
      personId: p.id,
      groupId: pick(groups).id,
      enrolledAt,
      completedAt: finished ? addDays(enrolledAt, 42) : null,
      droppedAt: dropped ? addDays(enrolledAt, sessionsDone * 7) : null,
    });

    for (let s = 1; s <= sessionsDone; s++) {
      const markedAt = addDays(enrolledAt, s * 7);
      if (markedAt > today) break;
      attendance.push({
        enrollmentId: eid,
        sessionNo: s,
        mark: chance(0.86) ? 'ATTENDED' : 'MISSED',
        markedById: pick([staff.office, staff.followup]),
        markedAt,
      });
      count(markedAt, 'membership.attendance.marked');
    }
  }
  await db.foundationEnrollment.createMany({ data: enrollments as never });
  await db.foundationAttendance.createMany({ data: attendance as never });
  console.log(`  ${code}: ${enrollments.length} class sign-ups, ${attendance.length} marks`);

  // -- the books ------------------------------------------------------------

  const INCOME = [
    ['Tithe', 'The tenth, given weekly and monthly.'],
    ['Sunday offering', 'The collection at the Sunday services.'],
    ['Thanksgiving', 'Given in thanks for an answered prayer.'],
    ['Harambee', 'Raised together for a named need.'],
    ['Building fund', 'Towards the new sanctuary.'],
    ['Missions offering', 'For the work outside Arusha.'],
    ['Special seed', 'Given during a conference or crusade.'],
  ] as const;
  const EXPENSE = [
    ['Electricity bill', 'TANESCO, monthly.'],
    ['Water bill', 'AUWSA, monthly.'],
    ['Generator fuel', 'Diesel for the standby generator.'],
    ['Rent', 'The hall and the office.'],
    ['Sound equipment', 'Repairs and replacements.'],
    ['Transport', 'Fuel and fares for church errands.'],
    ['Guest hospitality', 'Visiting preachers and their travel.'],
    ['Stationery', 'Office paper, printing, registers.'],
    ['Cleaning', 'Materials and the cleaner’s allowance.'],
    ['Staff allowance', 'Monthly allowances for the pastoral team.'],
    ['Repairs and maintenance', 'The building and its fittings.'],
    ['Internet and airtime', 'Office internet and the church line.'],
    ['Children’s ministry', 'Materials for Sunday school.'],
    ['Charity and benevolence', 'Help given to members in need.'],
  ] as const;

  const key = (n: string) => n.toLowerCase().replace(/\s+/g, ' ').trim();
  const incomeIds: Record<string, string> = {};
  const expenseIds: Record<string, string> = {};

  for (const [name, description] of INCOME) {
    const row = await db.financeIncomeSource.upsert({
      where: { nameKey: key(name) },
      update: {},
      create: {
        id: uuid7(start),
        name,
        nameKey: key(name),
        description,
        createdById: staff.mhazini,
        createdAt: start,
      },
    });
    incomeIds[name] = row.id;
  }
  for (const [name, description] of EXPENSE) {
    const row = await db.financeExpenseItem.upsert({
      where: { nameKey: key(name) },
      update: {},
      create: {
        id: uuid7(start),
        name,
        nameKey: key(name),
        description,
        createdById: staff.mhazini,
        createdAt: start,
      },
    });
    expenseIds[name] = row.id;
  }

  // Entry numbers continue from what the church has already used, so this can
  // be run over a database somebody has been clicking around in.
  const seqs = new Map<string, number>();
  for (const row of await db.sequence.findMany({ where: { key: { startsWith: 'finance:' } } })) {
    seqs.set(row.key, row.lastValue);
  }
  for (const row of await db.financeTransaction.groupBy({
    by: ['kind', 'periodYear', 'periodMonth'],
    where: {},
    _max: { seq: true },
  })) {
    const k = sequenceKey(row.kind, row.periodYear, row.periodMonth);
    seqs.set(k, Math.max(seqs.get(k) ?? 0, row._max.seq ?? 0));
  }
  const txns: unknown[] = [];
  const posted: { id: string; code: string; at: Date; amount: string; label: string }[] = [];

  function entry(
    kind: FinanceKind,
    date: Date,
    amount: number,
    opts: {
      source?: string;
      item?: string;
      method?: string;
      counterparty?: string;
      notes?: string;
      reference?: string;
    },
  ) {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const sk = sequenceKey(kind, year, month);
    const seq = (seqs.get(sk) ?? 0) + 1;
    seqs.set(sk, seq);
    const txCode = formatTransactionCode({ churchCode: code, kind, year, month, seq });
    const at = atHour(date, int(9, 19));
    const id = uuid7(at);
    const value = amount.toFixed(2);

    txns.push({
      id,
      code: txCode,
      kind,
      status: 'POSTED',
      txnDate: new Date(`${ymd(date)}T00:00:00Z`),
      periodYear: year,
      periodMonth: month,
      seq,
      amount: value,
      currency,
      incomeSourceId: opts.source ? incomeIds[opts.source] : null,
      expenseItemId: opts.item ? expenseIds[opts.item] : null,
      method:
        opts.method ??
        pick(['CASH', 'CASH', 'MOBILE_MONEY', 'MOBILE_MONEY', 'BANK_TRANSFER', 'CHEQUE']),
      reference:
        opts.reference ??
        (chance(0.5) ? `${pick(['MP', 'RC', 'CH'])}${int(10_000_000, 99_999_999)}` : null),
      counterparty: opts.counterparty ?? null,
      notes: opts.notes ?? null,
      clientRequestId: uuid7(at),
      createdById: pick([staff.clerk, staff.clerk, staff.mhazini]),
      createdAt: at,
      updatedAt: at,
    });
    posted.push({ id, code: txCode, at, amount: value, label: opts.source ?? opts.item ?? txCode });
    count(at, 'finance.transactions.created');
    return { id, code: txCode, at };
  }

  // Sunday collections, week after week.
  for (const sunday of sundays) {
    const age = (sunday.getTime() - start.getTime()) / (today.getTime() - start.getTime());
    const growth = 1 + age * 0.45;
    entry('INCOME', sunday, Math.round((int(380_000, 760_000) * growth) / 1000) * 1000, {
      source: 'Sunday offering',
      method: 'CASH',
      counterparty: 'Sunday service',
    });
    for (let t = int(3, 9) * (scale > 0.5 ? 1 : 0) + 1; t > 0; t--) {
      entry('INCOME', sunday, Math.round((int(20_000, 300_000) * growth) / 1000) * 1000, {
        source: 'Tithe',
        counterparty: fullName(chance(0.5) ? 'female' : 'male'),
      });
    }
    if (chance(0.45))
      entry('INCOME', sunday, int(15_000, 120_000), {
        source: 'Thanksgiving',
        counterparty: fullName(chance(0.6) ? 'female' : 'male'),
      });
    if (chance(0.2))
      entry('INCOME', sunday, int(50_000, 600_000), {
        source: 'Building fund',
        counterparty: 'Building committee',
      });
    if (chance(0.12))
      entry('INCOME', sunday, int(40_000, 250_000), {
        source: 'Missions offering',
        counterparty: 'Missions Sunday',
      });
    if (chance(0.08))
      entry('INCOME', sunday, int(200_000, 1_400_000), {
        source: 'Harambee',
        counterparty: pick(['Roofing harambee', 'Youth camp harambee', 'Chairs harambee']),
      });
  }

  // The bills, once a month, and the odd repair.
  for (let d = new Date(start); d <= today; d.setUTCMonth(d.getUTCMonth() + 1)) {
    const month = new Date(d);
    const billDay = (n: number) => {
      const x = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), n));
      return x > today ? null : x;
    };
    const fixed: [string, number, number, number][] = [
      ['Electricity bill', 5, 180_000, 420_000],
      ['Water bill', 7, 45_000, 110_000],
      ['Rent', 3, 600_000, 600_000],
      ['Staff allowance', 28, 900_000, 1_400_000],
      ['Internet and airtime', 12, 60_000, 95_000],
      ['Cleaning', 25, 80_000, 140_000],
    ];
    for (const [item, day, lo, hi] of fixed) {
      const on = billDay(day);
      if (on)
        entry('EXPENSE', on, int(lo, hi), {
          item,
          method: pick(['BANK_TRANSFER', 'MOBILE_MONEY', 'CASH']),
          counterparty: item === 'Rent' ? 'Kilombero Properties' : undefined,
        });
    }
    for (let n = int(2, 7); n > 0; n--) {
      const on = billDay(int(1, 28));
      if (!on) continue;
      const item = pick([
        'Generator fuel',
        'Sound equipment',
        'Transport',
        'Guest hospitality',
        'Stationery',
        'Repairs and maintenance',
        'Children’s ministry',
        'Charity and benevolence',
      ]);
      entry('EXPENSE', on, int(25_000, 480_000), { item });
    }
  }

  await db.financeTransaction.createMany({ data: txns as never });
  for (const [k, v] of seqs) {
    await db.sequence.upsert({
      where: { key: k },
      update: { lastValue: v },
      create: { key: k, lastValue: v },
    });
  }
  console.log(`  ${code}: ${txns.length} finance entries`);

  // -- a handful voided, and change requests in every state -----------------

  const requests: unknown[] = [];
  for (const t of some(posted, 6, 10)) {
    const askedAt = addDays(t.at, int(1, 20));
    if (askedAt > today) continue;
    const decidedAt = addDays(askedAt, int(1, 6));
    const settled = decidedAt <= today;
    const approved = settled && chance(0.6);
    requests.push({
      id: uuid7(askedAt),
      moduleKey: 'finance',
      entityType: 'finance_transaction',
      entityId: t.id,
      entityLabel: t.code,
      action: chance(0.35) ? 'VOID' : 'UPDATE',
      before: { amount: t.amount },
      proposed: { amount: (Number(t.amount) + int(-40_000, 40_000)).toFixed(2) },
      reason: pick([
        'The receipt says a different figure.',
        'Recorded against the wrong item.',
        'Entered twice by mistake.',
        'The date was keyed wrongly.',
      ]),
      status: !settled ? 'PENDING' : approved ? 'APPROVED' : 'REJECTED',
      requestedById: staff.clerk,
      requestedAt: askedAt,
      decidedById: settled ? staff.mhazini : null,
      decidedAt: settled ? decidedAt : null,
      decisionNote: settled && !approved ? 'Bring the receipt and ask again.' : null,
      appliedAt: approved ? decidedAt : null,
    });
    count(askedAt, 'change_requests.created');
    if (settled)
      count(decidedAt, approved ? 'change_requests.applied' : 'change_requests.rejected');
  }
  await db.changeRequest.createMany({ data: requests as never });

  // -- the activity log, and the numbers the dev console draws --------------

  for (const t of some(posted, 200, 260)) {
    logged(
      t.at,
      staff.clerk,
      'finance.transaction.created',
      'finance_transaction',
      t.id,
      `Recorded ${t.code} for ${t.amount}`,
    );
  }

  /** Route template, share of the day's requests, typical milliseconds. */
  const ROUTES: [string, number, number][] = [
    ['GET /auth/me', 0.32, 9],
    ['GET /membership/people', 0.12, 64],
    ['GET /membership/dashboard', 0.08, 140],
    ['GET /membership/people/:id', 0.08, 38],
    ['GET /finance/transactions', 0.1, 72],
    ['POST /finance/transactions', 0.04, 55],
    ['GET /finance/overview', 0.06, 180],
    ['GET /finance/reports/statement', 0.02, 420],
    ['GET /admin/users', 0.05, 41],
    ['GET /admin/audit', 0.04, 96],
    ['GET /admin/requests', 0.05, 33],
    ['POST /public/registrations', 0.04, 48],
  ];
  const activity: unknown[] = [];
  const signInUsers = [
    staff.admin,
    staff.pastor,
    staff.office,
    staff.followup,
    staff.clerk,
    staff.mhazini,
  ];
  for (const day of allDays) {
    const dow = day.getUTCDay();
    const busy = dow === 0 ? 1.8 : dow === 6 ? 0.5 : 1;
    const working = dow === 0 || (dow >= 1 && dow <= 5);
    if (!working) continue;

    const requestsToday = Math.round(int(140, 520) * busy * scale);
    count(day, 'api.requests', requestsToday);
    count(day, 'api.errors.4xx', int(0, Math.max(1, Math.round(requestsToday * 0.03))));
    count(day, 'api.errors.403', int(0, 4));
    count(day, 'api.errors.5xx', chance(0.08) ? int(1, 3) : 0);
    count(day, 'api.throttled', chance(0.1) ? int(1, 6) : 0);
    usage.set(`${ymd(day)}|api.latency_ms.max`, BigInt(int(300, 2400)));
    // The day's requests shared out over the routes people actually use, each
    // with its own typical time, so the API tab has busy and slow ones to show.
    let spent = 0;
    for (const [route, share, ms] of ROUTES) {
      const calls = Math.round(requestsToday * share);
      const time = calls * int(Math.round(ms * 0.7), Math.round(ms * 1.4));
      spent += time;
      count(day, `api.route.${route}`, calls);
      count(day, `api.route_ms.${route}`, time);
      count(day, `api.requests.${route.split('/')[1]}`, calls);
    }
    count(day, 'api.latency_ms.sum', spent);

    const signedIn = some(signInUsers, 2, 6);
    count(day, 'auth.logins', signedIn.length);
    count(day, 'auth.sessions_created', signedIn.length);
    if (chance(0.25)) count(day, 'auth.login_failures', int(1, 4));
    if (chance(0.04)) count(day, 'auth.lockouts', 1);
    if (chance(0.05)) count(day, 'auth.password_resets', 1);
    gauge(day, 'auth.sessions.active', signedIn.length + int(0, 3));

    for (const userId of signedIn) {
      activity.push({
        userId,
        day: new Date(`${ymd(day)}T00:00:00Z`),
        requests: Math.round(requestsToday / signedIn.length),
      });
    }

    if (chance(0.15)) count(day, 'admin.invitations.sent', 1);
    if (chance(0.1)) count(day, 'admin.role_changes', int(1, 2));
    if (chance(0.3)) count(day, 'email.sent', int(1, 9));
    if (chance(0.05)) count(day, 'email.failed', 1);
    if (chance(0.06)) count(day, 'impersonation.started', 1);
    if (chance(0.06)) count(day, 'impersonation.views', int(2, 14));
    if (chance(0.06)) count(day, 'impersonation.minutes', int(2, 25));
    if (chance(0.12)) count(day, 'finance.exports', 1);
    if (chance(0.08)) count(day, 'membership.people.added', int(1, 3));
    if (chance(0.1)) count(day, 'membership.reminders.sent', int(1, 5));

    // Gauges are a snapshot: what was true at the end of that day.
    const peopleSoFar = people.filter((p) => p.at <= day).length;
    const membersSoFar = confirmed.filter((c) => c.at <= day).length;
    const txnsSoFar = posted.filter((t) => t.at <= day).length;
    gauge(day, 'entities.people', peopleSoFar);
    gauge(day, 'entities.members.confirmed', membersSoFar);
    gauge(day, 'entities.finance.transactions', txnsSoFar);
    gauge(day, 'entities.finance.items', INCOME.length + EXPENSE.length);
    gauge(day, 'entities.registrations.submitted', peopleSoFar);
    gauge(day, 'entities.registrations.in_progress', Math.round(peopleSoFar * 0.2));
    gauge(day, 'entities.users.active', signInUsers.length);
    gauge(day, 'entities.modules.enabled', code === 'IRCA' ? 2 : 1);
    gauge(day, 'db.bytes.total', 4_000_000 + peopleSoFar * 5_400 + txnsSoFar * 2_900);
    gauge(
      day,
      'change_requests.pending',
      requests.filter((r) => (r as { status: string }).status === 'PENDING').length,
    );
  }
  await db.userActivityDaily.createMany({ data: activity as never, skipDuplicates: true });
}

// ---------------------------------------------------------------------------

const staff = await staffOf();

// Running this twice would double every chart, so it leaves a mark and refuses
// to run again without being told to. Anything already in the database is kept:
// entry numbers and member numbers carry on from where they had got to.
const AGAIN = process.argv.includes('--again');
const marks = await db.setting.findMany({ where: { key: 'demo.generatedAt' } });
if (marks.length && !AGAIN) {
  const when = (marks[0]!.value as { at?: string }).at ?? 'earlier';
  console.error(
    `Demo history was already written (${when}).\n` +
      `Add --again to write another round on top, or start clean with:\n` +
      `  npm run db:reset && npm run db:seed && npm run db:demo`,
  );
  process.exit(1);
}

console.log(`Writing ${MONTHS} months of demo history, ${ymd(start)} to ${ymd(today)}.`);
await writeHistory(staff);

const usageRows = [...usage].map(([k, value]) => {
  const [day, metric] = k.split('|');
  return { day: new Date(`${day}T00:00:00Z`), metric: metric!, value };
});
for (let i = 0; i < usageRows.length; i += 5000) {
  await db.usageDaily.createMany({ data: usageRows.slice(i, i + 5000), skipDuplicates: true });
}

for (let i = 0; i < audit.length; i += 5000) {
  await db.auditEvent.createMany({ data: audit.slice(i, i + 5000) as never });
}

// The nightly snapshot's own history, so the jobs page is not empty either.
const jobs: unknown[] = [];
for (const day of allDays) {
  const startedAt = atHour(day, 2, 10);
  const ok = !chance(0.02);
  jobs.push({
    id: uuid7(startedAt),
    job: 'usage:snapshot',
    startedAt,
    finishedAt: new Date(startedAt.getTime() + int(1500, 9000)),
    ok,
    error: ok ? null : 'timed out reading table sizes',
    stats: { people: 1 },
  });
}
await db.jobRun.createMany({ data: jobs as never });

await db.setting.upsert({
  where: { key: 'demo.generatedAt' },
  update: { value: { at: new Date().toISOString() } },
  create: { key: 'demo.generatedAt', value: { at: new Date().toISOString() } },
});

console.log(
  `done: ${usageRows.length} usage rows, ${audit.length} activity lines, ${jobs.length} job runs.`,
);
await db.$disconnect();

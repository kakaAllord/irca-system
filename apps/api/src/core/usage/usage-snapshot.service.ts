import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaDb } from '../database/prisma-clients.js';
import { UsageService } from './usage.service.js';

/** The tables that grow with use, and whose size is worth watching. */
const MEASURED_TABLES = [
  'audit_events',
  'change_requests',
  'email_outbox',
  'finance_expense_items',
  'finance_income_sources',
  'finance_transactions',
  'foundation_attendance',
  'foundation_enrollments',
  'impersonation_sessions',
  'membership_applications',
  'outreach_reached',
  'people',
  'person_interactions',
  'person_notes',
  'person_stage_events',
  'registrations',
  'sessions',
  'usage_daily',
  'user_activity_daily',
];

/** Kept this long after they stop working, for the dev console and support. */
const SESSION_RETENTION_DAYS = 90;
const RESET_TOKEN_RETENTION_DAYS = 7;

/**
 * How big the database is, and what is in it, measured once a night.
 *
 * Each table is counted and its size on disk recorded, so the dev console can
 * show what is growing and how fast.
 */
@Injectable()
export class UsageSnapshot {
  constructor(
    private readonly db: PrismaDb,
    private readonly usage: UsageService,
  ) {}

  async run(): Promise<Record<string, unknown>> {
    const [database] = await this.db.$queryRaw<{ size: bigint }[]>`
      select pg_database_size(current_database()) as size`;
    const size = database?.size ?? 0n;

    let total = 0n;
    for (const table of MEASURED_TABLES) {
      // D16: irca_app has no SELECT on audit_events at all, counted or
      // otherwise, so its row count comes from the one function that may
      // read it without seeing what is in it.
      const counted =
        table === 'audit_events'
          ? {
              rows: (
                await this.db.$queryRaw<{ count: bigint }[]>`select audit_events_count() as count`
              )[0]?.count,
            }
          : (
              await this.db.$queryRaw<{ rows: bigint }[]>`
                select count(*)::bigint as rows from ${Prisma.raw(`"${table}"`)}`
            )[0];
      const [relation] = await this.db.$queryRaw<{ bytes: bigint }[]>`
        select pg_total_relation_size(${table}::regclass) as bytes`;
      const bytes = relation?.bytes ?? 0n;
      this.usage.gauge(`db.rows.${table}`, counted?.rows ?? 0n);
      this.usage.gauge(`db.bytes.${table}`, bytes);
      total += bytes;
    }

    this.usage.gauge('db.bytes.total', total);
    this.usage.gauge('db.size_bytes', size);

    await this.entities();
    const cleaned = await this.cleanUp();
    await this.usage.flush();
    return { tables: MEASURED_TABLES.length, databaseBytes: Number(size), ...cleaned };
  }

  /** The number of each kind of thing there is, as gauges. */
  private async entities(): Promise<void> {
    const counts: [string, Prisma.Sql][] = [
      ['entities.people', Prisma.sql`select count(*)::bigint as n from people`],
      [
        'entities.registrations.in_progress',
        Prisma.sql`select count(*)::bigint as n from registrations where status = 'in_progress'`,
      ],
      [
        'entities.registrations.submitted',
        Prisma.sql`select count(*)::bigint as n from registrations where status = 'submitted'`,
      ],
      [
        'entities.members.confirmed',
        Prisma.sql`select count(*)::bigint as n from people where stage = 'CONFIRMED_MEMBER'`,
      ],
      [
        'entities.finance.transactions',
        Prisma.sql`select count(*)::bigint as n from finance_transactions`,
      ],
      [
        'entities.finance.items',
        Prisma.sql`select (select count(*) from finance_income_sources)
                        + (select count(*) from finance_expense_items) as n`,
      ],
      [
        'entities.users.active',
        Prisma.sql`select count(*)::bigint as n from users where status = 'ACTIVE'`,
      ],
      [
        'entities.users.invited',
        Prisma.sql`select count(*)::bigint as n from users where status = 'INVITED'`,
      ],
      [
        'entities.users.disabled',
        Prisma.sql`select count(*)::bigint as n from users where status = 'DISABLED'`,
      ],
      [
        'entities.roles.custom',
        Prisma.sql`select count(*)::bigint as n from roles where system_key is null and deleted_at is null`,
      ],
      [
        'entities.modules.enabled',
        Prisma.sql`select count(*)::bigint as n from module_state where enabled`,
      ],
      [
        'change_requests.pending',
        Prisma.sql`select count(*)::bigint as n from change_requests where status = 'PENDING'`,
      ],
      [
        'outreach.followups.pending',
        Prisma.sql`select count(distinct person_id)::bigint as n from outreach_reached
                   where needs_follow_up`,
      ],
      [
        'auth.sessions.active',
        Prisma.sql`select count(*)::bigint as n from sessions
                   where revoked_at is null and expires_at > now()`,
      ],
    ];
    for (const [metric, sql] of counts) {
      const [row] = await this.db.$queryRaw<{ n: bigint }[]>(sql);
      this.usage.gauge(metric, row?.n ?? 0n);
    }
  }

  /**
   * Sessions long dead and reset links long used are removed. The activity
   * log is never touched: it is kept forever.
   */
  private async cleanUp(): Promise<{ sessionsRemoved: number; resetTokensRemoved: number }> {
    const sessionsRemoved = await this.db.$executeRaw`
      delete from sessions
      where coalesce(revoked_at, expires_at) < now() - make_interval(days => ${SESSION_RETENTION_DAYS})
        and id not in (select session_id from impersonation_sessions where session_id is not null)`;
    const resetTokensRemoved = await this.db.$executeRaw`
      delete from password_reset_tokens
      where created_at < now() - make_interval(days => ${RESET_TOKEN_RETENTION_DAYS})`;
    return { sessionsRemoved, resetTokensRemoved };
  }

  /** Every few minutes: the most connections seen at once today. */
  async sampleConnections(): Promise<Record<string, unknown>> {
    const [sample] = await this.db.$queryRaw<{ n: number }[]>`
      select coalesce(sum(numbackends), 0)::int as n from pg_stat_database where datname = current_database()`;
    const n = sample?.n ?? 0;
    this.usage.max('db.connections.max_today', n);
    return { connections: n };
  }
}

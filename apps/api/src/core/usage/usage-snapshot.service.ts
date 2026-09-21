import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaCore } from '../database/prisma-clients.js';
import { TENANT_TABLES } from '../database/planes.js';
import { UsageService } from './usage.service.js';

/** Core tables that also carry a church_id and grow with the church's use. */
const CORE_CHURCH_TABLES = [
  'audit_events',
  'email_outbox',
  'usage_daily',
  'user_activity_daily',
  'impersonation_sessions',
];

/** Kept this long after they stop working, for the dev console and support. */
const SESSION_RETENTION_DAYS = 90;
const RESET_TOKEN_RETENTION_DAYS = 7;

type Grouped = { church_id: string | null; rows: bigint; bytes: bigint };

/**
 * How much of the database each church uses, measured once a night.
 *
 * Every church-owned table is counted per church, and its size on disk is
 * shared out in proportion to the church's rows' own size: the table with its
 * indexes and TOAST, times the church's share of the heap. It is an estimate,
 * and a good one: exact per-church index sizes do not exist in Postgres.
 *
 * Full counts are fine up to a few million rows. Past that, estimate bytes
 * from `tablesample system (1)` and scale up.
 */
@Injectable()
export class UsageSnapshot {
  constructor(
    private readonly db: PrismaCore,
    private readonly usage: UsageService,
  ) {}

  async run(): Promise<Record<string, unknown>> {
    const tables = [...TENANT_TABLES, ...CORE_CHURCH_TABLES].sort();
    const totals = new Map<string, bigint>();
    const [database] = await this.db.$queryRaw<{ size: bigint }[]>`
      select pg_database_size(current_database()) as size`;
    const size = database?.size ?? 0n;

    for (const table of tables) {
      const id = Prisma.raw(`"${table}"`);
      const grouped = await this.db.$queryRaw<Grouped[]>`
        -- tenant: platform job, grouped by church
        select church_id, count(*)::bigint as rows,
               coalesce(sum(pg_column_size(t.*)), 0)::bigint as bytes
        from ${id} t group by church_id`;
      const [relation] = await this.db.$queryRaw<{ total: bigint }[]>`
        select pg_total_relation_size(${table}::regclass) as total`;
      const total = relation?.total ?? 0n;
      const heap = grouped.reduce((sum, g) => sum + g.bytes, 0n);

      for (const g of grouped) {
        if (!g.church_id) continue;
        const share = heap > 0n ? (total * g.bytes) / heap : 0n;
        this.usage.gauge(`db.rows.${table}`, g.rows, g.church_id);
        this.usage.gauge(`db.bytes.${table}`, share, g.church_id);
        totals.set(g.church_id, (totals.get(g.church_id) ?? 0n) + share);
      }
    }

    for (const [churchId, bytes] of totals) {
      this.usage.gauge('db.bytes.total', bytes, churchId);
      // As a whole number of hundredths of a percent, to stay an integer.
      this.usage.gauge('db.share_pct', size > 0n ? (bytes * 10_000n) / size : 0n, churchId);
    }
    this.usage.gauge('db.size_bytes', size, null);

    await this.entities();
    const cleaned = await this.cleanUp();
    await this.usage.flush();
    return {
      tables: tables.length,
      churches: totals.size,
      databaseBytes: Number(size),
      ...cleaned,
    };
  }

  /** The number of each kind of thing each church has, as gauges. */
  private async entities(): Promise<void> {
    const counts: [string, Prisma.Sql][] = [
      [
        'entities.people',
        Prisma.sql`select church_id, count(*)::bigint as n from people group by 1`,
      ],
      [
        'entities.registrations.in_progress',
        Prisma.sql`select church_id, count(*)::bigint as n from registrations where status = 'in_progress' group by 1`,
      ],
      [
        'entities.registrations.submitted',
        Prisma.sql`select church_id, count(*)::bigint as n from registrations where status = 'submitted' group by 1`,
      ],
      [
        'entities.members.confirmed',
        Prisma.sql`select church_id, count(*)::bigint as n from people where stage = 'CONFIRMED_MEMBER' group by 1`,
      ],
      [
        'entities.finance.transactions',
        Prisma.sql`select church_id, count(*)::bigint as n from finance_transactions group by 1`,
      ],
      [
        'entities.finance.items',
        Prisma.sql`select church_id, count(*)::bigint as n from (
          select church_id from finance_income_sources union all select church_id from finance_expense_items
        ) i group by 1`,
      ],
      [
        'entities.users.active',
        Prisma.sql`select church_id, count(*)::bigint as n from church_memberships where status = 'ACTIVE' group by 1`,
      ],
      [
        'entities.users.invited',
        Prisma.sql`select church_id, count(*)::bigint as n from church_memberships where status = 'INVITED' group by 1`,
      ],
      [
        'entities.users.disabled',
        Prisma.sql`select church_id, count(*)::bigint as n from church_memberships where status = 'DISABLED' group by 1`,
      ],
      [
        'entities.roles.custom',
        Prisma.sql`select church_id, count(*)::bigint as n from roles where system_key is null and deleted_at is null group by 1`,
      ],
      [
        'entities.modules.enabled',
        Prisma.sql`select church_id, count(*)::bigint as n from church_modules where enabled group by 1`,
      ],
      [
        'change_requests.pending',
        Prisma.sql`select church_id, count(*)::bigint as n from change_requests where status = 'PENDING' group by 1`,
      ],
      [
        'auth.sessions.active',
        Prisma.sql`select active_church_id as church_id, count(*)::bigint as n from sessions
                   where revoked_at is null and expires_at > now() and active_church_id is not null group by 1`,
      ],
    ];
    for (const [metric, sql] of counts) {
      const rows = await this.db.$queryRaw<{ church_id: string; n: bigint }[]>(sql);
      for (const row of rows) this.usage.gauge(metric, row.n, row.church_id);
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
    this.usage.max('db.connections.max_today', n, null);
    return { connections: n };
  }
}

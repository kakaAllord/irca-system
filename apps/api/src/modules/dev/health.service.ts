import { Injectable } from '@nestjs/common';
import { Db } from '../../core/database/db.service.js';

/**
 * How the platform itself is doing: the database, the slowest queries, the
 * email backlog, the jobs, and how many requests are failing.
 */
@Injectable()
export class HealthService {
  constructor(private readonly db: Db) {}

  async report() {
    const [size] = await this.db.client.$queryRaw<{ bytes: bigint; connections: number }[]>`
      select pg_database_size(current_database()) as bytes,
             (select coalesce(sum(numbackends), 0)::int from pg_stat_database
              where datname = current_database()) as connections`;
    const tables = await this.db.client.$queryRaw<{ table: string; bytes: bigint }[]>`
      select relname as table, pg_total_relation_size(relid) as bytes
      from pg_catalog.pg_statio_user_tables order by 2 desc limit 20`;
    const outbox = await this.db.client.emailOutbox.groupBy({ by: ['status'], _count: { _all: true } });
    const jobs = await this.db.client.$queryRaw<
      {
        job: string;
        started_at: Date;
        finished_at: Date | null;
        ok: boolean | null;
        error: string | null;
      }[]
    >`
      select distinct on (job) job, started_at, finished_at, ok, error
      from job_runs order by job, started_at desc`;
    const errors = await this.db.client.$queryRaw<{ day: Date; requests: bigint; errors: bigint }[]>`
      select day,
             sum(value) filter (where metric = 'api.requests')::bigint as requests,
             sum(value) filter (where metric = 'api.errors.5xx')::bigint as errors
      from usage_daily where day >= current_date - 13 and metric in ('api.requests', 'api.errors.5xx')
      group by day order by day`;

    return {
      database: {
        bytes: Number(size?.bytes ?? 0),
        connections: size?.connections ?? 0,
        tables: tables.map((t) => ({ table: t.table, bytes: Number(t.bytes) })),
      },
      slowQueries: await this.slowQueries(),
      outbox: Object.fromEntries(outbox.map((o) => [o.status, o._count._all])),
      jobs: jobs.map((j) => ({
        job: j.job,
        lastRunAt: j.started_at.toISOString(),
        durationMs: j.finished_at ? j.finished_at.getTime() - j.started_at.getTime() : null,
        ok: j.ok,
        error: j.error,
      })),
      errors: errors.map((e) => ({
        day: e.day.toISOString().slice(0, 10),
        requests: Number(e.requests ?? 0),
        errors: Number(e.errors ?? 0),
      })),
    };
  }

  /**
   * The ten queries that took the most time in total, with their text as
   * Postgres normalises it — placeholders, never the values. Absent until
   * pg_stat_statements is installed, which on Neon is one statement.
   */
  private async slowQueries() {
    const installed = await this.db.client.$queryRaw<{ ok: boolean }[]>`
      select exists (select 1 from pg_extension where extname = 'pg_stat_statements') as ok`;
    if (!installed[0]?.ok) return null;
    try {
      const rows = await this.db.client.$queryRaw<
        { query: string; calls: bigint; mean_ms: number; total_ms: number }[]
      >`
        select left(query, 400) as query, calls, mean_exec_time as mean_ms, total_exec_time as total_ms
        from pg_stat_statements order by total_exec_time desc limit 10`;
      return rows.map((r) => ({
        query: r.query,
        calls: Number(r.calls),
        meanMs: Math.round(r.mean_ms * 10) / 10,
        totalMs: Math.round(r.total_ms),
      }));
    } catch {
      // Installed but not readable by this role: say so rather than fail the page.
      return null;
    }
  }
}

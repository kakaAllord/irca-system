import { Injectable } from '@nestjs/common';
import { ErrorCode, metricDef } from '@irca/shared';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaDb } from '../../core/database/prisma-clients.js';
import { AppError } from '../../core/http/app-error.js';

type Series = { metric: string; points: { day: string; value: number }[] };

const MAX_DAYS = 400;

/**
 * Usage over time.
 *
 * Days with nothing recorded are filled in: a counter with no row means
 * nothing happened, so it is zero; a gauge with no row means the snapshot did
 * not run, so the last known value carries forward rather than dropping to
 * nothing on the chart.
 */
@Injectable()
export class DevUsageService {
  constructor(private readonly db: PrismaDb) {}

  async series(metrics: string[], from: string, to: string): Promise<Series[]> {
    const days = this.days(from, to);
    const rows = await this.db.$queryRaw<{ metric: string; day: Date; value: bigint }[]>`
      select metric, day, value from usage_daily
      where metric in (${Prisma.join(metrics)})
        and day between ${from}::date and ${to}::date
      order by day`;
    return metrics.map((metric) =>
      this.fill(
        metric,
        days,
        rows.filter((r) => r.metric === metric),
      ),
    );
  }

  /** Everything summed across churches, plus what belongs to no church. */
  async platform(metrics: string[], from: string, to: string): Promise<Series[]> {
    const days = this.days(from, to);
    const rows = await this.db.$queryRaw<{ metric: string; day: Date; value: bigint }[]>`
      select metric, day, sum(value)::bigint as value from (
        select metric, day, value from usage_daily
        union all
        select metric, day, value from platform_usage_daily
      ) u
      where metric in (${Prisma.join(metrics)}) and day between ${from}::date and ${to}::date
      group by metric, day order by day`;
    return metrics.map((metric) =>
      this.fill(
        metric,
        days,
        rows.filter((r) => r.metric === metric),
      ),
    );
  }

  /**
   * The latest per-table rows and bytes for a church, with how each moved
   * against a week and a month before.
   */
  async database() {
    const rows = await this.db.$queryRaw<{ metric: string; day: Date; value: bigint }[]>`
      select metric, day, value from usage_daily
      where (metric like 'db.rows.%' or metric like 'db.bytes.%')
        and day >= current_date - 31
      order by day desc`;
    const at = (metric: string, daysAgo: number) => {
      const cutoff = Date.now() - daysAgo * 86_400_000;
      return Number(rows.find((r) => r.metric === metric && r.day.getTime() <= cutoff)?.value ?? 0);
    };
    const tables = [
      ...new Set(
        rows
          .map((r) => r.metric)
          .filter((m) => m.startsWith('db.rows.'))
          .map((m) => m.slice('db.rows.'.length)),
      ),
    ].sort();
    const total = at('db.bytes.total', 0);
    return {
      totalBytes: total,
      tables: tables
        .map((table) => {
          const bytes = at(`db.bytes.${table}`, 0);
          return {
            table,
            rows: at(`db.rows.${table}`, 0),
            bytes,
            rowsWeekAgo: at(`db.rows.${table}`, 7),
            rowsMonthAgo: at(`db.rows.${table}`, 30),
            share: total ? Math.round((bytes / total) * 100) : 0,
          };
        })
        .sort((a, b) => b.bytes - a.bytes),
    };
  }

  private fill(metric: string, days: string[], rows: { day: Date; value: bigint }[]): Series {
    const byDay = new Map(rows.map((r) => [r.day.toISOString().slice(0, 10), Number(r.value)]));
    const gauge = metricDef(metric)?.type === 'gauge';
    let carried = 0;
    return {
      metric,
      points: days.map((day) => {
        const value = byDay.get(day);
        if (value !== undefined) carried = value;
        return { day, value: value ?? (gauge ? carried : 0) };
      }),
    };
  }

  private days(from: string, to: string): string[] {
    const start = Date.parse(`${from}T00:00:00Z`);
    const end = Date.parse(`${to}T00:00:00Z`);
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_FAILED,
        'Ask for a range like from=2026-09-01&to=2026-09-30.',
      );
    }
    const count = Math.round((end - start) / 86_400_000) + 1;
    if (count > MAX_DAYS) {
      throw new AppError(400, ErrorCode.VALIDATION_FAILED, `Ask for at most ${MAX_DAYS} days.`);
    }
    return Array.from({ length: count }, (_, i) =>
      new Date(start + i * 86_400_000).toISOString().slice(0, 10),
    );
  }
}

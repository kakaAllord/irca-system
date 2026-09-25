import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { PrismaDb } from '../database/prisma-clients.js';
import type { RequestContext } from '../context/request-context.js';

type Kind = 'sum' | 'max' | 'set';

const FLUSH_MS = 60_000;
const TZ_CACHE_MS = 10 * 60_000;

/**
 * Counts what the system is used for, per local day, so the dev console can
 * show it and nobody has to guess later (docs/plan/06, step 6.1).
 *
 * Counters are kept in memory and written once a minute in one statement, so
 * counting costs nothing per request. A crash loses at most a minute of
 * counters: these are for capacity and insight, not accounting.
 */
@Injectable()
export class UsageService implements OnModuleDestroy {
  private readonly logger = new Logger('Usage');
  private buffer = new Map<string, { day: string; metric: string; value: bigint; kind: Kind }>();
  private activity = new Map<string, { userId: string; day: string; requests: number }>();
  private timezone: { at: number; tz: string } | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly db: PrismaDb,
    private readonly cls: ClsService<RequestContext>,
  ) {
    this.timer = setInterval(() => void this.flush(), FLUSH_MS);
    this.timer.unref();
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.flush();
  }

  /** Add to a counter. */
  inc(metric: string, by = 1): void {
    this.add(metric, BigInt(by), 'sum');
  }

  /** Keep the largest value seen today, e.g. the slowest request. */
  max(metric: string, value: number): void {
    this.add(metric, BigInt(Math.round(value)), 'max');
  }

  /** A measurement that replaces yesterday's, e.g. how many rows there are. */
  gauge(metric: string, value: bigint | number): void {
    this.add(metric, BigInt(value), 'set');
  }

  /**
   * Marks a person active today. During an impersonation this counts the
   * viewer, not the person viewed: being looked at is not activity, and
   * counting it would give the impersonation away (D16).
   */
  touchActiveUser(): void {
    const userId = this.cls.get('actorUserId');
    if (!userId) return;
    const day = this.localDay();
    const key = `${userId}|${day}`;
    const row = this.activity.get(key) ?? { userId, day, requests: 0 };
    row.requests++;
    this.activity.set(key, row);
  }

  private add(metric: string, value: bigint, kind: Kind) {
    const day = this.localDay();
    const key = `${day}|${metric}`;
    const row = this.buffer.get(key);
    if (!row) {
      this.buffer.set(key, { day, metric, value, kind });
      return;
    }
    row.value =
      kind === 'max'
        ? value > row.value
          ? value
          : row.value
        : kind === 'set'
          ? value
          : row.value + value;
  }

  /**
   * Today where the church is, not where the server is: a Sunday evening in
   * Arusha must not be counted as Monday.
   */
  private localDay(): string {
    if (!this.timezone || Date.now() - this.timezone.at > TZ_CACHE_MS) void this.loadTimezone();
    const tz = this.timezone?.tz ?? 'UTC';
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
  }

  private async loadTimezone() {
    const church = await this.db.church.findFirst({ select: { timezone: true } });
    if (church) this.timezone = { at: Date.now(), tz: church.timezone };
  }

  /** Writes what has been counted. Swaps the buffer first, so counting continues meanwhile. */
  async flush(): Promise<void> {
    const rows = [...this.buffer.values()];
    const activity = [...this.activity.values()];
    this.buffer = new Map();
    this.activity = new Map();
    if (!rows.length && !activity.length) return;

    try {
      for (const row of rows) {
        await this.db.$executeRaw`
          insert into usage_daily (day, metric, value)
          values (${row.day}::date, ${row.metric}, ${row.value})
          on conflict (day, metric) do update set value =
            case ${row.kind}
              when 'max' then greatest(usage_daily.value, excluded.value)
              when 'set' then excluded.value
              else usage_daily.value + excluded.value end`;
      }
      for (const row of activity) {
        await this.db.$executeRaw`
          insert into user_activity_daily (user_id, day, requests)
          values (${row.userId}::uuid, ${row.day}::date, ${row.requests})
          on conflict (user_id, day) do update set
            requests = user_activity_daily.requests + excluded.requests`;
      }
    } catch (err) {
      // Counting must never break a request or a shutdown.
      this.logger.warn({ msg: 'could not write usage counters', err });
    }
  }
}

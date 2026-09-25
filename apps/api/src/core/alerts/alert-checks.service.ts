import { Injectable } from '@nestjs/common';
import { PrismaDb } from '../database/prisma-clients.js';
import { UsageService } from '../usage/usage.service.js';
import { AlertsService } from './alerts.service.js';
import { alertSettings } from './alert-settings.js';

/** Fewer requests than this in a window say nothing about a failure rate. */
const MIN_REQUESTS = 50;
/** A job whose last run is older than this is not running any more; it is not failing. */
const STALE_JOB_DAYS = 2;

type Traffic = { day: string; requests: number; errors: number };

/**
 * The system's own checks, every ten minutes (docs/plan/10, step 10.4). The
 * site being down is watched from outside, by the uptime monitor, since a
 * server that is down cannot say so. Texts are Communications' checks
 * (modules/comms/comms-alerts.service.ts).
 */
@Injectable()
export class AlertChecks {
  /**
   * The day's totals at the last check. In memory, because the window is the
   * last ten minutes: after a restart the first check only takes a reading.
   */
  private lastTraffic: Traffic | null = null;

  constructor(
    private readonly db: PrismaDb,
    private readonly usage: UsageService,
    private readonly alerts: AlertsService,
  ) {}

  async run(): Promise<Record<string, unknown>> {
    const settings = await alertSettings(this.db);
    return {
      errors: await this.failingRequests(settings.errorRatePercent),
      emails: await this.failedEmails(),
      jobs: await this.failingJobs(),
      storage: await this.storage(settings.dbStorageBytes, settings.storagePercent),
    };
  }

  /** More than 2% of requests failing since the last check. */
  async failingRequests(percent: number): Promise<string> {
    await this.usage.flush();
    const [today] = await this.db.$queryRaw<{ day: string; requests: bigint; errors: bigint }[]>`
      select day::text as day,
             coalesce(sum(value) filter (where metric = 'api.requests'), 0)::bigint as requests,
             coalesce(sum(value) filter (where metric = 'api.errors.5xx'), 0)::bigint as errors
      from usage_daily
      where day = (select max(day) from usage_daily where metric = 'api.requests')
        and metric in ('api.requests', 'api.errors.5xx')
      group by day`;
    if (!today) return 'no traffic yet';
    const now: Traffic = {
      day: today.day,
      requests: Number(today.requests),
      errors: Number(today.errors),
    };
    const before = this.lastTraffic;
    this.lastTraffic = now;
    // A new day starts the counters again; the next check has a window.
    if (!before || before.day !== now.day) return 'reading taken';

    const requests = now.requests - before.requests;
    const errors = now.errors - before.errors;
    // Too quiet to judge: whatever was said last stands until there is traffic.
    if (requests < MIN_REQUESTS) return `${requests} requests, too few to judge`;

    const rate = (errors / requests) * 100;
    const alert = {
      key: 'api.errors',
      title: `${rate.toFixed(1)}% of requests are failing`,
      lines: [
        `${errors} of the last ${requests} requests to the API failed with a server error, over the last ten minutes or so.`,
        'Dev → Logs shows what went wrong; Dev → Health shows the database and the jobs.',
      ],
    };
    if (rate > percent) await this.alerts.raise(alert);
    else await this.alerts.clear({ ...alert, title: 'Requests are failing', lines: [] });
    return `${errors}/${requests} failed`;
  }

  /**
   * Emails given up on after every retry. Each is told about once, and also
   * by text message, because the reason may be that email itself is broken.
   */
  async failedEmails(): Promise<number> {
    const seen = (await this.alerts.cursor<{ failed: number }>('cursor:email.failed'))?.failed ?? 0;
    const failed = await this.db.emailOutbox.count({ where: { status: 'FAILED' } });
    if (failed > seen) {
      const latest = await this.db.emailOutbox.findMany({
        where: { status: 'FAILED' },
        orderBy: { nextAttemptAt: 'desc' },
        take: Math.min(failed - seen, 5),
        select: { template: true, lastError: true },
      });
      const fresh = failed - seen;
      await this.alerts.notify({
        key: 'email.failed',
        title: `${fresh} email${fresh === 1 ? ' was' : 's were'} given up on`,
        lines: [
          `After every retry, ${fresh === 1 ? 'an email' : `${fresh} emails`} could not be sent.`,
          ...latest.map((e) => `${e.template}: ${e.lastError ?? 'no reason given'}`),
          'Dev → Usage → Email lists them. If every email is failing, check the email provider first.',
        ],
        sms: true,
      });
    }
    if (failed !== seen) await this.alerts.setCursor('cursor:email.failed', { failed });
    return failed - seen;
  }

  /** Any job whose last two runs both failed. */
  async failingJobs(): Promise<string[]> {
    // Each job's last two runs, stepping through the index one job at a time
    // (as the Health page does), so a year of runs costs nothing.
    const rows = await this.db.$queryRaw<
      { job: string; ok: boolean | null; error: string | null; started_at: Date }[]
    >`
      with recursive jobs as (
        (select job from job_runs order by job limit 1)
        union all
        select (select r.job from job_runs r where r.job > jobs.job order by r.job limit 1)
        from jobs where jobs.job is not null
      )
      select last.* from jobs
      cross join lateral (
        select job, ok, error, started_at from job_runs
        where job_runs.job = jobs.job and finished_at is not null
        order by started_at desc limit 2
      ) last`;
    const byJob = new Map<string, typeof rows>();
    for (const r of rows) byJob.set(r.job, [...(byJob.get(r.job) ?? []), r]);

    const stale = Date.now() - STALE_JOB_DAYS * 86_400_000;
    const failing: string[] = [];
    for (const [job, runs] of byJob) {
      const key = `job:${job}`;
      const twice =
        runs.length === 2 &&
        runs.every((r) => r.ok === false) &&
        runs[0]!.started_at.getTime() > stale;
      if (twice) {
        failing.push(job);
        await this.alerts.raise({
          key,
          title: `The ${job} job keeps failing`,
          lines: [
            `Its last two runs failed. The latest said: ${runs[0]!.error ?? 'no reason given'}`,
            'Dev → Health lists every job and its last run.',
          ],
        });
      } else if (runs[0]?.ok) {
        await this.alerts.clear({ key, title: `The ${job} job`, lines: ['It ran successfully.'] });
      }
    }
    return failing;
  }

  /** The database past 80% of the storage its plan allows, once that size is known. */
  async storage(limitBytes: number | null, percent: number): Promise<string> {
    if (!limitBytes) return 'no storage size set';
    const [size] = await this.db.$queryRaw<{ value: bigint }[]>`
      select value from usage_daily where metric = 'db.size_bytes' order by day desc limit 1`;
    if (!size) return 'not measured yet';
    const used = (Number(size.value) / limitBytes) * 100;
    const alert = {
      key: 'db.storage',
      title: `The database is ${Math.round(used)}% full`,
      lines: [
        `It holds ${gb(Number(size.value))} of the ${gb(limitBytes)} its plan allows.`,
        'Dev → Usage → Database shows which tables are growing. A larger plan, or less kept, before it fills.',
      ],
    };
    if (used > percent) await this.alerts.raise(alert);
    else await this.alerts.clear({ ...alert, title: 'The database was nearly full', lines: [] });
    return `${Math.round(used)}% used`;
  }
}

const gb = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(bytes < 1024 ** 3 ? 2 : 1)} GB`;

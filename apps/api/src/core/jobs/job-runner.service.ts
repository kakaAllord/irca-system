import { Injectable, Logger } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaDb } from '../database/prisma-clients.js';
import type { RequestContext } from '../context/request-context.js';

/**
 * Runs scheduled work safely.
 *
 * One instance at a time, through a Postgres advisory lock, so a second API
 * instance simply skips a job someone else is running. Every run is recorded,
 * with how long it took and what went wrong, which is what the dev console's
 * health page reads.
 *
 * Jobs never inherit anyone's identity: each runs in a fresh, empty request
 * context, so nothing can quietly act as the last person who made a request.
 */
@Injectable()
export class JobRunner {
  private readonly logger = new Logger('Jobs');

  constructor(
    private readonly db: PrismaDb,
    private readonly cls: ClsService<RequestContext>,
  ) {}

  async run(job: string, fn: () => Promise<Record<string, unknown> | void>): Promise<void> {
    const rows = await this.db.$queryRaw<{ locked: boolean }[]>`
      select pg_try_advisory_lock(hashtext(${`irca:job:${job}`})) as locked`;
    if (!rows[0]?.locked) return;

    const run = await this.db.jobRun.create({ data: { job } });
    try {
      const stats = await this.inContext(null, fn);
      await this.db.jobRun.update({
        where: { id: run.id },
        data: {
          finishedAt: new Date(),
          ok: true,
          stats: (stats ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (err) {
      this.logger.error({ msg: `job ${job} failed`, err });
      await this.db.jobRun.update({
        where: { id: run.id },
        data: { finishedAt: new Date(), ok: false, error: (err as Error).message.slice(0, 500) },
      });
    } finally {
      await this.db.$executeRaw`select pg_advisory_unlock(hashtext(${`irca:job:${job}`}))`;
    }
  }

  private inContext<T>(churchId: string | null, fn: () => Promise<T>): Promise<T> {
    return this.cls.run(async () => {
      this.cls.set('ip', null);
      this.cls.set('userAgent', null);
      this.cls.set('sessionId', null);
      this.cls.set('userId', null);
      this.cls.set('actorUserId', null);
      this.cls.set('impersonationId', null);
      this.cls.set('permissions', new Set<string>());
      return fn();
    });
  }
}

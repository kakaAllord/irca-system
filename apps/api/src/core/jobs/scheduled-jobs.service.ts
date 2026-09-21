import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaCore } from '../database/prisma-clients.js';
import { ImpersonationService } from '../impersonation/impersonation.service.js';
import { JobRunner } from './job-runner.service.js';

/**
 * The work that happens on a clock rather than on a request. Each runs through
 * JobRunner, so only one instance does it and every run is recorded.
 */
@Injectable()
export class ScheduledJobs {
  constructor(
    private readonly jobs: JobRunner,
    private readonly impersonation: ImpersonationService,
    private readonly db: PrismaCore,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'impersonation-expiry' })
  expireImpersonations() {
    return this.jobs.run('impersonation-expiry', () => this.impersonation.expireOverdue());
  }

  /** Overnight in Arusha, where the churches are. */
  @Cron('0 3 * * *', { name: 'session-cleanup', timeZone: 'Africa/Dar_es_Salaam' })
  cleanUpSessions() {
    return this.jobs.run('session-cleanup', async () => {
      const { count } = await this.db.session.updateMany({
        where: { revokedAt: null, expiresAt: { lt: new Date() } },
        data: { revokedAt: new Date(), revokeReason: 'expired' },
      });
      // Rows are kept: the dev console counts them, and they explain sign-outs.
      return { revoked: count };
    });
  }
}

import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaDb } from '../database/prisma-clients.js';
import { ImpersonationService } from '../impersonation/impersonation.service.js';
import { EmailService } from '../email/email.service.js';
import { JobRunner } from './job-runner.service.js';
import { UsageSnapshot } from '../usage/usage-snapshot.service.js';

/**
 * The work that happens on a clock rather than on a request. Each runs through
 * JobRunner, so only one instance does it and every run is recorded.
 */
@Injectable()
export class ScheduledJobs {
  constructor(
    private readonly jobs: JobRunner,
    private readonly impersonation: ImpersonationService,
    private readonly db: PrismaDb,
    private readonly email: EmailService,
    private readonly snapshot: UsageSnapshot,
  ) {}

  /** How big each table is, and what there is, measured before anyone is awake. */
  @Cron('0 2 * * *', { name: 'usage-snapshot', timeZone: 'Africa/Dar_es_Salaam' })
  snapshotUsage() {
    return this.jobs.run('usage-snapshot', () => this.snapshot.run());
  }

  /** Connections are a moment-to-moment thing; the day keeps the peak. */
  @Cron('0 */5 * * * *', { name: 'db-sample' })
  sampleDatabase() {
    return this.jobs.run('db-sample', () => this.snapshot.sampleConnections());
  }

  /** Often enough that an invitation feels immediate. */
  @Cron('*/15 * * * * *', { name: 'email-outbox' })
  sendQueuedEmails() {
    return this.jobs.run('email-outbox', () => this.email.sendDue());
  }

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

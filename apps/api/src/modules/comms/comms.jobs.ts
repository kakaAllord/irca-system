import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JobRunner } from '../../core/jobs/job-runner.service.js';
import { OutboxService } from './outbox.service.js';

/**
 * Communications' clock, beside email's (core/jobs): each through JobRunner,
 * so only one instance runs it and every run is recorded.
 */
@Injectable()
export class CommsJobs {
  constructor(
    private readonly jobs: JobRunner,
    private readonly outbox: OutboxService,
  ) {}

  /** As often as email, so a message sent from the portal feels immediate. */
  @Cron('*/15 * * * * *', { name: 'sms-outbox' })
  sendQueued() {
    return this.jobs.run('sms-outbox', () => this.outbox.sendDue());
  }

  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'sms-delivery' })
  askAboutDelivery() {
    return this.jobs.run('sms-delivery', () => this.outbox.pollDelivery());
  }

  @Cron(CronExpression.EVERY_HOUR, { name: 'sms-balance' })
  readBalance() {
    return this.jobs.run('sms-balance', () => this.outbox.readBalance());
  }
}

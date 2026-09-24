import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@irca/shared';
import { PrismaDb } from '../database/prisma-clients.js';
import { AppError } from '../http/app-error.js';
import { UsageService } from '../usage/usage.service.js';

/** What one church may use in a day. Defaults in code; a dev can raise them later. */
export const QUOTAS = {
  'email.sent': { limit: 500, what: 'emails' },
  'finance.exports': { limit: 50, what: 'downloads' },
} as const;

export type QuotaKey = keyof typeof QUOTAS;

/**
 * Daily limits per church, counted from the same usage rows the dev console
 * shows. Reaching one refuses the action with a clear message rather than
 * dropping it quietly.
 */
@Injectable()
export class QuotaService {
  constructor(
    private readonly db: PrismaDb,
    private readonly usage: UsageService,
  ) {}

  async consume(key: QuotaKey, by = 1): Promise<void> {
    const { limit, what } = QUOTAS[key];
    const used = await this.db.usageDaily.findUnique({
      where: { day_metric: { day: startOfDay(new Date()), metric: key } },
    });
    if (Number(used?.value ?? 0) + by > limit) {
      throw new AppError(
        429,
        ErrorCode.RATE_LIMITED,
        `Today's limit of ${limit} ${what} has been reached. It resets at midnight.`,
      );
    }
    this.usage.inc(key, by);
  }
}

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

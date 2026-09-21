import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ErrorCode } from '@irca/shared';
import { AppError } from '../http/app-error.js';
import { RequestAuth } from '../context/request-auth.js';
import { UsageService } from '../usage/usage.service.js';

const SAFE_WINDOW_MS = 60_000;
/** One person cannot flood their own church. */
const PER_USER = 300;
/** One church cannot use up the capacity every church shares. */
const PER_CHURCH = 1_200;

type Window = { count: number; resetAt: number };

/**
 * Limits per person and per church, on top of the per-address limit the
 * throttler applies.
 *
 * Counters are in memory, which is right for one API instance. Before running
 * two, move them to Redis or Postgres, or each instance will allow the whole
 * limit on its own (noted in docs/plan/06, step 6.7).
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly auth: RequestAuth,
    private readonly usage: UsageService,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    // Health checks must answer even when something is hammering the API.
    if (req.path === '/health') return true;

    const userId = this.auth.actorUserId;
    const churchId = this.auth.churchId;
    if (userId)
      this.hit(`u:${userId}`, PER_USER, 'You are making too many requests. Wait a minute.');
    if (churchId) {
      this.hit(
        `c:${churchId}`,
        PER_CHURCH,
        'Your church is making too many requests at once. Wait a minute and try again.',
      );
    }
    return true;
  }

  private hit(key: string, limit: number, message: string): void {
    const now = Date.now();
    const window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + SAFE_WINDOW_MS });
      if (this.windows.size > 10_000) this.sweep(now);
      return;
    }
    window.count++;
    if (window.count > limit) {
      this.usage.inc('api.throttled');
      throw new AppError(429, ErrorCode.RATE_LIMITED, message);
    }
  }

  private sweep(now: number): void {
    for (const [key, window] of this.windows) if (window.resetAt <= now) this.windows.delete(key);
  }
}

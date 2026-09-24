import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { tap } from 'rxjs';
import type { Request, Response } from 'express';
import { RequestAuth } from '../context/request-auth.js';
import { UsageService } from './usage.service.js';

/** The module a route belongs to, from its path: /v1/finance/... → finance. */
function moduleOf(path: string): string {
  const parts = path.split('/').filter(Boolean);
  const first = parts[0] === 'v1' ? parts[1] : parts[0];
  return first ?? 'root';
}

/**
 * Counts every request: how many, how many failed, and how long they took.
 * This is what the dev console's Usage pages draw.
 */
@Injectable()
export class UsageInterceptor implements NestInterceptor {
  constructor(
    private readonly usage: UsageService,
    private readonly auth: RequestAuth,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler) {
    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const started = Date.now();
    const record = (status: number) => {
      const ms = Date.now() - started;
      this.usage.inc('api.requests');
      this.usage.inc(`api.requests.${moduleOf(req.path)}`);
      // The route's template, never the real path: a path would grow without
      // bound and would store entry numbers and tokens in the usage table.
      const template = (req.route as { path?: string } | undefined)?.path;
      if (template) {
        const route = `${req.method} ${template.replace(/^\/v1/, '')}`;
        this.usage.inc(`api.route.${route}`);
        // Its own time too, so the slow routes can be told from the busy ones.
        this.usage.inc(`api.route_ms.${route}`, ms);
      }
      this.usage.inc('api.latency_ms.sum', ms);
      this.usage.max('api.latency_ms.max', ms);
      if (status >= 500) this.usage.inc('api.errors.5xx');
      else if (status === 403) this.usage.inc('api.errors.403');
      else if (status >= 400) this.usage.inc('api.errors.4xx');
      if (this.auth.isImpersonating) this.usage.inc('impersonation.views');
      this.usage.touchActiveUser();
    };

    return next.handle().pipe(
      tap({
        next: () => record(res.statusCode),
        error: (err: { status?: number }) => record(err?.status ?? 500),
      }),
    );
  }
}

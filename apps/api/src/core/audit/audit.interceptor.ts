import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { tap } from 'rxjs';
import type { Request, Response } from 'express';
import { RequestAuth } from '../context/request-auth.js';
import { AuditService } from './audit.service.js';

/**
 * While someone is viewing as another person, every page they open is
 * recorded: the method, the route and how long it took. That is what makes the
 * dev console's view-as log able to say exactly what was looked at.
 *
 * Outside an impersonation this does nothing. Ordinary changes are logged by
 * the services that make them, which know what actually changed.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly auth: RequestAuth,
    private readonly audit: AuditService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler) {
    if (!this.auth.isImpersonating) return next.handle();

    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const started = Date.now();
    const route = (req.route as { path?: string } | undefined)?.path ?? req.path;

    return next.handle().pipe(
      tap({
        next: () => this.log(req.method, route, res.statusCode, started),
        error: (err: { status?: number }) =>
          this.log(req.method, route, err?.status ?? 500, started),
      }),
    );
  }

  private log(method: string, path: string, status: number, started: number) {
    void this.audit.recordNow({
      action: 'impersonation.view',
      meta: { method, path, status, durationMs: Date.now() - started },
    });
  }
}

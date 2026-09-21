import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ErrorCode } from '@irca/shared';
import { AppConfig } from '../../config/app-config.js';
import { AppError } from '../http/app-error.js';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
const CLIENTS = new Set(['portal', 'registration']);

/**
 * Stops another site from making a signed-in browser change something here.
 *
 * Every write must carry X-IRCA-Client, a header a cross-site form cannot set,
 * and when the browser says where the request came from, that must be the
 * portal. Together with the SameSite=Lax session cookie this closes CSRF.
 * Server-to-server calls (the registration form's server) send the header and
 * no Origin, which is allowed.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly config: AppConfig) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (SAFE.has(req.method)) return true;

    const client = req.get('x-irca-client');
    const origin = req.get('origin');
    const originOk = !origin || origin === new URL(this.config.get('PORTAL_ORIGIN')).origin;

    if (!client || !CLIENTS.has(client) || !originOk) {
      throw new AppError(
        403,
        ErrorCode.CSRF_REJECTED,
        'This request was refused. Reload the page and try again.',
      );
    }
    return true;
  }
}

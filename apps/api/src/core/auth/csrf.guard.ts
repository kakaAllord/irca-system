import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ErrorCode } from '@irca/shared';
import { AppConfig } from '../../config/app-config.js';
import { AppError } from '../http/app-error.js';
import { CALLED_BY_PROVIDER } from './decorators.js';

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
  constructor(
    private readonly config: AppConfig,
    private readonly reflector: Reflector,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (SAFE.has(req.method)) return true;
    // A provider's callback carries no cookie, so there is nothing to forge;
    // it proves itself with its own secret instead.
    if (
      this.reflector.getAllAndOverride<boolean>(CALLED_BY_PROVIDER, [
        ctx.getHandler(),
        ctx.getClass(),
      ])
    ) {
      return true;
    }

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

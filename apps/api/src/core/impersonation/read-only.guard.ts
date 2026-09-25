import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ErrorCode } from '@irca/shared';
import { AppError } from '../http/app-error.js';
import { RequestAuth } from '../context/request-auth.js';
import { ALLOW_WHILE_IMPERSONATING } from './decorators.js';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Refuses changes while the request is viewing as someone else.
 *
 * Viewing as someone is always read-only. This is the second of the two layers
 * that keep it so: above it, the portal never shows the buttons, because an
 * impersonated request is given only read permissions.
 */
@Injectable()
export class ReadOnlyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: RequestAuth,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (SAFE.has(req.method)) return true;

    if (this.auth.isImpersonating) {
      if (
        this.reflector.getAllAndOverride<boolean>(ALLOW_WHILE_IMPERSONATING, [
          ctx.getHandler(),
          ctx.getClass(),
        ])
      ) {
        return true;
      }
      throw new AppError(
        403,
        ErrorCode.IMPERSONATION_READ_ONLY,
        'You are viewing as someone else. Stop viewing to make changes.',
      );
    }

    return true;
  }
}

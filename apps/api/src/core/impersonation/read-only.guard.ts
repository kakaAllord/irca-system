import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ErrorCode } from '@irca/shared';
import { AppError } from '../http/app-error.js';
import { RequestAuth } from '../context/request-auth.js';
import { PlacementService } from '../database/placement.service.js';
import { ALLOW_WHILE_IMPERSONATING } from './decorators.js';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Refuses changes when the request must not make any.
 *
 * Two reasons: the request is impersonating (viewing as someone is always
 * read-only), or the church's records are being moved to another database and
 * are paused for a few minutes.
 *
 * This is the middle of the three layers that keep impersonation read-only.
 * Above it, the portal never shows the buttons, because an impersonated
 * request is given only read permissions. Below it, the database connection
 * itself can only read.
 */
@Injectable()
export class ReadOnlyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: RequestAuth,
    private readonly placements: PlacementService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
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

    if (churchId) {
      const placement = await this.placements.forChurch(churchId);
      if (placement.state === 'MOVING') {
        throw new AppError(
          503,
          ErrorCode.SERVICE_UNAVAILABLE,
          "Your church's data is being moved. Changes are paused for a few minutes.",
        );
      }
    }
    return true;
  }
}

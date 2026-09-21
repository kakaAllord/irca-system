import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import type { Request } from 'express';
import { ErrorCode } from '@irca/shared';
import { AppConfig } from '../../config/app-config.js';
import { AppError } from '../http/app-error.js';
import type { RequestContext } from '../context/request-context.js';
import { IS_PUBLIC } from './decorators.js';
import { SessionService } from './session.service.js';

/**
 * Who is asking. Runs on every request, public routes included, so that
 * sign-in knows when someone is already signed in and everything downstream
 * (logs, audit, usage) knows who the request was for.
 *
 * Refuses a non-public route without a live session. Whether that person may
 * do this particular thing is the permission guard's question (Phase 2).
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly config: AppConfig,
    private readonly reflector: Reflector,
    private readonly cls: ClsService<RequestContext>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const token: unknown = req.cookies?.[this.config.get('SESSION_COOKIE_NAME')];
    const resolved = typeof token === 'string' && token ? await this.sessions.resolve(token) : null;

    if (resolved) {
      this.cls.set('sessionId', resolved.session.id);
      this.cls.set('userId', resolved.user.id);
      // Phase 2 sets the actor apart from the subject while impersonating.
      this.cls.set('actorUserId', resolved.user.id);
      this.cls.set('churchId', resolved.session.activeChurchId);
      this.cls.set('platformRole', resolved.user.platformRole);
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;
    if (!resolved) throw new AppError(401, ErrorCode.UNAUTHENTICATED, 'Please sign in.');
    return true;
  }
}

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import type { Request } from 'express';
import { ErrorCode } from '@irca/shared';
import { AppConfig } from '../../config/app-config.js';
import { AppError } from '../http/app-error.js';
import type { RequestContext } from '../context/request-context.js';
import { PermissionResolver } from '../rbac/permission-resolver.service.js';
import { ImpersonationService } from '../impersonation/impersonation.service.js';
import { IS_PUBLIC } from './decorators.js';
import { SessionService } from './session.service.js';

/**
 * Who is asking, and what they may do.
 *
 * Runs on every request, public routes included, so sign-in knows when
 * someone is already signed in and logs, audit and usage all know who the
 * request was for.
 *
 * While an impersonation is running, the request acts as the **subject**: their
 * id, their church, their permissions, minus everything that changes anything.
 * The actor is kept separately, and that pair is what every audit row records.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly config: AppConfig,
    private readonly reflector: Reflector,
    private readonly cls: ClsService<RequestContext>,
    private readonly permissions: PermissionResolver,
    private readonly impersonation: ImpersonationService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const token: unknown = req.cookies?.[this.config.get('SESSION_COOKIE_NAME')];
    const resolved = typeof token === 'string' && token ? await this.sessions.resolve(token) : null;

    if (resolved) {
      const { session, user } = resolved;
      this.cls.set('sessionId', session.id);
      this.cls.set('actorUserId', user.id);

      const impersonation = await this.impersonation.forSession(session);
      if (impersonation) {
        const subject = await this.sessions.userById(impersonation.subjectUserId);
        this.cls.set('userId', impersonation.subjectUserId);
        this.cls.set('churchId', impersonation.churchId);
        this.cls.set('impersonationId', impersonation.id);
        // A dev viewing as a clerk is a clerk: no platform powers come along.
        this.cls.set('platformRole', subject?.platformRole ?? 'NONE');
        this.cls.set(
          'permissions',
          this.permissions.readOnly(
            await this.permissions.forMember(impersonation.subjectUserId, impersonation.churchId),
          ),
        );
      } else {
        this.cls.set('userId', user.id);
        this.cls.set('churchId', session.activeChurchId);
        this.cls.set('platformRole', user.platformRole);
        this.cls.set(
          'permissions',
          await this.permissions.forSignedIn(user.id, user.platformRole, session.activeChurchId),
        );
      }
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

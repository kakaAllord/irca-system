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
import { PUBLIC_CLIENT_KEY } from '../rbac/decorators.js';
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
        this.cls.set('userId', impersonation.subjectUserId);
        this.cls.set('impersonationId', impersonation.id);
        // Viewing as a clerk is being a clerk, with reading only.
        this.cls.set(
          'permissions',
          this.permissions.readOnly(
            await this.permissions.forUser(impersonation.subjectUserId),
          ),
        );
      } else {
        this.cls.set('userId', user.id);
        this.cls.set(
          'permissions',
          await this.permissions.forUser(user.id),
        );
      }
    }

    const targets = [ctx.getHandler(), ctx.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets);
    // A church's own app has a key rather than a session; its own guard has
    // already said which church, and there is no person to find.
    const byClient = this.reflector.getAllAndOverride<string>(PUBLIC_CLIENT_KEY, targets);
    if (isPublic || byClient) return true;
    if (!resolved) throw new AppError(401, ErrorCode.UNAUTHENTICATED, 'Please sign in.');
    return true;
  }
}

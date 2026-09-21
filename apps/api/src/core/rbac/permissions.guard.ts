import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '@irca/shared';
import { AppError } from '../http/app-error.js';
import { RequestAuth } from '../context/request-auth.js';
import { AUTHENTICATED_ONLY, IS_PUBLIC } from '../auth/decorators.js';
import { PERMISSIONS_KEY, PUBLIC_CLIENT_KEY, type PermissionRule } from './decorators.js';

/**
 * Whether this person may do this particular thing.
 *
 * Runs after the session guard (who) and the read-only guard (is this a change
 * during an impersonation). A route that asks for a permission and does not
 * get it is refused with what was needed, and never with what the person has.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: RequestAuth,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    if (this.reflector.getAllAndOverride<boolean>(AUTHENTICATED_ONLY, targets)) return true;
    if (this.reflector.getAllAndOverride<string>(PUBLIC_CLIENT_KEY, targets)) return true;

    const rule = this.reflector.getAllAndOverride<PermissionRule>(PERMISSIONS_KEY, targets);
    // A route with no rule at all never reaches here: the API refuses to start
    // with one (RouteAudit). This is the belt to that braces.
    if (!rule) throw new AppError(403, ErrorCode.FORBIDDEN, 'You do not have access to this.');

    const required = rule.all ?? rule.any ?? [];
    const platformOnly = required.every((key) => key.startsWith('platform.'));
    if (!platformOnly && !this.auth.churchId) {
      throw new AppError(403, ErrorCode.FORBIDDEN, 'Choose a church first.');
    }

    const ok = rule.all
      ? rule.all.every((k) => this.auth.has(k))
      : rule.any!.some((k) => this.auth.has(k));
    if (!ok) {
      throw new AppError(403, ErrorCode.FORBIDDEN, 'You do not have access to this.', { required });
    }
    return true;
  }
}

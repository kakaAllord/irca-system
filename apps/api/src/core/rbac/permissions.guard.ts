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
    const held = required.filter((key) => this.auth.has(key));
    const satisfied = rule.all ? held.length === required.length : held.length > 0;
    if (!satisfied) {
      throw new AppError(403, ErrorCode.FORBIDDEN, 'You do not have access to this.', { required });
    }

    // A church is needed only when the permission being used is a church's.
    // A dev acting on the platform has no church, and must not be asked for one.
    const usesChurchPermission = held.some((key) => !key.startsWith('platform.'));
    if (usesChurchPermission && !this.auth.churchId) {
      throw new AppError(403, ErrorCode.FORBIDDEN, 'Choose a church first.');
    }

    return true;
  }
}

import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { ErrorCode } from '@irca/shared';
import { AppError } from '../http/app-error.js';
import type { RequestContext } from './request-context.js';

/**
 * Who this request is for, and what it may do. The only way anything outside
 * core reads the request context, so nothing has to know about CLS.
 */
@Injectable()
export class RequestAuth {
  constructor(private readonly cls: ClsService<RequestContext>) {}

  /** The subject: the person the request acts as (the impersonated one, while impersonating). */
  get userId(): string | null {
    return this.cls.get('userId');
  }

  /** The real person at the keyboard. Differs from userId only while impersonating. */
  get actorUserId(): string | null {
    return this.cls.get('actorUserId');
  }

  get churchId(): string | null {
    return this.cls.get('churchId');
  }

  get isImpersonating(): boolean {
    return this.cls.get('impersonationId') !== null;
  }

  get impersonationId(): string | null {
    return this.cls.get('impersonationId');
  }

  get isDev(): boolean {
    return this.cls.get('platformRole') === 'DEV';
  }

  get permissions(): ReadonlySet<string> {
    return this.cls.get('permissions');
  }

  has(permission: string): boolean {
    return this.permissions.has(permission);
  }

  hasAny(...permissions: string[]): boolean {
    return permissions.some((p) => this.has(p));
  }

  /** For checks inside a handler, e.g. whether to include a sensitive field. */
  require(permission: string): void {
    if (!this.has(permission)) {
      throw new AppError(403, ErrorCode.FORBIDDEN, 'You do not have access to this.', {
        required: [permission],
      });
    }
  }

  /** The church, or a 403 explaining that one must be chosen first. */
  requireChurch(): string {
    const churchId = this.churchId;
    if (!churchId) throw new AppError(403, ErrorCode.FORBIDDEN, 'Choose a church first.');
    return churchId;
  }
}

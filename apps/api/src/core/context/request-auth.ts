import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { ErrorCode } from '@irca/shared';
import { AppError } from '../http/app-error.js';
import type { RequestContext } from './request-context.js';

/**
 * Who this request is for, and what it may do. The only way anything outside
 * core reads the request context, so nothing has to know about CLS.
 *
 * There is no church here. This system serves one, so every row in the
 * database is already its own; a second church gets its own deployment.
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

  get isImpersonating(): boolean {
    return this.cls.get('impersonationId') !== null;
  }

  get impersonationId(): string | null {
    return this.cls.get('impersonationId');
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
}

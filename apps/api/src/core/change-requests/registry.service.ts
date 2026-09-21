import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@irca/shared';
import { AppError } from '../http/app-error.js';
import type { ChangeRequestHandler } from './handler.js';

/**
 * Which kinds of record can be changed by approval.
 *
 * Modules register themselves as they start, so core never imports a module.
 * A kind nobody registered is refused rather than guessed at, which is what
 * stops a made-up entityType from reaching the database.
 */
@Injectable()
export class ChangeRequestRegistry {
  private readonly handlers = new Map<string, ChangeRequestHandler>();

  register(handler: ChangeRequestHandler): void {
    this.handlers.set(handler.entityType, handler);
  }

  find(entityType: string): ChangeRequestHandler | undefined {
    return this.handlers.get(entityType);
  }

  require(entityType: string): ChangeRequestHandler {
    const handler = this.find(entityType);
    if (!handler) throw new AppError(404, ErrorCode.NOT_FOUND, 'Nothing like that can be changed.');
    return handler;
  }
}

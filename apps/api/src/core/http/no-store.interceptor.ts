import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Response } from 'express';

/**
 * Nothing this API answers may be cached anywhere shared: every answer is
 * about one person in one church. Vary on Cookie says the same thing to any
 * cache that ignores no-store.
 */
@Injectable()
export class NoStoreInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler) {
    const res = ctx.switchToHttp().getResponse<Response>();
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'Cookie');
    return next.handle();
  }
}

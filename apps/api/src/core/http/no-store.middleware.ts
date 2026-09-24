import type { NextFunction, Request, Response } from 'express';

/**
 * Nothing this API answers may be cached anywhere shared: every answer is
 * about one person. Vary on Cookie says the same thing to any cache that
 * ignores no-store.
 *
 * Middleware rather than an interceptor, because an interceptor only sees
 * requests that got past the guards: a refusal, a 404 or a sign-in that failed
 * would otherwise go out with no instruction at all.
 */
export function noStore(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Cookie');
  next();
}

import type { CookieOptions } from 'express';
import type { AppConfig } from '../../config/app-config.js';

/**
 * The session cookie's settings, in one place so setting and clearing it can
 * never disagree.
 *
 * No domain: the cookie is host-only, for the portal's own origin, which is
 * where the browser sends every API call (the portal rewrites /api here). In
 * production the name starts with __Host-, which browsers accept only when the
 * cookie is secure, has path=/ and no domain, so a subdomain cannot plant one.
 */
export function sessionCookieOptions(config: AppConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: config.get('SESSION_ABSOLUTE_HOURS') * 3_600_000,
  };
}

export function clearedSessionCookieOptions(config: AppConfig): CookieOptions {
  const { maxAge: _maxAge, ...rest } = sessionCookieOptions(config);
  return rest;
}

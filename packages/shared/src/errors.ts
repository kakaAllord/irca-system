/**
 * Every error code the API can send and the portal knows how to show.
 *
 * Codes rather than messages, so the portal can react to what happened (send
 * someone to the sign-in page, show a field error, say "viewing as someone
 * else") without parsing English. Phases add codes here as they need them.
 */
export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  FORBIDDEN: 'FORBIDDEN',
  IMPERSONATION_READ_ONLY: 'IMPERSONATION_READ_ONLY',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  CSRF_REJECTED: 'CSRF_REJECTED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** The one error shape the API ever returns. */
export type ApiError = {
  error: { code: ErrorCode; message: string; details?: unknown };
  requestId: string;
};

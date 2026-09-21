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
  INVITATION_INVALID: 'INVITATION_INVALID',
  ROLE_NOT_AVAILABLE: 'ROLE_NOT_AVAILABLE',
  ALREADY_MEMBER: 'ALREADY_MEMBER',
  ALREADY_INVITED: 'ALREADY_INVITED',
  MEMBER_DISABLED: 'MEMBER_DISABLED',
  LAST_ADMIN: 'LAST_ADMIN',
  SYSTEM_ROLE: 'SYSTEM_ROLE',
  ROLE_IN_USE: 'ROLE_IN_USE',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  SIMILAR_EXISTS: 'SIMILAR_EXISTS',
  ITEM_NOT_AVAILABLE: 'ITEM_NOT_AVAILABLE',
  REQUEST_ALREADY_OPEN: 'REQUEST_ALREADY_OPEN',
  CANNOT_DECIDE_OWN_REQUEST: 'CANNOT_DECIDE_OWN_REQUEST',
  REQUEST_STALE: 'REQUEST_STALE',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** The one error shape the API ever returns. */
export type ApiError = {
  error: { code: ErrorCode; message: string; details?: unknown };
  requestId: string;
};

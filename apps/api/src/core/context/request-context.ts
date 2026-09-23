import type { ClsStore } from 'nestjs-cls';

/**
 * What the API knows about the request being served, available anywhere
 * through ClsService without being passed down every call.
 *
 * The session guard sets who, impersonation sets the actor, and the permission
 * guard the permissions. Feature code reads this through RequestAuth, never
 * directly.
 */
export interface RequestContext extends ClsStore {
  ip: string | null;
  userAgent: string | null;
  sessionId: string | null;
  /** The subject: who the request acts as. */
  userId: string | null;
  /** The real person. Differs from userId only while impersonating. */
  actorUserId: string | null;
  impersonationId: string | null;
  permissions: ReadonlySet<string>;
  /** Set when the registration form is calling with its key, instead of a person. */
  apiClientId: string | null;
}

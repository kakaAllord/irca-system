import type { ClsStore } from 'nestjs-cls';

/**
 * What the API knows about the request being served, available anywhere
 * through ClsService without being passed down every call.
 *
 * Most fields are filled by later steps: the session guard sets who and which
 * church, impersonation sets the actor, the permission guard the permissions.
 * Feature code reads this through RequestAuth (Phase 2), never directly.
 */
export interface RequestContext extends ClsStore {
  ip: string | null;
  userAgent: string | null;
  sessionId: string | null;
  /** The subject: who the request acts as. */
  userId: string | null;
  /** The real person. Differs from userId only while impersonating. */
  actorUserId: string | null;
  churchId: string | null;
  impersonationId: string | null;
  permissions: ReadonlySet<string>;
  platformRole: 'NONE' | 'DEV' | null;
}

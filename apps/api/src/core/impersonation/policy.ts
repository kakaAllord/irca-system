import type { Church, ChurchMembership, User } from '../../generated/prisma/client.js';

export type ImpersonationCandidate = {
  subject: Pick<User, 'id' | 'status' | 'platformRole'>;
  membership: Pick<ChurchMembership, 'status'> | null;
  church: Pick<Church, 'status'> | null;
};

/**
 * Who may view as whom (docs/plan/00-decisions.md, D6 and D16).
 *
 * Returns null when it is allowed, or the reason why not, which the API turns
 * into a message and the portal uses to hide the button.
 */
export function impersonationRefusal(
  actor: {
    id: string;
    isDev: boolean;
    canImpersonateHere: boolean;
    alreadyImpersonating: boolean;
    churchId: string | null;
  },
  churchId: string,
  candidate: ImpersonationCandidate,
): string | null {
  if (actor.alreadyImpersonating) return 'You are already viewing as someone else.';
  if (actor.id === candidate.subject.id) return 'You cannot view as yourself.';
  if (candidate.subject.platformRole === 'DEV') return 'Platform accounts cannot be viewed as.';
  if (candidate.subject.status !== 'ACTIVE')
    return 'That person has not accepted their invitation, or is disabled.';
  if (!candidate.membership || candidate.membership.status !== 'ACTIVE') {
    return 'That person does not have access to this church.';
  }

  if (actor.isDev) {
    // A dev may look into a suspended church: that is when it is needed most.
    return candidate.church ? null : 'That church does not exist.';
  }
  if (!actor.canImpersonateHere) return 'You do not have access to this.';
  if (actor.churchId !== churchId) return 'You can only view as people in your own church.';
  if (candidate.church?.status !== 'ACTIVE') return "This church's account is paused.";
  return null;
}

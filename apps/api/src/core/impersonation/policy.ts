import type { User } from '../../generated/prisma/client.js';

export type ImpersonationCandidate = {
  subject: Pick<User, 'id' | 'status'>;
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
    canImpersonate: boolean;
    alreadyImpersonating: boolean;
  },
  candidate: ImpersonationCandidate,
): string | null {
  if (actor.alreadyImpersonating) return 'You are already viewing as someone else.';
  if (actor.id === candidate.subject.id) return 'You cannot view as yourself.';
  if (candidate.subject.status !== 'ACTIVE')
    return 'That person has not accepted their invitation, or is disabled.';
  if (!actor.canImpersonate) return 'You do not have access to this.';
  return null;
}

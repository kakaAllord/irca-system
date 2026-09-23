import { ErrorCode } from '@irca/shared';
import type { PersonStage } from '../../generated/prisma/client.js';
import type { Tx } from '../../core/database/db.service.js';
import { AppError } from '../../core/http/app-error.js';

/** The journey, in order: from first visit to confirmed member. */
export const STAGES: PersonStage[] = [
  'VISITOR',
  'NEW_CONVERT',
  'FOUNDATION_CLASS',
  'AWAITING_BAPTISM',
  'MEMBERSHIP_REVIEW',
  'CONFIRMED_MEMBER',
];

/** Reached only through an application the pastors decide, never by hand. */
const BY_APPLICATION_ONLY = new Set<PersonStage>(['MEMBERSHIP_REVIEW', 'CONFIRMED_MEMBER']);

/**
 * Whether the office may move someone from one stage to another by hand.
 *
 * One step on, or one step back with a note. Skipping ahead would make the
 * journey say something that did not happen, and the last two stages are the
 * pastors' decision, so they are entered through Applications.
 */
export function checkManualMove(from: PersonStage, to: PersonStage, note?: string): void {
  const a = STAGES.indexOf(from);
  const b = STAGES.indexOf(to);
  const forward = b === a + 1 && !BY_APPLICATION_ONLY.has(to);
  const back = b === a - 1 && !BY_APPLICATION_ONLY.has(from);
  if (back && !note?.trim()) {
    throw new AppError(
      422,
      ErrorCode.STAGE_MOVE_NOT_ALLOWED,
      'Say why they are going back a step.',
    );
  }
  if (!forward && !back) {
    throw new AppError(
      422,
      ErrorCode.STAGE_MOVE_NOT_ALLOWED,
      BY_APPLICATION_ONLY.has(to)
        ? 'Membership review and confirmation happen through Applications.'
        : 'People move one step at a time.',
    );
  }
}

/**
 * Moves a person and writes the move down, so "when did she join the class"
 * always has an answer. Every stage change goes through here.
 */
export async function moveStage(
  tx: Tx,
  person: { id: string; churchId: string; stage: PersonStage },
  to: PersonStage,
  by: string | null,
  note?: string,
): Promise<void> {
  if (person.stage === to) return;
  await tx.person.update({
    where: { id: person.id },
    data: { stage: to },
  });
  await tx.personStageEvent.create({
    data: {
      fromStage: person.stage,
      toStage: to,
      byId: by,
      note: note?.slice(0, 300) || null,
    },
  });
}

/** The stage someone was at before the latest move, for undoing a rejection. */
export async function previousStage(
  tx: Tx,
  personId: string,
): Promise<PersonStage | null> {
  const last = await tx.personStageEvent.findFirst({
    where: { personId },
    orderBy: { at: 'desc' },
  });
  return last?.fromStage ?? null;
}

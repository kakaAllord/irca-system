import type { InteractionKind, Prisma } from '../../generated/prisma/client.js';
import type { Tx } from '../../core/database/db.service.js';

export type Interaction = {
  personId: string;
  kind: InteractionKind;
  /** The portal recording it: 'membership', 'outreach'. */
  moduleKey: string;
  /** The staff account that recorded it, or null when the system did. */
  byId: string | null;
  /**
   * One line in plain words. Everyone who may see the person in any portal
   * reads it, so it never carries what Membership keeps behind its sensitive
   * permission: "Phone call", never what was said on it.
   */
  summary: string;
  /** When it happened, when that is not now: a Saturday typed up on Monday. */
  at?: Date;
  meta?: Prisma.InputJsonObject;
};

/**
 * Adds one thing that happened to a person's timeline (D23).
 *
 * Called inside the same transaction as the change it describes, so a
 * timeline never says something happened that was rolled back, and nothing
 * happens without its line. The application can only ever add to it: update
 * and delete are revoked in the database.
 */
export async function recordInteraction(tx: Tx, input: Interaction): Promise<void> {
  await tx.personInteraction.create({
    data: {
      personId: input.personId,
      kind: input.kind,
      moduleKey: input.moduleKey,
      byId: input.byId,
      summary: input.summary.slice(0, 200),
      at: input.at ?? new Date(),
      meta: input.meta ?? {},
    },
  });
}

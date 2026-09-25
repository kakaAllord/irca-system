import { moduleByKey } from '@irca/shared';
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

export type TimelineLine = {
  id: string;
  kind: InteractionKind;
  at: string;
  /** The portal that recorded it, by the name staff see: "Outreach", "Membership". */
  portal: string;
  /** The staff member who recorded it, or null when the system did. */
  by: string | null;
  summary: string;
};

/**
 * A person's timeline, oldest first, the way the owner's own example reads:
 * evangelised, called, visited, came. One query serves both portals that show
 * it (08 step 8.6); each checks first that the reader may see this person.
 */
export async function readTimeline(
  db: Pick<Tx, 'personInteraction' | 'user'>,
  personId: string,
): Promise<TimelineLine[]> {
  const rows = await db.personInteraction.findMany({
    where: { personId },
    orderBy: [{ at: 'asc' }, { id: 'asc' }],
    take: 500,
  });
  const byIds = [...new Set(rows.map((r) => r.byId).filter((id): id is string => !!id))];
  const users = await db.user.findMany({
    where: { id: { in: byIds } },
    select: { id: true, fullName: true },
  });
  const nameOf = new Map(users.map((u) => [u.id, u.fullName]));
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    at: r.at.toISOString(),
    portal: moduleByKey(r.moduleKey)?.name ?? r.moduleKey,
    by: r.byId ? (nameOf.get(r.byId) ?? null) : null,
    summary: r.summary,
  }));
}

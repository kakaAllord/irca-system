import { Injectable, type OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Tx } from '../../core/database/db.service.js';
import { notFound } from '../../core/http/app-error.js';
import { AudienceRegistry, type AudienceMember } from '../../core/comms/audience.registry.js';

/** People matching this, as an audience sees them. */
async function people(tx: Tx, where: Prisma.PersonWhereInput): Promise<AudienceMember[]> {
  const rows = await tx.person.findMany({
    where,
    select: { id: true, fullName: true, dial: true, phone: true, lang: true, smsOptOut: true },
    orderBy: { fullName: 'asc' },
  });
  return rows.map((p) => ({
    personId: p.id,
    name: p.fullName,
    dial: p.dial,
    phone: p.phone,
    lang: p.lang,
    optedOut: p.smsOptOut,
  }));
}

/**
 * The audiences Membership knows: the whole church, its confirmed members,
 * and the foundation class. All three reach beyond any one department, so
 * Communications sends to them and a department only once granted (D21).
 */
@Injectable()
export class MembershipAudiences implements OnModuleInit {
  constructor(private readonly registry: AudienceRegistry) {}

  onModuleInit(): void {
    this.registry.register({
      key: 'church.people',
      label: 'Everyone in People',
      description: 'Every person the church has a record of: visitors, new converts and members.',
      scope: 'church',
      params: z.object({}),
      describe: async () => 'Everyone in People',
      resolve: (tx) => people(tx, {}),
    });

    this.registry.register({
      key: 'church.members',
      label: 'Confirmed members',
      description: 'Everyone the pastors have confirmed as a member of the church.',
      scope: 'church',
      params: z.object({}),
      describe: async () => 'Confirmed members',
      resolve: (tx) => people(tx, { stage: 'CONFIRMED_MEMBER' }),
    });

    const Class = z.object({ groupId: z.uuid().optional() });
    this.registry.register<z.infer<typeof Class>>({
      key: 'membership.class',
      label: 'The foundation class',
      description: 'People in a foundation class group now, in every group or in one.',
      scope: 'church',
      params: Class,
      describe: async (tx, { groupId }) => {
        if (!groupId) return 'Everyone in the foundation class';
        const group = await tx.foundationGroup.findUnique({ where: { id: groupId } });
        if (!group) throw notFound('There is no such foundation class group.');
        return `The foundation class: ${group.name}`;
      },
      resolve: (tx, { groupId }) =>
        people(tx, {
          enrollments: {
            some: { completedAt: null, droppedAt: null, ...(groupId ? { groupId } : {}) },
          },
        }),
    });
  }
}

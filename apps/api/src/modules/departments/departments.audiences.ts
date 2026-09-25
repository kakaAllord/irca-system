import { Injectable, type OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import type { Tx } from '../../core/database/db.service.js';
import { notFound } from '../../core/http/app-error.js';
import { AudienceRegistry, type AudienceMember } from '../../core/comms/audience.registry.js';

const Ids = z.array(z.uuid()).min(1, 'Choose at least one department').max(100);

/** "Praise team", "Praise team and Choir", "4 departments". */
function named(names: string[]): string {
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.length} departments`;
}

/** The chosen departments, all of which must exist and not be archived. */
async function departments(tx: Tx, ids: string[]) {
  const unique = [...new Set(ids)];
  const found = await tx.department.findMany({
    where: { id: { in: unique }, archivedAt: null },
    orderBy: { name: 'asc' },
  });
  if (found.length !== unique.length) {
    throw notFound('One of those departments does not exist, or is archived.');
  }
  return found;
}

const person = {
  select: { id: true, fullName: true, dial: true, phone: true, lang: true, smsOptOut: true },
} as const;

const asMember = (p: {
  id: string;
  fullName: string;
  dial: string;
  phone: string;
  lang: string;
  smsOptOut: boolean;
}): AudienceMember => ({
  personId: p.id,
  name: p.fullName,
  dial: p.dial,
  phone: p.phone,
  lang: p.lang,
  optedOut: p.smsOptOut,
});

/**
 * A department's own people (D28): everyone in it, leaders and members, or
 * only its leaders. Communications may send to any departments, and to every
 * leader at once; a department's leaders to their own department only. A
 * leader is reached on their person record's phone, like anyone else.
 */
@Injectable()
export class DepartmentAudiences implements OnModuleInit {
  constructor(private readonly registry: AudienceRegistry) {}

  onModuleInit(): void {
    const Everyone = z.object({ departmentIds: Ids });
    this.registry.register<z.infer<typeof Everyone>>({
      key: 'departments.everyone',
      label: 'Everyone in a department',
      description: 'The leaders and members of the departments chosen.',
      scope: 'department',
      params: Everyone,
      departmentsOf: (p) => p.departmentIds,
      describe: async (tx, p) =>
        `Everyone in ${named((await departments(tx, p.departmentIds)).map((d) => d.name))}`,
      resolve: async (tx, p) => {
        const ids = (await departments(tx, p.departmentIds)).map((d) => d.id);
        const [leaders, members] = await Promise.all([
          tx.departmentLeader.findMany({
            where: { departmentId: { in: ids }, endedAt: null },
            include: { person: person },
          }),
          tx.departmentMember.findMany({
            where: { departmentId: { in: ids }, endedAt: null },
            include: { person: person },
          }),
        ]);
        return [...leaders, ...members].map((row) => asMember(row.person));
      },
    });

    const Leaders = z.object({ departmentIds: Ids.optional() });
    this.registry.register<z.infer<typeof Leaders>>({
      key: 'departments.leaders',
      label: 'Department leaders',
      description: 'The leaders of every department, or of the departments chosen.',
      scope: 'department',
      params: Leaders,
      departmentsOf: (p) => p.departmentIds ?? 'all',
      describe: async (tx, p) =>
        p.departmentIds
          ? `Leaders of ${named((await departments(tx, p.departmentIds)).map((d) => d.name))}`
          : 'Every department leader',
      resolve: async (tx, p) => {
        const ids = p.departmentIds
          ? (await departments(tx, p.departmentIds)).map((d) => d.id)
          : null;
        const leaders = await tx.departmentLeader.findMany({
          where: {
            endedAt: null,
            department: { archivedAt: null },
            ...(ids ? { departmentId: { in: ids } } : {}),
          },
          include: { person: person },
        });
        return leaders.map((row) => asMember(row.person));
      },
    });
  }
}

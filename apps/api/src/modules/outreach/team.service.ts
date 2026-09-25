import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@irca/shared';
import { Db, type Tx } from '../../core/database/db.service.js';
import { AppError, notFound } from '../../core/http/app-error.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { DepartmentsService } from '../departments/departments.service.js';

export type GroupInput = { name: string; personIds: string[] };

/** Enough of a phone number to tell two Johns apart, as My departments shows it. */
const phoneTail = (phone: string) => (phone.length >= 3 ? `…${phone.slice(-3)}` : '');

/** How far back "Saturdays out" looks, in days: a season, not a lifetime. */
const RECENT_DAYS = 91;
/** How many trainings a person's attendance is counted over (08 step 8.7). */
const RECENT_TRAININGS = 12;

/**
 * Outreach's team, and the partner groups made from it.
 *
 * The team is not kept here. It is the Outreach department's leaders and
 * members now (D28), kept by its leaders in My departments; this service only
 * reads it, and checks against it that a partner group is made of people on
 * the team. Groups are switched off, never deleted, because the Saturdays
 * they went out on point at them.
 */
@Injectable()
export class TeamService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly departments: DepartmentsService,
  ) {}

  /** The department this portal belongs to. Switching Outreach on needs one. */
  async department(tx: Pick<Tx, 'department'> = this.db.client) {
    const department = await tx.department.findFirst({
      where: { moduleKey: 'outreach', archivedAt: null },
    });
    if (!department) {
      throw notFound('Outreach belongs to no department yet. Give it one in Admin → Departments.');
    }
    return department;
  }

  /** The ids of everyone on the team now: its leaders and its members. */
  async teamIds(tx: Tx, departmentId: string): Promise<Set<string>> {
    const [leaders, members] = await Promise.all([
      tx.departmentLeader.findMany({
        where: { departmentId, endedAt: null },
        select: { personId: true },
      }),
      tx.departmentMember.findMany({
        where: { departmentId, endedAt: null },
        select: { personId: true },
      }),
    ]);
    return new Set([...leaders, ...members].map((r) => r.personId));
  }

  async team() {
    const department = await this.department();
    const since = new Date(Date.now() - RECENT_DAYS * 86_400_000);
    const [leaders, members, groups, outings, trainings] = await Promise.all([
      this.db.client.departmentLeader.findMany({
        where: { departmentId: department.id, endedAt: null },
        include: { person: true },
        orderBy: { addedAt: 'asc' },
      }),
      this.db.client.departmentMember.findMany({
        where: { departmentId: department.id, endedAt: null },
        include: { person: true },
        orderBy: { person: { fullName: 'asc' } },
      }),
      this.db.client.outreachGroup.findMany({
        include: {
          members: {
            include: { person: { select: { id: true, fullName: true } } },
            orderBy: { addedAt: 'asc' },
          },
        },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      }),
      this.db.client.outreachSessionTeamMember.groupBy({
        by: ['personId'],
        where: { team: { session: { heldOn: { gte: since }, status: { not: 'CANCELLED' } } } },
        _count: { personId: true },
      }),
      this.db.client.outreachTraining.findMany({
        where: { heldAt: { lte: new Date() } },
        orderBy: { heldAt: 'desc' },
        take: RECENT_TRAININGS,
        include: { attendance: { select: { personId: true, mark: true } } },
      }),
    ]);

    const groupOf = new Map<string, string>();
    for (const g of groups.filter((g) => g.isActive)) {
      for (const m of g.members.filter((m) => !m.endedAt)) groupOf.set(m.personId, g.name);
    }
    const out = new Map(outings.map((o) => [o.personId, o._count.personId]));
    const attendance = (personId: string) => {
      const marks = trainings.flatMap((t) => t.attendance.filter((a) => a.personId === personId));
      return { attended: marks.filter((m) => m.mark === 'ATTENDED').length, of: marks.length };
    };
    const row = (
      p: { id: string; fullName: string; phone: string; stage: string },
      extra: { title: string | null; since: Date },
    ) => ({
      personId: p.id,
      name: p.fullName,
      stage: p.stage,
      phoneTail: phoneTail(p.phone),
      title: extra.title,
      since: extra.since.toISOString(),
      group: groupOf.get(p.id) ?? null,
      saturdays: out.get(p.id) ?? 0,
      training: attendance(p.id),
    });

    return {
      department: { id: department.id, name: department.name },
      // Only its leaders keep the team, in My departments; the page links there.
      youLead: await this.departments.leads(department.id),
      people: [
        ...leaders.map((l) => row(l.person, { title: l.title, since: l.addedAt })),
        ...members
          // Someone who leads and is also listed as a member is shown once, as a leader.
          .filter((m) => !leaders.some((l) => l.personId === m.personId))
          .map((m) => row(m.person, { title: null, since: m.addedAt })),
      ],
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        active: g.isActive,
        people: g.members
          .filter((m) => !m.endedAt)
          .map((m) => ({ personId: m.personId, name: m.person.fullName })),
        // Who was in it, from when until when: partnerships change, the past stays.
        history: g.members.map((m) => ({
          personId: m.personId,
          name: m.person.fullName,
          from: m.addedAt.toISOString(),
          to: m.endedAt?.toISOString() ?? null,
        })),
      })),
    };
  }

  async createGroup(input: GroupInput) {
    return this.db.tx(async (tx) => {
      const people = await this.checkGroup(tx, input, null);
      const group = await tx.outreachGroup.create({
        data: {
          name: input.name,
          members: { create: [...new Set(input.personIds)].map((personId) => ({ personId })) },
        },
      });
      await this.audit.recordIn(tx, {
        action: 'outreach.group.created',
        entityType: 'outreach_group',
        entityId: group.id,
        summary: `Made the partner group ${group.name}: ${people.join(', ')}`,
      });
      return { id: group.id };
    });
  }

  async updateGroup(id: string, input: GroupInput) {
    await this.db.tx(async (tx) => {
      const before = await tx.outreachGroup.findUnique({ where: { id } });
      if (!before) throw notFound('No such partner group.');
      const people = await this.checkGroup(tx, input, id);
      await tx.outreachGroup.update({ where: { id }, data: { name: input.name } });
      // Whoever left is ended and whoever joined is started; those who stay
      // keep their row, so each person's time in the group reads unbroken.
      const wanted = new Set(input.personIds);
      const open = await tx.outreachGroupMember.findMany({
        where: { groupId: id, endedAt: null },
      });
      const now = new Date();
      await tx.outreachGroupMember.updateMany({
        where: { id: { in: open.filter((m) => !wanted.has(m.personId)).map((m) => m.id) } },
        data: { endedAt: now },
      });
      const staying = new Set(open.map((m) => m.personId));
      await tx.outreachGroupMember.createMany({
        data: [...wanted]
          .filter((personId) => !staying.has(personId))
          .map((personId) => ({ groupId: id, personId, addedAt: now })),
      });
      await this.audit.recordIn(tx, {
        action: 'outreach.group.updated',
        entityType: 'outreach_group',
        entityId: id,
        summary: `Changed the partner group ${input.name}: ${people.join(', ')}`,
        before: { name: before.name },
        after: { name: input.name },
      });
    });
  }

  async setGroupActive(id: string, active: boolean) {
    await this.db.tx(async (tx) => {
      const group = await tx.outreachGroup.findUnique({ where: { id } });
      if (!group) throw notFound('No such partner group.');
      if (group.isActive === active) return;
      await tx.outreachGroup.update({ where: { id }, data: { isActive: active } });
      const now = new Date();
      if (!active) {
        // A group switched off is a partnership ended: its people's rows end.
        await tx.outreachGroupMember.updateMany({
          where: { groupId: id, endedAt: null },
          data: { endedAt: now },
        });
      } else {
        // Brought back with the people it had when it was switched off, those
        // of them still on the team, from today.
        const last = await tx.outreachGroupMember.findFirst({
          where: { groupId: id, endedAt: { not: null } },
          orderBy: { endedAt: 'desc' },
        });
        if (last?.endedAt) {
          const department = await this.department(tx);
          const team = await this.teamIds(tx, department.id);
          const people = await tx.outreachGroupMember.findMany({
            where: { groupId: id, endedAt: last.endedAt },
          });
          await tx.outreachGroupMember.createMany({
            data: people
              .filter((m) => team.has(m.personId))
              .map((m) => ({ groupId: id, personId: m.personId, addedAt: now })),
          });
        }
      }
      await this.audit.recordIn(tx, {
        action: active ? 'outreach.group.restored' : 'outreach.group.retired',
        entityType: 'outreach_group',
        entityId: id,
        summary: `${active ? 'Brought back' : 'Switched off'} the partner group ${group.name}`,
      });
    });
  }

  /**
   * Two or three people, all on the team now, under a name no other group
   * has. Returns their names, for the activity log.
   */
  private async checkGroup(tx: Tx, input: GroupInput, exceptId: string | null) {
    const ids = [...new Set(input.personIds)];
    if (ids.length < 2 || ids.length > 3) {
      throw new AppError(
        422,
        ErrorCode.VALIDATION_FAILED,
        'A partner group is two or three people.',
        {
          personIds: ['Choose two or three'],
        },
      );
    }
    const department = await this.department(tx);
    const team = await this.teamIds(tx, department.id);
    const people = await tx.person.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullName: true },
    });
    const outside = ids.filter((id) => !team.has(id));
    if (outside.length || people.length !== ids.length) {
      const names = people.filter((p) => outside.includes(p.id)).map((p) => p.fullName);
      throw new AppError(
        422,
        ErrorCode.VALIDATION_FAILED,
        `${names.length ? names.join(' and ') : 'Someone chosen'} is not on the Outreach team. A leader adds people in My departments → ${department.name}.`,
        { personIds: ['Not on the team'] },
      );
    }
    const same = await tx.outreachGroup.findFirst({
      where: {
        name: { equals: input.name, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
    });
    if (same) {
      throw new AppError(
        409,
        ErrorCode.ALREADY_EXISTS,
        `There is already a group called ${same.name}.`,
        {
          name: ['Already used'],
        },
      );
    }
    return people.map((p) => p.fullName);
  }
}

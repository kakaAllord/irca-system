import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ErrorCode, moduleByKey, normalizeEmail } from '@irca/shared';
import type { PersonStage } from '../../generated/prisma/client.js';
import { Db, type Tx } from '../../core/database/db.service.js';
import { RequestAuth } from '../../core/context/request-auth.js';
import { AppError, notFound } from '../../core/http/app-error.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { UsageService } from '../../core/usage/usage.service.js';
import { InvitationService } from '../../core/invitations/invitation.service.js';

export type DepartmentInput = { name: string; description: string; moduleKey: string | null };
export type NameLeaderInput = { personId: string; title: string; email?: string };

/** Enough of a phone number to tell two Johns apart, and no more. */
const phoneTail = (phone: string) => (phone.length >= 3 ? `…${phone.slice(-3)}` : '');

/**
 * The church's departments, who leads them and who is in them (D28).
 *
 * Two kinds of caller. An administrator (`admin.departments.*`) keeps the
 * list, gives a department its portal, and names and ends its leaders. A
 * leader (`departments.own.*`, held by being one) sees the departments they
 * lead and keeps their members. The permission only ever says what kind of
 * thing someone may do; which department is always checked here, against the
 * leadership rows, so a leader of the choir cannot touch the ushers.
 *
 * Nothing is deleted. A department is archived, a leadership or membership is
 * ended, and the database refuses the application a delete.
 */
@Injectable()
export class DepartmentsService {
  constructor(
    private readonly db: Db,
    private readonly auth: RequestAuth,
    private readonly audit: AuditService,
    private readonly usage: UsageService,
    private readonly invitations: InvitationService,
  ) {}

  // ── The administrators' side ──────────────────────────────────────────

  /** Every department, archived ones last, with its leaders and how many members. */
  async list() {
    const departments = await this.db.client.department.findMany({
      orderBy: [{ archivedAt: { sort: 'asc', nulls: 'first' } }, { name: 'asc' }],
      include: {
        leaders: {
          where: { endedAt: null },
          include: { person: true },
          orderBy: { addedAt: 'asc' },
        },
        _count: { select: { members: { where: { endedAt: null } } } },
      },
    });
    const enabled = await this.enabledPortals();
    return departments.map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      portal: this.portal(d.moduleKey, enabled),
      archived: d.archivedAt !== null,
      leaders: d.leaders.map((l) => ({ id: l.id, name: l.person.fullName, title: l.title })),
      memberCount: d._count.members,
    }));
  }

  async create(input: DepartmentInput) {
    await this.checkPortal(input.moduleKey, null);
    return this.db.tx(async (tx) => {
      await this.checkName(tx, input.name, null);
      const department = await tx.department.create({
        data: {
          name: input.name,
          description: input.description,
          moduleKey: input.moduleKey,
          createdById: this.auth.actorUserId,
        },
      });
      await this.audit.recordIn(tx, {
        action: 'departments.created',
        entityType: 'department',
        entityId: department.id,
        summary: `Created the ${department.name} department`,
        after: input,
      });
      return { id: department.id };
    });
  }

  async update(id: string, input: DepartmentInput) {
    const before = await this.find(id);
    await this.checkPortal(input.moduleKey, id);
    if (before.moduleKey && before.moduleKey !== input.moduleKey) {
      // Taking a portal away from its department while it is on would leave
      // a portal that belongs to nobody, which D28 says cannot exist.
      const enabled = await this.enabledPortals();
      if (enabled.has(before.moduleKey)) {
        throw new AppError(
          409,
          ErrorCode.CONFLICT,
          `${moduleByKey(before.moduleKey)?.name ?? before.moduleKey} is switched on. Switch it off in Admin → Portals before giving it to another department.`,
        );
      }
    }
    await this.db.tx(async (tx) => {
      await this.checkName(tx, input.name, id);
      await tx.department.update({
        where: { id },
        data: { name: input.name, description: input.description, moduleKey: input.moduleKey },
      });
      await this.audit.recordIn(tx, {
        action: 'departments.updated',
        entityType: 'department',
        entityId: id,
        summary: `Changed the ${input.name} department`,
        before: { name: before.name, description: before.description, moduleKey: before.moduleKey },
        after: input,
      });
    });
  }

  /**
   * Archiving keeps everything, and ends what its leaders may do because they
   * lead it: the permission resolver ignores archived departments.
   */
  async setArchived(id: string, archived: boolean) {
    const department = await this.find(id);
    if (
      archived &&
      department.moduleKey &&
      (await this.enabledPortals()).has(department.moduleKey)
    ) {
      throw new AppError(
        409,
        ErrorCode.CONFLICT,
        `Its portal is switched on. Switch ${moduleByKey(department.moduleKey)?.name ?? 'it'} off in Admin → Portals first.`,
      );
    }
    await this.db.tx(async (tx) => {
      await tx.department.update({
        where: { id },
        data: { archivedAt: archived ? new Date() : null },
      });
      await this.audit.recordIn(tx, {
        action: archived ? 'departments.archived' : 'departments.restored',
        entityType: 'department',
        entityId: id,
        summary: `${archived ? 'Archived' : 'Restored'} the ${department.name} department`,
      });
    });
  }

  /**
   * Who could be named a leader: confirmed members, and whether each already
   * has a way to sign in. Their email is not shown, only whether there is one
   * on record, because it sits behind Membership's sensitive permission.
   */
  async leaderCandidates(q: string) {
    const term = q.trim();
    if (term.length < 2) return [];
    const people = await this.db.client.person.findMany({
      where: {
        stage: 'CONFIRMED_MEMBER',
        OR: [
          { fullName: { contains: term, mode: 'insensitive' } },
          { phone: { contains: term.replace(/\s/g, '') } },
        ],
      },
      include: { account: true },
      orderBy: { fullName: 'asc' },
      take: 20,
    });
    return people.map((p) => ({
      personId: p.id,
      name: p.fullName,
      phoneTail: phoneTail(p.phone),
      emailOnRecord: p.email.trim() !== '',
      account: p.account && { email: p.account.email, status: p.account.status },
    }));
  }

  /**
   * Names a leader, and gives them a way to sign in if they have none.
   *
   * The account is found in this order: the one already linked to this
   * person; one with the email given (or the one on their record) that
   * belongs to nobody yet, which is then linked; otherwise a new one, invited
   * with no role at all — being a leader is what they need. The leadership
   * and the invitation are one transaction, so neither exists without the
   * other.
   */
  async nameLeader(departmentId: string, input: NameLeaderInput) {
    const department = await this.findLive(departmentId);
    const person = await this.db.client.person.findUnique({
      where: { id: input.personId },
      include: { account: true },
    });
    if (!person) throw notFound('No such person in People.');
    if (person.stage !== 'CONFIRMED_MEMBER') {
      throw new AppError(
        422,
        ErrorCode.NOT_CONFIRMED_MEMBER,
        `${person.fullName} is not a confirmed member yet, so cannot lead a department. The pastors confirm members in Membership → Applications.`,
        { stage: person.stage },
      );
    }
    const open = await this.db.client.departmentLeader.findFirst({
      where: { departmentId, personId: person.id, endedAt: null },
    });
    if (open) {
      throw new AppError(
        409,
        ErrorCode.ALREADY_LEADS,
        `${person.fullName} already leads ${department.name}, as ${open.title}.`,
      );
    }

    const asWhat = `${input.title} of ${department.name}`;
    const record = async (tx: Tx, invited: boolean) => {
      await tx.departmentLeader.create({
        data: {
          departmentId,
          personId: person.id,
          title: input.title,
          addedById: this.auth.actorUserId,
        },
      });
      await this.audit.recordIn(tx, {
        action: 'departments.leader.named',
        entityType: 'department',
        entityId: departmentId,
        summary: `Named ${person.fullName} ${asWhat}${invited ? ', and invited them to sign in' : ''}`,
      });
    };

    let account = person.account;
    if (!account) {
      const email = normalizeEmail(input.email?.trim() || person.email);
      if (!z.email().safeParse(email).success) {
        throw new AppError(
          422,
          ErrorCode.VALIDATION_FAILED,
          email
            ? `The email on ${person.fullName}'s record does not look right. Type the one they will sign in with.`
            : `${person.fullName} has no email on record. Type the one they will sign in with.`,
          { email: ['Needed, so they can sign in'] },
        );
      }
      const byEmail = await this.db.client.user.findUnique({ where: { email } });
      if (byEmail?.personId && byEmail.personId !== person.id) {
        throw new AppError(
          409,
          ErrorCode.CONFLICT,
          `${email} already belongs to someone else's account.`,
          { email: ['Belongs to someone else'] },
        );
      }
      if (!byEmail) {
        await this.invitations.invite(
          { email, fullName: person.fullName, roleIds: [], personId: person.id, asWhat },
          (tx) => record(tx, true),
        );
        this.usage.inc('departments.leaders.named');
        return { invited: true };
      }
      account = byEmail;
    }

    if (account.status === 'DISABLED') {
      throw new AppError(
        409,
        ErrorCode.MEMBER_DISABLED,
        `${person.fullName}'s access was disabled. Re-enable it in Admin → People first.`,
      );
    }
    const accountId = account.id;
    await this.db.tx(async (tx) => {
      if (!person.account)
        await tx.user.update({ where: { id: accountId }, data: { personId: person.id } });
      await record(tx, false);
    });
    this.usage.inc('departments.leaders.named');
    return { invited: false };
  }

  /** Ends a leadership. What it allowed stops on their next request. */
  async endLeader(departmentId: string, leaderId: string) {
    const department = await this.find(departmentId);
    const leader = await this.db.client.departmentLeader.findFirst({
      where: { id: leaderId, departmentId, endedAt: null },
      include: { person: true },
    });
    if (!leader) throw notFound('That person does not lead this department.');
    await this.db.tx(async (tx) => {
      await tx.departmentLeader.update({
        where: { id: leader.id },
        data: { endedAt: new Date(), endedById: this.auth.actorUserId },
      });
      await this.audit.recordIn(tx, {
        action: 'departments.leader.ended',
        entityType: 'department',
        entityId: departmentId,
        summary: `${leader.person.fullName} no longer leads ${department.name}`,
      });
    });
  }

  // ── Both sides ────────────────────────────────────────────────────────

  /** The departments this person leads now, for My departments. */
  async mine() {
    const personId = await this.myPersonId();
    if (!personId) return [];
    const leads = await this.db.client.departmentLeader.findMany({
      where: { personId, endedAt: null, department: { archivedAt: null } },
      include: {
        department: {
          include: { _count: { select: { members: { where: { endedAt: null } } } } },
        },
      },
      orderBy: { department: { name: 'asc' } },
    });
    return leads.map((l) => ({
      id: l.department.id,
      name: l.department.name,
      description: l.department.description,
      title: l.title,
      memberCount: l.department._count.members,
    }));
  }

  /**
   * One department, for an administrator or for one of its leaders. Only an
   * administrator is told about accounts and invitations.
   */
  async get(id: string) {
    const admin = this.auth.has('admin.departments.read');
    if (!admin) await this.requireLeads(id);
    const department = await this.db.client.department.findUnique({
      where: { id },
      include: {
        leaders: {
          where: { endedAt: null },
          include: { person: { include: { account: true } } },
          orderBy: { addedAt: 'asc' },
        },
        members: {
          where: { endedAt: null },
          include: { person: true },
          orderBy: { person: { fullName: 'asc' } },
        },
      },
    });
    if (!department) throw notFound('No such department.');
    const enabled = await this.enabledPortals();
    return {
      id: department.id,
      name: department.name,
      description: department.description,
      portal: this.portal(department.moduleKey, enabled),
      archived: department.archivedAt !== null,
      leaders: department.leaders.map((l) => ({
        id: l.id,
        personId: l.personId,
        name: l.person.fullName,
        title: l.title,
        since: l.addedAt.toISOString(),
        account: admin && l.person.account ? { status: l.person.account.status } : null,
      })),
      members: department.members.map((m) => ({
        id: m.id,
        personId: m.personId,
        name: m.person.fullName,
        stage: m.person.stage,
        phoneTail: phoneTail(m.person.phone),
        since: m.addedAt.toISOString(),
      })),
    };
  }

  /**
   * People a leader might add. Their name, stage and the end of their phone
   * number — enough to pick the right one without Membership's access.
   */
  async memberCandidates(departmentId: string, q: string) {
    await this.requireMayKeepMembers(departmentId);
    const term = q.trim();
    if (term.length < 2) return [];
    const people = await this.db.client.person.findMany({
      where: {
        OR: [
          { fullName: { contains: term, mode: 'insensitive' } },
          { phone: { contains: term.replace(/\s/g, '') } },
        ],
        departments: { none: { departmentId, endedAt: null } },
      },
      orderBy: { fullName: 'asc' },
      take: 20,
    });
    return people.map((p) => ({
      personId: p.id,
      name: p.fullName,
      stage: p.stage as PersonStage,
      phoneTail: phoneTail(p.phone),
    }));
  }

  async addMember(departmentId: string, personId: string) {
    const department = await this.requireMayKeepMembers(departmentId);
    const person = await this.db.client.person.findUnique({ where: { id: personId } });
    if (!person) throw notFound('No such person in People.');
    const open = await this.db.client.departmentMember.findFirst({
      where: { departmentId, personId, endedAt: null },
    });
    if (open) {
      throw new AppError(
        409,
        ErrorCode.ALREADY_EXISTS,
        `${person.fullName} is already in ${department.name}.`,
      );
    }
    const member = await this.db.tx(async (tx) => {
      const row = await tx.departmentMember.create({
        data: { departmentId, personId, addedById: this.auth.actorUserId },
      });
      await this.audit.recordIn(tx, {
        action: 'departments.member.added',
        entityType: 'department',
        entityId: departmentId,
        summary: `Added ${person.fullName} to ${department.name}`,
      });
      return row;
    });
    this.usage.inc('departments.members.added');
    return { id: member.id };
  }

  async endMember(departmentId: string, memberId: string) {
    const department = await this.requireMayKeepMembers(departmentId);
    const member = await this.db.client.departmentMember.findFirst({
      where: { id: memberId, departmentId, endedAt: null },
      include: { person: true },
    });
    if (!member) throw notFound('That person is not in this department.');
    await this.db.tx(async (tx) => {
      await tx.departmentMember.update({
        where: { id: member.id },
        data: { endedAt: new Date(), endedById: this.auth.actorUserId },
      });
      await this.audit.recordIn(tx, {
        action: 'departments.member.ended',
        entityType: 'department',
        entityId: departmentId,
        summary: `Took ${member.person.fullName} out of ${department.name}`,
      });
    });
  }

  // ── Checks ────────────────────────────────────────────────────────────

  /** The person the signed-in account belongs to, if it belongs to one. */
  private async myPersonId(): Promise<string | null> {
    if (!this.auth.userId) return null;
    const user = await this.db.client.user.findUnique({
      where: { id: this.auth.userId },
      select: { personId: true },
    });
    return user?.personId ?? null;
  }

  /** Whether the signed-in person leads this department now. */
  async leads(departmentId: string): Promise<boolean> {
    return this.auth.userId ? this.leadsAs(this.auth.userId, departmentId) : false;
  }

  /**
   * Whether this account leads this department now. A beat asks this of the
   * person who set it up, every time it runs, so a leader who has stepped
   * down stops sending (07 step 7.11).
   */
  async leadsAs(userId: string, departmentId: string): Promise<boolean> {
    const user = await this.db.client.user.findUnique({
      where: { id: userId },
      select: { personId: true, status: true },
    });
    const personId = user?.status === 'ACTIVE' ? user.personId : null;
    if (!personId) return false;
    const row = await this.db.client.departmentLeader.findFirst({
      where: { departmentId, personId, endedAt: null, department: { archivedAt: null } },
      select: { id: true },
    });
    return row !== null;
  }

  /**
   * Refused without `details.required`: the guard let them through, and the
   * refusal is about this department, not about what they hold.
   */
  private async requireLeads(departmentId: string): Promise<void> {
    if (!(await this.leads(departmentId))) {
      throw new AppError(403, ErrorCode.FORBIDDEN, 'You do not lead this department.');
    }
  }

  /** An administrator, or one of this department's leaders. */
  private async requireMayKeepMembers(departmentId: string) {
    const department = await this.findLive(departmentId);
    if (!this.auth.has('admin.departments.manage')) await this.requireLeads(departmentId);
    return department;
  }

  private async find(id: string) {
    const department = await this.db.client.department.findUnique({ where: { id } });
    if (!department) throw notFound('No such department.');
    return department;
  }

  private async findLive(id: string) {
    const department = await this.find(id);
    if (department.archivedAt) {
      throw new AppError(
        409,
        ErrorCode.CONFLICT,
        `${department.name} is archived. Restore it first.`,
      );
    }
    return department;
  }

  private async checkName(tx: Tx, name: string, exceptId: string | null) {
    const same = await tx.department.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
    });
    if (same) {
      throw new AppError(
        409,
        ErrorCode.ALREADY_EXISTS,
        `There is already a department called ${same.name}.`,
        {
          name: ['Already used'],
        },
      );
    }
  }

  /** A portal given to a department must be a department portal nobody else has. */
  private async checkPortal(moduleKey: string | null, exceptId: string | null) {
    if (!moduleKey) return;
    const module = moduleByKey(moduleKey);
    if (!module || module.kind !== 'department') {
      throw new AppError(422, ErrorCode.VALIDATION_FAILED, 'That is not a department portal.', {
        moduleKey: ['Not a department portal'],
      });
    }
    const holder = await this.db.client.department.findFirst({
      where: { moduleKey, ...(exceptId ? { id: { not: exceptId } } : {}) },
    });
    if (holder) {
      throw new AppError(
        409,
        ErrorCode.CONFLICT,
        `${module.name} already belongs to ${holder.name}. A portal belongs to one department.`,
        { moduleKey: ['Already belongs to another department'] },
      );
    }
  }

  private async enabledPortals(): Promise<Set<string>> {
    const rows = await this.db.client.moduleState.findMany({
      where: { enabled: true },
      select: { moduleKey: true },
    });
    return new Set(rows.map((r) => r.moduleKey));
  }

  private portal(moduleKey: string | null, enabled: Set<string>) {
    if (!moduleKey) return null;
    return {
      key: moduleKey,
      name: moduleByKey(moduleKey)?.name ?? moduleKey,
      enabled: enabled.has(moduleKey),
    };
  }
}

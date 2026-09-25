import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@irca/shared';
import type { OutreachSessionStatus } from '../../generated/prisma/client.js';
import { Db, type Tx } from '../../core/database/db.service.js';
import { sql } from '../../core/database/sql.js';
import { RequestAuth } from '../../core/context/request-auth.js';
import { AppError, notFound } from '../../core/http/app-error.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { UsageService } from '../../core/usage/usage.service.js';
import { TeamService } from './team.service.js';

export type SessionInput = { heldOn: string; title: string; notes?: string };
export type SessionTeamInput = {
  groupId?: string | null;
  area: string;
  personIds: string[];
  notes?: string;
};

/** A calendar date as the API sends it: '2026-09-26'. */
export const day = (d: Date) => d.toISOString().slice(0, 10);
/** And back, for a `date` column: midnight UTC, which Postgres stores as the day. */
export const toDay = (s: string) => new Date(`${s}T00:00:00Z`);

/**
 * Saturdays: a session, the teams sent to areas on it, and closing it.
 *
 * A team's people are chosen from the Outreach team now, but once chosen
 * they are the session's own list: partners swapped on the day, or someone
 * who later leaves the department, change nothing about who went. A session
 * is completed or cancelled, never deleted.
 */
@Injectable()
export class SessionsService {
  constructor(
    private readonly db: Db,
    private readonly auth: RequestAuth,
    private readonly audit: AuditService,
    private readonly usage: UsageService,
    private readonly team: TeamService,
  ) {}

  async list(query: { status?: OutreachSessionStatus; from?: string; to?: string }) {
    const sessions = await this.db.client.outreachSession.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.from || query.to
          ? {
              heldOn: {
                ...(query.from ? { gte: toDay(query.from) } : {}),
                ...(query.to ? { lte: toDay(query.to) } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ heldOn: 'desc' }, { createdAt: 'desc' }],
      take: 200,
      include: {
        teams: {
          select: { area: true, spokenToOnly: true, _count: { select: { members: true } } },
        },
        _count: { select: { reached: true } },
      },
    });
    return sessions.map((s) => ({
      id: s.id,
      heldOn: day(s.heldOn),
      title: s.title,
      status: s.status,
      areas: s.teams.map((t) => t.area),
      teams: s.teams.length,
      people: s.teams.reduce((n, t) => n + t._count.members, 0),
      reached: s._count.reached,
      spokenToOnly: s.teams.reduce((n, t) => n + t.spokenToOnly, 0),
    }));
  }

  async get(id: string) {
    const session = await this.db.client.outreachSession.findUnique({
      where: { id },
      include: {
        teams: {
          orderBy: { area: 'asc' },
          include: {
            group: { select: { id: true, name: true } },
            members: { include: { person: { select: { id: true, fullName: true } } } },
            _count: { select: { reached: true } },
          },
        },
        _count: { select: { reached: true } },
      },
    });
    if (!session) throw notFound('No such Saturday.');
    const createdBy = await this.db.client.user.findUnique({
      where: { id: session.createdById },
      select: { fullName: true },
    });
    return {
      id: session.id,
      heldOn: day(session.heldOn),
      title: session.title,
      status: session.status,
      notes: session.notes,
      createdBy: createdBy?.fullName ?? null,
      reached: session._count.reached,
      teams: session.teams.map((t) => ({
        id: t.id,
        area: t.area,
        group: t.group,
        notes: t.notes,
        spokenToOnly: t.spokenToOnly,
        reached: t._count.reached,
        people: t.members
          .map((m) => ({ personId: m.personId, name: m.person.fullName }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      })),
    };
  }

  async create(input: SessionInput) {
    const session = await this.db.tx(async (tx) => {
      await this.team.department(tx);
      const session = await tx.outreachSession.create({
        data: {
          heldOn: toDay(input.heldOn),
          title: input.title,
          notes: input.notes ?? '',
          createdById: this.auth.userId!,
        },
      });
      await this.audit.recordIn(tx, {
        action: 'outreach.session.planned',
        entityType: 'outreach_session',
        entityId: session.id,
        summary: `Planned the Saturday of ${input.heldOn}${input.title ? `: ${input.title}` : ''}`,
      });
      return session;
    });
    return { id: session.id };
  }

  async update(id: string, input: SessionInput) {
    await this.db.tx(async (tx) => {
      const before = await this.require(tx, id);
      await tx.outreachSession.update({
        where: { id },
        data: { heldOn: toDay(input.heldOn), title: input.title, notes: input.notes ?? '' },
      });
      await this.audit.recordIn(tx, {
        action: 'outreach.session.updated',
        entityType: 'outreach_session',
        entityId: id,
        summary: `Changed the Saturday of ${input.heldOn}`,
        before: { heldOn: day(before.heldOn), title: before.title },
        after: { heldOn: input.heldOn, title: input.title },
      });
    });
  }

  /** Completed or cancelled afterwards, or back to planned when that was a mistake. */
  async setStatus(id: string, status: OutreachSessionStatus) {
    await this.db.tx(async (tx) => {
      const before = await this.require(tx, id);
      if (before.status === status) return;
      await tx.outreachSession.update({ where: { id }, data: { status } });
      await this.audit.recordIn(tx, {
        action: `outreach.session.${status.toLowerCase()}`,
        entityType: 'outreach_session',
        entityId: id,
        summary: `${STATUS_WORD[status]} the Saturday of ${day(before.heldOn)}`,
        before: { status: before.status },
        after: { status },
      });
      if (status === 'COMPLETED') this.usage.inc('outreach.sessions');
    });
  }

  async addTeam(sessionId: string, input: SessionTeamInput) {
    return this.db.tx(async (tx) => {
      const session = await this.require(tx, sessionId);
      this.planned(session.status);
      const names = await this.checkTeam(tx, input);
      const team = await tx.outreachSessionTeam.create({
        data: {
          sessionId,
          groupId: input.groupId ?? null,
          area: input.area,
          notes: input.notes ?? '',
          members: { create: [...new Set(input.personIds)].map((personId) => ({ personId })) },
        },
      });
      await this.audit.recordIn(tx, {
        action: 'outreach.session.team_added',
        entityType: 'outreach_session',
        entityId: sessionId,
        summary: `Sent ${names.join(', ')} to ${input.area} on ${day(session.heldOn)}`,
      });
      return { id: team.id };
    });
  }

  async updateTeam(sessionId: string, teamId: string, input: SessionTeamInput) {
    await this.db.tx(async (tx) => {
      const session = await this.require(tx, sessionId);
      this.planned(session.status);
      const team = await tx.outreachSessionTeam.findFirst({ where: { id: teamId, sessionId } });
      if (!team) throw notFound('No such team on this Saturday.');
      const names = await this.checkTeam(tx, input);
      await tx.outreachSessionTeam.update({
        where: { id: teamId },
        data: { groupId: input.groupId ?? null, area: input.area, notes: input.notes ?? '' },
      });
      await tx.outreachSessionTeamMember.deleteMany({ where: { teamId } });
      await tx.outreachSessionTeamMember.createMany({
        data: [...new Set(input.personIds)].map((personId) => ({ teamId, personId })),
      });
      await this.audit.recordIn(tx, {
        action: 'outreach.session.team_changed',
        entityType: 'outreach_session',
        entityId: sessionId,
        summary: `Changed the ${input.area} team on ${day(session.heldOn)}: ${names.join(', ')}`,
        before: { area: team.area },
        after: { area: input.area },
      });
    });
  }

  /**
   * Taking a team off a Saturday still being planned. Once anyone has been
   * recorded against it, it went out, and it stays.
   */
  async removeTeam(sessionId: string, teamId: string) {
    await this.db.tx(async (tx) => {
      const session = await this.require(tx, sessionId);
      this.planned(session.status);
      const team = await tx.outreachSessionTeam.findFirst({
        where: { id: teamId, sessionId },
        include: { _count: { select: { reached: true } } },
      });
      if (!team) throw notFound('No such team on this Saturday.');
      if (team._count.reached > 0) {
        throw new AppError(
          409,
          ErrorCode.CONFLICT,
          `People have been recorded against the ${team.area} team, so it stays.`,
        );
      }
      await tx.outreachSessionTeam.delete({ where: { id: teamId } });
      await this.audit.recordIn(tx, {
        action: 'outreach.session.team_removed',
        entityType: 'outreach_session',
        entityId: sessionId,
        summary: `Took the ${team.area} team off the Saturday of ${day(session.heldOn)}`,
      });
    });
  }

  /**
   * People spoken to without taking details, typed by the team. Kept apart
   * from those recorded, who are counted rather than typed (08 step 8.5).
   */
  async setSpokenToOnly(teamId: string, count: number) {
    await this.db.tx(async (tx) => {
      const team = await tx.outreachSessionTeam.findUnique({
        where: { id: teamId },
        include: { session: true },
      });
      if (!team) throw notFound('No such team.');
      if (team.session.status === 'CANCELLED') {
        throw new AppError(409, ErrorCode.CONFLICT, 'That Saturday was cancelled.');
      }
      await tx.outreachSessionTeam.update({ where: { id: teamId }, data: { spokenToOnly: count } });
      await this.audit.recordIn(tx, {
        action: 'outreach.session.spoken_to',
        entityType: 'outreach_session',
        entityId: team.sessionId,
        summary: `The ${team.area} team spoke to ${count} more without taking details`,
        before: { spokenToOnly: team.spokenToOnly },
        after: { spokenToOnly: count },
      });
    });
  }

  /**
   * Areas already used, most used first, as suggestions and never as a fixed
   * list: a new estate must never need a developer (08 step 8.1).
   */
  async areas(q?: string) {
    const like = `%${(q ?? '').trim().toLowerCase()}%`;
    const rows = await this.db.client.$queryRaw<{ area: string }[]>(sql`
      select area from (
        select area from outreach_session_teams
        union all
        select area from outreach_reached where area <> ''
      ) a
      where lower(area) like ${like}
      group by area
      order by count(*) desc, area
      limit 20`);
    return rows.map((r) => r.area);
  }

  private async require(tx: Tx, id: string) {
    const session = await tx.outreachSession.findUnique({ where: { id } });
    if (!session) throw notFound('No such Saturday.');
    return session;
  }

  private planned(status: OutreachSessionStatus) {
    if (status !== 'PLANNED') {
      throw new AppError(
        409,
        ErrorCode.CONFLICT,
        `This Saturday is ${status === 'COMPLETED' ? 'completed' : 'cancelled'}. Open it again to change its teams.`,
      );
    }
  }

  /**
   * A team is at least one person, all on the Outreach team now, from a
   * group that exists. Returns their names, for the activity log.
   */
  private async checkTeam(tx: Tx, input: SessionTeamInput) {
    const ids = [...new Set(input.personIds)];
    if (ids.length === 0) {
      throw new AppError(422, ErrorCode.VALIDATION_FAILED, 'Choose who is going.', {
        personIds: ['Choose at least one person'],
      });
    }
    if (input.groupId) {
      const group = await tx.outreachGroup.findUnique({ where: { id: input.groupId } });
      if (!group) throw notFound('No such partner group.');
    }
    const department = await this.team.department(tx);
    const team = await this.team.teamIds(tx, department.id);
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
    return people.map((p) => p.fullName);
  }
}

const STATUS_WORD: Record<OutreachSessionStatus, string> = {
  PLANNED: 'Opened again',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

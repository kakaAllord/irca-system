import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@irca/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaCore } from '../../core/database/prisma-clients.js';
import { AppError } from '../../core/http/app-error.js';

export type LogQuery = {
  church?: string;
  actor?: string;
  subject?: string;
  since?: string;
  until?: string;
  before?: string;
  limit?: number;
};

/**
 * The view-as log: the only place in the system where anyone can read who
 * viewed the portal as whom, and when (D16). Churches never see it — not in
 * their activity log, not anywhere — and nothing here can change it.
 */
@Injectable()
export class ImpersonationLogService {
  constructor(private readonly db: PrismaCore) {}

  async sessions(query: LogQuery) {
    const limit = Math.min(Math.max(query.limit ?? 100, 1), 500);
    const church = query.church
      ? await this.db.church.findUnique({ where: { code: query.church.toUpperCase() } })
      : null;
    if (query.church && !church) return { rows: [], next: null };

    const people = async (text?: string) =>
      text
        ? (
            await this.db.user.findMany({
              where: {
                OR: [
                  { email: { contains: text, mode: 'insensitive' } },
                  { fullName: { contains: text, mode: 'insensitive' } },
                ],
              },
              select: { id: true },
            })
          ).map((u) => u.id)
        : null;
    const [actors, subjects] = await Promise.all([people(query.actor), people(query.subject)]);

    const where: Prisma.ImpersonationSessionWhereInput = {
      ...(church ? { churchId: church.id } : {}),
      ...(actors ? { actorUserId: { in: actors } } : {}),
      ...(subjects ? { subjectUserId: { in: subjects } } : {}),
      startedAt: {
        ...(query.since ? { gte: moment(query.since) } : {}),
        ...(query.until ? { lte: moment(query.until) } : {}),
        ...(query.before ? { lt: new Date(query.before) } : {}),
      },
    };
    const rows = await this.db.impersonationSession.findMany({
      where,
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    return {
      rows: await this.describe(page),
      next: rows.length > limit ? page.at(-1)!.startedAt.toISOString() : null,
    };
  }

  /** One session and every page viewed in it. The first characters of the id are enough. */
  async session(idOrPrefix: string) {
    if (!/^[0-9a-f-]{4,36}$/i.test(idOrPrefix)) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'No session like that.');
    }
    const matches = await this.db.$queryRaw<{ id: string }[]>`
      select id from impersonation_sessions where id::text like ${`${idOrPrefix.toLowerCase()}%`} limit 2`;
    if (matches.length !== 1) {
      throw new AppError(
        404,
        ErrorCode.NOT_FOUND,
        matches.length
          ? 'More than one session starts like that. Type more of it.'
          : 'No session like that.',
      );
    }
    const found = await this.db.impersonationSession.findUniqueOrThrow({
      where: { id: matches[0]!.id },
    });
    const [session] = await this.describe([found]);
    const views = await this.db.auditEvent.findMany({
      where: { impersonationId: found.id, action: 'impersonation.view' },
      orderBy: { createdAt: 'asc' },
      take: 2000,
    });
    return {
      ...session,
      views: views.map((v) => {
        const meta = (v.meta ?? {}) as {
          method?: string;
          path?: string;
          status?: number;
          durationMs?: number;
        };
        return {
          at: v.createdAt.toISOString(),
          method: meta.method ?? '',
          path: meta.path ?? '',
          status: meta.status ?? 0,
          ms: meta.durationMs ?? 0,
        };
      }),
    };
  }

  /** Everything that happened after a moment, oldest first, for `follow`. */
  async events(after: string, churchCode?: string) {
    const since = new Date(after);
    if (Number.isNaN(since.getTime())) {
      throw new AppError(400, ErrorCode.VALIDATION_FAILED, 'after must be a moment in time.');
    }
    const church = churchCode
      ? await this.db.church.findUnique({ where: { code: churchCode.toUpperCase() } })
      : null;
    const rows = await this.db.auditEvent.findMany({
      where: {
        createdAt: { gt: since },
        action: { in: ['impersonation.started', 'impersonation.view', 'impersonation.ended'] },
        ...(church ? { churchId: church.id } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    const churches = await this.churchesById(rows.map((r) => r.churchId));
    const users = await this.db.user.findMany({
      where: {
        id: {
          in: [
            ...new Set(rows.flatMap((r) => [r.actorUserId, r.subjectUserId]).filter(Boolean)),
          ] as string[],
        },
      },
      select: { id: true, email: true },
    });
    const email = new Map(users.map((u) => [u.id, u.email]));
    return rows.map((r) => {
      const meta = (r.meta ?? {}) as {
        method?: string;
        path?: string;
        status?: number;
        durationMs?: number;
      };
      return {
        actor: r.actorUserId ? (email.get(r.actorUserId) ?? null) : null,
        subject: r.subjectUserId ? (email.get(r.subjectUserId) ?? null) : null,
        at: r.createdAt.toISOString(),
        kind:
          r.action === 'impersonation.started'
            ? 'START'
            : r.action === 'impersonation.ended'
              ? 'END'
              : 'VIEW',
        sessionId: r.impersonationId ?? r.entityId,
        church: r.churchId ? (churches.get(r.churchId)?.code ?? '?') : '-',
        timezone: r.churchId ? (churches.get(r.churchId)?.timezone ?? 'UTC') : 'UTC',
        summary: r.summary,
        method: meta.method ?? null,
        path: meta.path ?? null,
        status: meta.status ?? null,
        ms: meta.durationMs ?? null,
      };
    });
  }

  async churches() {
    return this.db.church.findMany({
      select: { code: true, name: true },
      orderBy: { code: 'asc' },
    });
  }

  /** Sessions as lines of the log: who, as whom, where, for how long, how much. */
  private async describe(rows: Prisma.ImpersonationSessionGetPayload<object>[]) {
    const users = await this.db.user.findMany({
      where: { id: { in: [...new Set(rows.flatMap((r) => [r.actorUserId, r.subjectUserId]))] } },
      select: { id: true, fullName: true, email: true, platformRole: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    const churches = await this.churchesById(rows.map((r) => r.churchId));
    const views = await this.db.auditEvent.groupBy({
      by: ['impersonationId'],
      where: { impersonationId: { in: rows.map((r) => r.id) }, action: 'impersonation.view' },
      _count: { _all: true },
    });
    const roles = await this.roleLabels(rows);

    return rows.map((r) => {
      const actor = byId.get(r.actorUserId);
      const subject = byId.get(r.subjectUserId);
      const ended = r.endedAt ?? (r.expiresAt < new Date() ? r.expiresAt : null);
      return {
        id: r.id,
        church: churches.get(r.churchId)?.code ?? '?',
        timezone: churches.get(r.churchId)?.timezone ?? 'UTC',
        actor: {
          name: actor?.fullName ?? 'Someone',
          email: actor?.email ?? '',
          roles:
            actor?.platformRole === 'DEV'
              ? ['dev']
              : (roles.get(`${r.churchId}:${r.actorUserId}`) ?? []),
        },
        subject: {
          name: subject?.fullName ?? 'Someone',
          email: subject?.email ?? '',
          roles: roles.get(`${r.churchId}:${r.subjectUserId}`) ?? [],
        },
        startedAt: r.startedAt.toISOString(),
        endedAt: ended?.toISOString() ?? null,
        endReason: r.endReason ?? (ended && !r.endedAt ? 'EXPIRED' : null),
        seconds: ended ? Math.round((ended.getTime() - r.startedAt.getTime()) / 1000) : null,
        views: views.find((v) => v.impersonationId === r.id)?._count._all ?? 0,
      };
    });
  }

  private async roleLabels(
    rows: { churchId: string; actorUserId: string; subjectUserId: string }[],
  ) {
    const links = await this.db.membershipRole.findMany({
      where: {
        OR: rows.flatMap((r) => [
          { churchId: r.churchId, membership: { userId: r.actorUserId } },
          { churchId: r.churchId, membership: { userId: r.subjectUserId } },
        ]),
        role: { deletedAt: null },
      },
      include: { role: { select: { name: true } }, membership: { select: { userId: true } } },
    });
    const out = new Map<string, string[]>();
    for (const link of links) {
      const key = `${link.churchId}:${link.membership.userId}`;
      out.set(key, [...(out.get(key) ?? []), link.role.name]);
    }
    return out;
  }

  private async churchesById(ids: (string | null)[]) {
    const churches = await this.db.church.findMany({
      where: { id: { in: [...new Set(ids.filter(Boolean))] as string[] } },
      select: { id: true, code: true, timezone: true },
    });
    return new Map(churches.map((c) => [c.id, c]));
  }
}

/** '24h', '7d', '30d', or a date. */
function moment(text: string): Date {
  const relative = /^(\d+)([hd])$/.exec(text);
  if (relative) {
    const n = Number(relative[1]);
    return new Date(Date.now() - n * (relative[2] === 'h' ? 3_600_000 : 86_400_000));
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(
      400,
      ErrorCode.VALIDATION_FAILED,
      `"${text}" is not a time. Use 24h, 7d, 30d or a date.`,
    );
  }
  return date;
}

import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@irca/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { Db } from '../../core/database/db.service.js';
import { AppError } from '../../core/http/app-error.js';

export type LogQuery = {
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
  constructor(private readonly db: Db) {}

  async sessions(query: LogQuery) {
    const limit = Math.min(Math.max(query.limit ?? 100, 1), 500);

    const people = async (text?: string) =>
      text
        ? (
            await this.db.client.user.findMany({
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
      ...(actors ? { actorUserId: { in: actors } } : {}),
      ...(subjects ? { subjectUserId: { in: subjects } } : {}),
      startedAt: {
        ...(query.since ? { gte: moment(query.since) } : {}),
        ...(query.until ? { lte: moment(query.until) } : {}),
        ...(query.before ? { lt: new Date(query.before) } : {}),
      },
    };
    const rows = await this.db.client.impersonationSession.findMany({
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
    const matches = await this.db.client.$queryRaw<{ id: string }[]>`
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
    const found = await this.db.client.impersonationSession.findUniqueOrThrow({
      where: { id: matches[0]!.id },
    });
    const [session] = await this.describe([found]);
    const views = await this.db.client.$queryRaw<{ createdAt: Date; meta: unknown }[]>`
      select "createdAt", meta from impersonation_audit_events()
      where "impersonationId" = ${found.id} and action = 'impersonation.view'
      order by "createdAt" asc
      limit 2000
    `;
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
  async events(after: string) {
    const since = new Date(after);
    if (Number.isNaN(since.getTime())) {
      throw new AppError(400, ErrorCode.VALIDATION_FAILED, 'after must be a moment in time.');
    }
    const rows = await this.db.client.$queryRaw<
      {
        actorUserId: string | null;
        subjectUserId: string | null;
        createdAt: Date;
        action: string;
        impersonationId: string | null;
        entityId: string | null;
        summary: string | null;
        meta: unknown;
      }[]
    >`
      select "actorUserId", "subjectUserId", "createdAt", action, "impersonationId", "entityId", summary, meta
      from impersonation_audit_events()
      where "createdAt" > ${since}
      order by "createdAt" asc
      limit 200
    `;
    const users = await this.db.client.user.findMany({
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
        summary: r.summary,
        method: meta.method ?? null,
        path: meta.path ?? null,
        status: meta.status ?? null,
        ms: meta.durationMs ?? null,
      };
    });
  }

  /** Sessions as lines of the log: who, as whom, where, for how long, how much. */
  private async describe(rows: Prisma.ImpersonationSessionGetPayload<object>[]) {
    const users = await this.db.client.user.findMany({
      where: { id: { in: [...new Set(rows.flatMap((r) => [r.actorUserId, r.subjectUserId]))] } },
      select: { id: true, fullName: true, email: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    const views = await this.db.client.$queryRaw<{ impersonationId: string; count: bigint }[]>`
      select "impersonationId", count(*) as count
      from impersonation_audit_events()
      where "impersonationId" = any(${rows.map((r) => r.id)}::uuid[]) and action = 'impersonation.view'
      group by "impersonationId"
    `;
    const roles = await this.roleLabels(rows);

    return rows.map((r) => {
      const actor = byId.get(r.actorUserId);
      const subject = byId.get(r.subjectUserId);
      const ended = r.endedAt ?? (r.expiresAt < new Date() ? r.expiresAt : null);
      return {
        id: r.id,
        actor: {
          name: actor?.fullName ?? 'Someone',
          email: actor?.email ?? '',
          roles: roles.get(r.actorUserId) ?? [],
        },
        subject: {
          name: subject?.fullName ?? 'Someone',
          email: subject?.email ?? '',
          roles: roles.get(r.subjectUserId) ?? [],
        },
        startedAt: r.startedAt.toISOString(),
        endedAt: ended?.toISOString() ?? null,
        endReason: r.endReason ?? (ended && !r.endedAt ? 'EXPIRED' : null),
        seconds: ended ? Math.round((ended.getTime() - r.startedAt.getTime()) / 1000) : null,
        views: Number(views.find((v) => v.impersonationId === r.id)?.count ?? 0),
      };
    });
  }

  private async roleLabels(rows: { actorUserId: string; subjectUserId: string }[]) {
    const links = await this.db.client.userRole.findMany({
      where: {
        userId: { in: rows.flatMap((r) => [r.actorUserId, r.subjectUserId]) },
        role: { deletedAt: null },
      },
      include: { role: { select: { name: true } } },
    });
    const out = new Map<string, string[]>();
    for (const link of links) {
      const key = link.userId;
      out.set(key, [...(out.get(key) ?? []), link.role.name]);
    }
    return out;
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

import { Injectable } from '@nestjs/common';
import { PrismaCore } from '../../core/database/prisma-clients.js';
import { RequestAuth } from '../../core/context/request-auth.js';
import { LogBufferService, type LogLine } from '../../core/logging/log-buffer.service.js';

export type ServerLogQuery = {
  level?: string;
  search?: string;
  since?: number;
  limit: number;
};

export type ActionLogQuery = {
  churchId?: string;
  actorUserId?: string;
  action?: string;
  search?: string;
  before?: string;
  limit: number;
};

/**
 * The two logs the console shows: what the server wrote, and what people did.
 *
 * A dev sees both across every church. A church administrator lent this page
 * (`ADMIN_DEV_CONSOLE`) sees only their own church — the scoping is here
 * rather than in the controller, because a permission check cannot express
 * "the same rows, fewer of them".
 */
@Injectable()
export class PlatformLogsService {
  constructor(
    private readonly db: PrismaCore,
    private readonly auth: RequestAuth,
    private readonly buffer: LogBufferService,
  ) {}

  /** The recent lines this process wrote. Empty after a restart, and says so. */
  server(query: ServerLogQuery) {
    const result = this.buffer.list({
      level: query.level,
      search: query.search,
      since: query.since,
      // A non-dev is narrowed to their own church before the limit is applied,
      // so they get a full page of their own lines rather than the leftovers.
      churchId: this.auth.isDev ? undefined : (this.auth.churchId ?? undefined),
      limit: query.limit,
    });

    return {
      ...result,
      lines: this.auth.isDev ? result.lines : result.lines.map(strip),
      held: this.buffer.size,
      scope: this.auth.isDev ? ('all' as const) : ('church' as const),
    };
  }

  /** What people did, newest first, from the same rows the activity log reads. */
  async actions(query: ActionLogQuery) {
    // A dev may narrow to one church; anyone else is narrowed to theirs.
    const churchId = this.auth.isDev ? query.churchId : (this.auth.churchId ?? undefined);

    const rows = await this.db.auditEvent.findMany({
      where: {
        ...(churchId ? { churchId } : {}),
        ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
        ...(query.action ? { action: { startsWith: query.action } } : {}),
        ...(query.search ? { summary: { contains: query.search, mode: 'insensitive' } } : {}),
        ...(query.before ? { createdAt: { lt: new Date(query.before) } } : {}),
        // Impersonation rows belong to the view-as log and nowhere else (D16).
        ...(this.auth.isDev ? {} : { source: 'feature', impersonationId: null }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });

    const page = rows.slice(0, query.limit);
    const ids = [...new Set(page.flatMap((r) => [r.actorUserId, r.subjectUserId]))].filter(
      (id): id is string => Boolean(id),
    );
    const [users, churches] = await Promise.all([
      this.db.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }),
      this.db.church.findMany({ select: { id: true, code: true } }),
    ]);
    const names = new Map(users.map((u) => [u.id, u.fullName]));
    const codes = new Map(churches.map((c) => [c.id, c.code]));

    return {
      rows: page.map((r) => ({
        id: r.id,
        at: r.createdAt.toISOString(),
        churchCode: r.churchId ? (codes.get(r.churchId) ?? null) : null,
        source: r.source,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        summary: r.summary,
        actor: r.actorUserId ? (names.get(r.actorUserId) ?? 'Someone since removed') : null,
        subject: r.subjectUserId ? (names.get(r.subjectUserId) ?? null) : null,
        requestId: r.requestId,
      })),
      // Keyset paging: the log only grows, and counting pages would get slower
      // every month.
      nextBefore: rows.length > query.limit ? page.at(-1)?.createdAt.toISOString() : null,
      scope: this.auth.isDev ? ('all' as const) : ('church' as const),
    };
  }
}

/** Everything a line says that is not this church's business. */
function strip(line: LogLine): LogLine {
  const { rest: _rest, ...rest } = line;
  return rest;
}

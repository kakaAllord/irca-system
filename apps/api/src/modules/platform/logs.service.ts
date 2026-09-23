import { Injectable } from '@nestjs/common';
import { PrismaDb } from '../../core/database/prisma-clients.js';
import { RequestAuth } from '../../core/context/request-auth.js';
import { LogBufferService } from '../../core/logging/log-buffer.service.js';

export type ServerLogQuery = {
  level?: string;
  search?: string;
  since?: number;
  limit: number;
};

export type ActionLogQuery = {
  actorUserId?: string;
  action?: string;
  search?: string;
  before?: string;
  limit: number;
};

/**
 * The two logs the console shows: what the server wrote, and what people did.
 *
 * They answer each other, which is why they are one page: a request that
 * failed at 12:04 and the entry somebody was trying to record at 12:04 are the
 * same story told twice.
 */
@Injectable()
export class DevLogsService {
  constructor(
    private readonly db: PrismaDb,
    private readonly auth: RequestAuth,
    private readonly buffer: LogBufferService,
  ) {}

  /** The recent lines this process wrote. Empty after a restart, and says so. */
  server(query: ServerLogQuery) {
    return { ...this.buffer.list(query), held: this.buffer.size };
  }

  /** What people did, newest first, from the same rows the activity log reads. */
  async actions(query: ActionLogQuery) {
    const rows = await this.db.auditEvent.findMany({
      where: {
        ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
        ...(query.action ? { action: { startsWith: query.action } } : {}),
        ...(query.search ? { summary: { contains: query.search, mode: 'insensitive' } } : {}),
        ...(query.before ? { createdAt: { lt: new Date(query.before) } } : {}),
        // Who viewed the portal as whom belongs to the view-as log and nowhere
        // else (D16), so it is here only for someone who may read that log.
        ...(this.auth.has('dev.impersonations.read')
          ? {}
          : { source: 'feature', impersonationId: null }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });

    const page = rows.slice(0, query.limit);
    const ids = [...new Set(page.flatMap((r) => [r.actorUserId, r.subjectUserId]))].filter(
      (id): id is string => Boolean(id),
    );
    const users = await this.db.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullName: true },
    });
    const names = new Map(users.map((u) => [u.id, u.fullName]));

    return {
      rows: page.map((r) => ({
        id: r.id,
        at: r.createdAt.toISOString(),
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
    };
  }
}

import { Injectable } from '@nestjs/common';
import { Db } from '../../core/database/db.service.js';
import { RequestAuth } from '../../core/context/request-auth.js';

export type ActivityQuery = {
  actorUserId?: string;
  action?: string;
  from?: string;
  to?: string;
  before?: string;
  limit: number;
};

/**
 * What has been changed in this church.
 *
 * Impersonation is not here, and cannot be: those rows are the platform's, and
 * the database refuses them to a church reader as well (D16). The only reader
 * is the dev console's view-as log.
 */
@Injectable()
export class ActivityService {
  constructor(
    private readonly db: Db,
    private readonly auth: RequestAuth,
  ) {}

  async list(query: ActivityQuery) {
    const rows = await this.db.client.auditEvent.findMany({
      where: {
        source: 'feature',
        impersonationId: null,
        ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
        ...(query.action ? { action: { startsWith: query.action } } : {}),
        ...(query.from || query.to
          ? {
              createdAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
              },
            }
          : {}),
        // Keyset paging: the audit log only grows, and counting pages would
        // get slower every month.
        ...(query.before ? { createdAt: { lt: new Date(query.before) } } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });

    const page = rows.slice(0, query.limit);
    const actors = await this.db.client.user.findMany({
      where: {
        id: { in: [...new Set(page.map((r) => r.actorUserId).filter(Boolean))] as string[] },
      },
      select: { id: true, fullName: true },
    });
    const names = new Map(actors.map((a) => [a.id, a.fullName]));

    return {
      rows: page.map((row) => ({
        id: row.id,
        at: row.createdAt.toISOString(),
        who: row.actorUserId ? (names.get(row.actorUserId) ?? 'Someone') : 'The system',
        action: row.action,
        summary: row.summary,
        entityType: row.entityType,
        entityId: row.entityId,
        before: row.before,
        after: row.after,
      })),
      nextBefore: rows.length > query.limit ? page[page.length - 1]!.createdAt.toISOString() : null,
    };
  }
}

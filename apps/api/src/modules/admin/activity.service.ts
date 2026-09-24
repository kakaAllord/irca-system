import { Injectable } from '@nestjs/common';
import { Db } from '../../core/database/db.service.js';
import { RequestAuth } from '../../core/context/request-auth.js';
import { sql, join, type Sql } from '../../core/database/sql.js';

export type ActivityQuery = {
  actorUserId?: string;
  action?: string;
  from?: string;
  to?: string;
  before?: string;
  limit: number;
};

type AuditRow = {
  id: string;
  actorUserId: string | null;
  action: string;
  summary: string | null;
  entityType: string | null;
  entityId: string | null;
  before: unknown;
  after: unknown;
  createdAt: Date;
};

/**
 * What has been changed in this church.
 *
 * Impersonation is not here, and cannot be: `church_audit_events()` can never
 * return one of those rows, whatever this query asks for (D16, enforced in
 * the database, see the init migration). The only reader of them is the dev
 * console's view-as log.
 */
@Injectable()
export class ActivityService {
  constructor(
    private readonly db: Db,
    private readonly auth: RequestAuth,
  ) {}

  async list(query: ActivityQuery) {
    const conditions: Sql[] = [sql`source = 'feature'`];
    if (query.actorUserId) conditions.push(sql`"actorUserId" = ${query.actorUserId}`);
    if (query.action) conditions.push(sql`action like ${query.action + '%'}`);
    if (query.from) conditions.push(sql`"createdAt" >= ${new Date(query.from)}`);
    if (query.to) conditions.push(sql`"createdAt" <= ${new Date(`${query.to}T23:59:59.999Z`)}`);
    // Keyset paging: the audit log only grows, and counting pages would get
    // slower every month.
    if (query.before) conditions.push(sql`"createdAt" < ${new Date(query.before)}`);

    const rows = await this.db.client.$queryRaw<AuditRow[]>`
      select id, "actorUserId", action, summary, "entityType", "entityId", before, after, "createdAt"
      from church_audit_events()
      where ${join(conditions, ' and ')}
      order by "createdAt" desc, id desc
      limit ${query.limit + 1}
    `;

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

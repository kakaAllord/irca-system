import { Injectable } from '@nestjs/common';
import { Db } from '../../core/database/db.service.js';
import { RequestAuth } from '../../core/context/request-auth.js';
import { LogBufferService } from '../../core/logging/log-buffer.service.js';
import { sql, join, type Sql } from '../../core/database/sql.js';

type ActionLogRow = {
  id: string;
  createdAt: Date;
  source: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  summary: string | null;
  actorUserId: string | null;
  subjectUserId: string | null;
  requestId: string | null;
};

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
    private readonly db: Db,
    private readonly auth: RequestAuth,
    private readonly buffer: LogBufferService,
  ) {}

  /** The recent lines this process wrote. Empty after a restart, and says so. */
  server(query: ServerLogQuery) {
    return { ...this.buffer.list(query), held: this.buffer.size };
  }

  /** What people did, newest first, from the same rows the activity log reads. */
  async actions(query: ActionLogQuery) {
    // Who viewed the portal as whom belongs to the view-as log and nowhere
    // else (D16): church_audit_events() cannot return one of those rows
    // however this is filtered, so someone without dev.impersonations.read
    // reads only from it. Someone who may read the view-as log gets both
    // functions merged, oldest distinction gone.
    const source = this.auth.has('dev.impersonations.read')
      ? sql`(select * from church_audit_events() union all select * from impersonation_audit_events())`
      : sql`church_audit_events()`;

    const conditions: Sql[] = [];
    if (query.actorUserId) conditions.push(sql`"actorUserId" = ${query.actorUserId}`);
    if (query.action) conditions.push(sql`action like ${query.action + '%'}`);
    if (query.search) conditions.push(sql`summary ilike ${`%${query.search}%`}`);
    if (query.before) conditions.push(sql`"createdAt" < ${new Date(query.before)}`);

    const rows = await this.db.client.$queryRaw<ActionLogRow[]>`
      select id, "createdAt", source, action, "entityType", "entityId", summary,
             "actorUserId", "subjectUserId", "requestId"
      from ${source} t
      ${conditions.length ? sql`where ${join(conditions, ' and ')}` : sql``}
      order by "createdAt" desc, id desc
      limit ${query.limit + 1}
    `;

    const page = rows.slice(0, query.limit);
    const ids = [...new Set(page.flatMap((r) => [r.actorUserId, r.subjectUserId]))].filter(
      (id): id is string => Boolean(id),
    );
    const users = await this.db.client.user.findMany({
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

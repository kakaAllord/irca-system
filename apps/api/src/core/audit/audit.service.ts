import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { PrismaDb } from '../database/prisma-clients.js';
import type { Tx } from '../database/db.service.js';
import type { RequestContext } from '../context/request-context.js';
import { UsageService } from '../usage/usage.service.js';

export type AuditEventInput = {
  action: string;
  entityType?: string;
  entityId?: string;
  summary?: string;
  before?: unknown;
  after?: unknown;
  meta?: Record<string, unknown>;
};

/** Everything one row of the activity log needs, before it is written. */
export type AuditRow = {
  source?: 'core' | 'feature';
  actorUserId?: string | null;
  subjectUserId?: string | null;
  impersonationId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  summary?: string | null;
  before?: unknown;
  after?: unknown;
  meta?: unknown;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
};

const SECRET = /password|token|secret|hash|key/i;

/** Removes anything that should never be written down, however deep. */
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        SECRET.test(k) ? '[redacted]' : redact(v),
      ]),
    );
  }
  return value;
}

function toJsonb(value: unknown): string | null {
  return value === undefined || value === null ? null : JSON.stringify(redact(value));
}

/**
 * Writes one row of the activity log, without asking Postgres to hand it
 * back.
 *
 * Prisma's `.create()` always runs `INSERT ... RETURNING *`, and returning a
 * row needs the same SELECT privilege as reading it back later — which
 * `irca_app` no longer has on `audit_events` at all (D16: only devs may ever
 * read who viewed the portal as whom, enforced in the database as well as the
 * API, see the init migration). So every write to this table, including this
 * class's own, goes through here: a plain insert with nothing returned.
 */
export async function insertAuditEvent(tx: Pick<Tx, '$executeRaw'>, row: AuditRow): Promise<void> {
  await tx.$executeRaw`
    insert into audit_events
      (id, source, actor_user_id, subject_user_id, impersonation_id, action,
       entity_type, entity_id, summary, before, after, meta, ip, user_agent, request_id)
    values
      (gen_random_uuid(), ${row.source ?? 'core'}, ${row.actorUserId ?? null},
       ${row.subjectUserId ?? null}, ${row.impersonationId ?? null}, ${row.action},
       ${row.entityType ?? null}, ${row.entityId ?? null}, ${row.summary ?? null},
       ${toJsonb(row.before)}::jsonb, ${toJsonb(row.after)}::jsonb, ${toJsonb(row.meta)}::jsonb,
       ${row.ip ?? null}, ${row.userAgent ?? null}, ${row.requestId ?? null})
  `;
}

/**
 * The activity log: what changed, who really did it, and when.
 *
 * Business changes are written with the same transaction as the change itself
 * (recordIn), so the log and the change stand or fall together. Sign-ins,
 * impersonation and other infrastructure events are written immediately
 * (recordNow), since they belong to nobody's own records.
 *
 * Rows are marked 'core' or 'feature'. Church-facing reads only ever see
 * feature rows, and never impersonation, which the database enforces too.
 */
@Injectable()
export class AuditService {
  constructor(
    private readonly db: PrismaDb,
    private readonly cls: ClsService<RequestContext>,
    private readonly usage: UsageService,
  ) {}

  private common(event: AuditEventInput) {
    return {
      actorUserId: this.cls.get('actorUserId'),
      subjectUserId: this.cls.get('userId'),
      impersonationId: this.cls.get('impersonationId'),
      action: event.action,
      entityType: event.entityType ?? null,
      entityId: event.entityId ?? null,
      summary: event.summary ?? null,
      before: event.before,
      after: event.after,
      meta: event.meta,
      ip: this.cls.get('ip'),
      userAgent: this.cls.get('userAgent'),
      requestId: this.cls.getId() ?? null,
    };
  }

  /**
   * Infrastructure events: sign-in, impersonation, jobs. Written straight away.
   *
   * `source` decides who the line is for. 'core' is the platform's own
   * record, which nobody but a dev reads back; 'feature' puts it beside the
   * church's own changes in the ordinary activity log.
   */
  async recordNow(event: AuditEventInput, source: 'core' | 'feature' = 'core'): Promise<void> {
    await insertAuditEvent(this.db, { ...this.common(event), source });
    this.usage.inc('audit.events');
  }

  /**
   * A church's own changes, written inside the transaction that makes them.
   * `tx` is the caller's transaction, so nothing is logged that did not happen.
   */
  async recordIn(tx: Tx, event: AuditEventInput): Promise<void> {
    await insertAuditEvent(tx, { ...this.common(event), source: 'feature' });
    this.usage.inc('audit.events');
  }
}

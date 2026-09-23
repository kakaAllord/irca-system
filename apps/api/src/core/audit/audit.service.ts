import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { Prisma } from '../../generated/prisma/client.js';
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
  /** Only for events that happen outside a request, such as a job. */
  churchId?: string | null;
};

const SECRET = /password|token|secret|hash|key/i;

/** A JSON column is left out entirely when there is nothing to put in it. */
function json(field: 'before' | 'after' | 'meta', value: unknown) {
  if (value === undefined || value === null) return {};
  return { [field]: redact(value) as Prisma.InputJsonValue };
}

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

/**
 * The activity log: what changed, who really did it, and when.
 *
 * Business changes are written with the same transaction as the change itself
 * (recordIn), so the log and the change stand or fall together. Sign-ins,
 * impersonation and other infrastructure events are written immediately
 * (recordNow) through the core connection, since they belong to no church's
 * own records.
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
      ...json('before', event.before),
      ...json('after', event.after),
      ...json('meta', event.meta),
      ip: this.cls.get('ip'),
      userAgent: this.cls.get('userAgent'),
      requestId: this.cls.getId() ?? null,
    };
  }

  /**
   * Infrastructure events: sign-in, impersonation, jobs. Written straight away.
   *
   * `source` decides who the line is for. 'core' is the platform's own record,
   * which a church never reads; 'feature' puts it in the church's activity log
   * beside its own changes, for the few platform acts a church must be told
   * about, such as being paused.
   */
  async recordNow(event: AuditEventInput, source: 'core' | 'feature' = 'core'): Promise<void> {
    await this.db.auditEvent.create({ data: { ...this.common(event), source } });
    this.usage.inc('audit.events', 1, event.churchId !== undefined ? event.churchId : undefined);
  }

  /**
   * A church's own changes, written inside the transaction that makes them.
   * `tx` is the caller's transaction, so nothing is logged that did not happen.
   */
  async recordIn(tx: Tx, event: AuditEventInput): Promise<void> {
    await tx.auditEvent.create({ data: { ...this.common(event), source: 'feature' } });
    this.usage.inc('audit.events');
  }
}

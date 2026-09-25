import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@irca/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { Db } from '../../core/database/db.service.js';
import { RequestAuth } from '../../core/context/request-auth.js';
import { AppError, notFound } from '../../core/http/app-error.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { AudiencesService } from './audiences.service.js';
import { AudienceRegistry } from '../../core/comms/audience.registry.js';

const STATUSES = ['SCHEDULED', 'SENDING', 'SENT', 'PARTIAL', 'FAILED', 'CANCELLED'] as const;
export type HistoryQuery = { departmentId?: string | null; status?: string; page?: number };

/** '+255712345678' → '+255 7•• ••• 678': enough to recognise, not to dial. */
const mask = (phone: string) => (phone ? `${phone.slice(0, 5)}•• ••• ${phone.slice(-3)}` : '');

/**
 * What was sent (07 step 7.14, History). Communications reads everything; a
 * department's leaders read their own department's and nothing else. Phone
 * numbers are shown whole only to someone who may read Membership's
 * sensitive details.
 */
@Injectable()
export class MessagesService {
  constructor(
    private readonly db: Db,
    private readonly auth: RequestAuth,
    private readonly audit: AuditService,
    private readonly audiences: AudiencesService,
    private readonly registry: AudienceRegistry,
  ) {}

  async list(query: HistoryQuery) {
    const where: Prisma.CommsMessageWhereInput = {};
    if (this.auth.has('comms.messages.read')) {
      if (query.departmentId !== undefined) where.departmentId = query.departmentId;
    } else {
      if (!query.departmentId) {
        throw new AppError(403, ErrorCode.FORBIDDEN, 'Choose one of the departments you lead.');
      }
      await this.audiences.requireLeads(query.departmentId, 'read');
      where.departmentId = query.departmentId;
    }
    if (query.status && (STATUSES as readonly string[]).includes(query.status)) {
      where.status = query.status as (typeof STATUSES)[number];
    }
    const pageSize = 25;
    const page = Math.max(1, query.page ?? 1);
    const [rows, total] = await Promise.all([
      this.db.client.commsMessage.findMany({
        where,
        include: {
          department: { select: { id: true, name: true } },
          template: { select: { id: true, name: true, version: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.client.commsMessage.count({ where }),
    ]);
    const counts = await this.counts(rows.map((r) => r.id));
    return {
      total,
      page,
      pageSize,
      rows: rows.map((m) => ({
        id: m.id,
        department: m.department,
        audienceName: m.audienceName,
        template: m.template,
        status: m.status,
        createdAt: m.createdAt.toISOString(),
        scheduledFor: m.scheduledFor?.toISOString() ?? null,
        recipientCount: m.recipientCount,
        skippedCount: m.skippedCount,
        segments: m.segments,
        cost: m.cost.toFixed(2),
        byStatus: counts.get(m.id) ?? {},
        fromBeat: m.scheduleId !== null,
      })),
    };
  }

  async get(id: string) {
    const m = await this.db.client.commsMessage.findUnique({
      where: { id },
      include: {
        department: { select: { id: true, name: true } },
        template: { select: { id: true, name: true, version: true } },
        recipients: {
          orderBy: { id: 'asc' },
          select: {
            id: true,
            phone: true,
            lang: true,
            status: true,
            segments: true,
            lastError: true,
            sentAt: true,
            deliveredAt: true,
            person: { select: { fullName: true } },
            userId: true,
          },
        },
      },
    });
    if (!m) throw notFound('No such message.');
    await this.requireMayRead(m.departmentId);
    const whole = this.auth.has('membership.people.read_sensitive');
    // Who a pledge reminder reached is who owes: not for every reader of history.
    const guard = this.registry.find(m.audienceKey)?.readPermission;
    const recipientsHidden = !!guard && !this.auth.has(guard);
    const users = await this.db.client.user.findMany({
      where: { id: { in: m.recipients.map((r) => r.userId).filter((u): u is string => !!u) } },
      select: { id: true, fullName: true },
    });
    const creator = m.createdById
      ? await this.db.client.user.findUnique({
          where: { id: m.createdById },
          select: { fullName: true },
        })
      : null;
    return {
      id: m.id,
      department: m.department,
      audienceName: m.audienceName,
      template: m.template,
      bodies: m.bodies,
      fields: m.fields,
      status: m.status,
      createdAt: m.createdAt.toISOString(),
      createdBy: creator?.fullName ?? (m.scheduleId ? 'A recurring message' : null),
      scheduledFor: m.scheduledFor?.toISOString() ?? null,
      finishedAt: m.finishedAt?.toISOString() ?? null,
      segments: m.segments,
      cost: m.cost.toFixed(2),
      byStatus: (await this.counts([m.id])).get(m.id) ?? {},
      recipientsHidden,
      recipients: (recipientsHidden ? [] : m.recipients).map((r) => ({
        id: r.id,
        name: r.person?.fullName ?? users.find((u) => u.id === r.userId)?.fullName ?? '—',
        phone: whole ? r.phone : mask(r.phone),
        lang: r.lang,
        status: r.status,
        segments: r.segments,
        error: r.lastError,
        sentAt: r.sentAt?.toISOString() ?? null,
        deliveredAt: r.deliveredAt?.toISOString() ?? null,
      })),
    };
  }

  /**
   * Stops what has not gone yet. Communications may stop any message; a
   * leader, their own department's.
   */
  async cancel(id: string) {
    const m = await this.db.client.commsMessage.findUnique({ where: { id } });
    if (!m) throw notFound('No such message.');
    if (!this.auth.has('comms.messages.cancel')) {
      if (!m.departmentId)
        throw new AppError(403, ErrorCode.FORBIDDEN, 'Only Communications can stop this.');
      await this.audiences.requireLeads(m.departmentId, 'send');
    }
    if (m.status !== 'SCHEDULED' && m.status !== 'SENDING') {
      throw new AppError(409, ErrorCode.CONFLICT, 'It has already finished.');
    }
    await this.db.tx(async (tx) => {
      const { count } = await tx.commsRecipient.updateMany({
        where: { messageId: id, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
      await tx.commsMessage.update({
        where: { id },
        data: { status: 'CANCELLED', cancelledById: this.auth.actorUserId, finishedAt: new Date() },
      });
      await this.audit.recordIn(tx, {
        action: 'comms.message.cancelled',
        entityType: 'comms_message',
        entityId: id,
        summary: `Stopped the message to ${m.audienceName}: ${count} not sent`,
      });
    });
  }

  private async requireMayRead(departmentId: string | null) {
    if (this.auth.has('comms.messages.read')) return;
    if (!departmentId)
      throw new AppError(403, ErrorCode.FORBIDDEN, 'You do not lead this department.');
    await this.audiences.requireLeads(departmentId, 'read');
  }

  private async counts(ids: string[]) {
    const rows = ids.length
      ? await this.db.client.commsRecipient.groupBy({
          by: ['messageId', 'status'],
          where: { messageId: { in: ids } },
          _count: { _all: true },
        })
      : [];
    const out = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const entry = out.get(r.messageId) ?? {};
      entry[r.status] = r._count._all;
      out.set(r.messageId, entry);
    }
    return out;
  }
}

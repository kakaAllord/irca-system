import { Injectable } from '@nestjs/common';
import { ErrorCode, moduleByKey, type ChangeRequestView } from '@irca/shared';
import { AppConfig } from '../../config/app-config.js';
import type { ChangeRequest } from '../../generated/prisma/client.js';
import { Db, type TenantTx } from '../database/db.service.js';
import { PrismaCore } from '../database/prisma-clients.js';
import { AppError } from '../http/app-error.js';
import { RequestAuth } from '../context/request-auth.js';
import { AuditService } from '../audit/audit.service.js';
import { EmailService } from '../email/email.service.js';
import { UsageService } from '../usage/usage.service.js';
import { text } from '../values.js';
import { ChangeRequestRegistry } from './registry.service.js';
import type { ChangeAction } from './handler.js';

export type CreateChangeRequest = {
  entityType: string;
  entityId: string;
  action: ChangeAction;
  proposed: Record<string, unknown>;
  reason: string;
};

export type ChangeRequestQuery = {
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  moduleKey?: string;
  /** Only the ones the reader asked for. */
  mine?: boolean;
  limit?: number;
};

/**
 * Asking an administrator to change a record that may not be changed directly.
 *
 * The owner's rule for money is that corrections go to the church admin, and
 * this is that rule as code (D17). Nothing here knows what a finance entry is:
 * a module registers a handler, and this decides who may ask, who may decide,
 * and that nobody decides their own request.
 */
@Injectable()
export class ChangeRequestService {
  constructor(
    private readonly db: Db,
    private readonly core: PrismaCore,
    private readonly config: AppConfig,
    private readonly auth: RequestAuth,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly usage: UsageService,
    private readonly registry: ChangeRequestRegistry,
  ) {}

  /** Someone asks for a change. Nothing about the record moves yet. */
  async create(input: CreateChangeRequest): Promise<{ id: string }> {
    const churchId = this.auth.requireChurch();
    const userId = this.auth.userId!;
    const handler = this.registry.require(input.entityType);

    const { id, label, change, reason } = await this.db.tx(async (tx) => {
      const entity = await handler.describe(tx, input.entityId);
      if (!entity) throw new AppError(404, ErrorCode.NOT_FOUND, 'No such record.');

      // Only what really differs: a "change" that changes nothing wastes an
      // administrator's attention.
      const proposed =
        input.action === 'VOID' ? {} : onlyDifferences(entity.before, input.proposed);
      if (input.action === 'EDIT' && Object.keys(proposed).length === 0) {
        throw new AppError(400, ErrorCode.VALIDATION_FAILED, 'Nothing would change.', {
          proposed: ['Change something before asking'],
        });
      }
      await handler.validate(tx, { action: input.action, proposed, before: entity.before });
      const explained = await handler.explain(tx, {
        action: input.action,
        proposed,
        before: entity.before,
      });

      const created = await tx.changeRequest
        .create({
          data: {
            churchId,
            moduleKey: handler.moduleKey,
            entityType: handler.entityType,
            entityId: input.entityId,
            entityLabel: entity.label,
            action: input.action,
            before: entity.before as never,
            proposed: proposed as never,
            reason: input.reason,
            requestedById: userId,
          },
        })
        .catch((err: unknown) => {
          // The partial unique index is what really enforces one open request:
          // two people asking at the same moment cannot both get through.
          if (isUniqueViolation(err)) {
            throw new AppError(
              409,
              ErrorCode.REQUEST_ALREADY_OPEN,
              'A change is already waiting for approval on this record.',
            );
          }
          throw err;
        });

      await this.audit.recordIn(tx, {
        action: 'change_request.created',
        entityType: 'change_request',
        entityId: created.id,
        summary: `Asked to ${input.action === 'VOID' ? 'void' : 'correct'} ${entity.label}`,
        after: { proposed, reason: input.reason },
        meta: { entityType: handler.entityType, entityId: input.entityId },
      });

      return {
        id: created.id,
        label: entity.label,
        change:
          input.action === 'VOID'
            ? 'Void this entry.'
            : explained.changes.map((c) => `${c.label}: ${c.from} → ${c.to}`).join('; '),
        reason: input.reason,
      };
    });

    await this.notifyApprovers(churchId, userId, { id, label, change, reason });
    this.usage.inc('change_requests.created');
    return { id };
  }

  /** The requester changed their mind, while nobody has decided yet. */
  async cancel(id: string): Promise<void> {
    const userId = this.auth.userId!;
    await this.db.tx(async (tx) => {
      const request = await this.lock(tx, id);
      if (request.requestedById !== userId) {
        throw new AppError(403, ErrorCode.FORBIDDEN, 'Only the person who asked can cancel it.');
      }
      await tx.changeRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
      await this.audit.recordIn(tx, {
        action: 'change_request.cancelled',
        entityType: 'change_request',
        entityId: id,
        summary: `Cancelled the change asked for on ${request.entityLabel}`,
      });
    });
    this.usage.inc('change_requests.cancelled');
  }

  /**
   * An administrator says yes. Deciding and applying happen in one
   * transaction, so a record can never be changed by a request that is not
   * recorded as approved, nor approved without the change being made.
   */
  async approve(id: string, note?: string): Promise<{ result: Record<string, unknown> | null }> {
    const decidedById = this.auth.userId!;
    const outcome = await this.db.tx(async (tx) => {
      const request = await this.lock(tx, id);
      const handler = this.registry.require(request.entityType);
      if (request.requestedById === decidedById) {
        throw new AppError(
          409,
          ErrorCode.CANNOT_DECIDE_OWN_REQUEST,
          'Another administrator must decide this. Nobody approves their own change.',
        );
      }

      const entity = await handler.describe(tx, request.entityId);
      if (!entity) throw new AppError(404, ErrorCode.NOT_FOUND, 'The record no longer exists.');
      // What was approved must be what was asked about. If the record moved on,
      // the "before" an administrator is reading is fiction.
      if (!sameValues(entity.before, request.before as Record<string, unknown>)) {
        await tx.changeRequest.update({
          where: { id },
          data: {
            status: 'CANCELLED',
            decisionNote: 'The entry changed since this was asked',
          },
        });
        throw new AppError(
          409,
          ErrorCode.REQUEST_STALE,
          'The entry changed since this was asked. The request was withdrawn.',
        );
      }

      const proposed = request.proposed as Record<string, unknown>;
      await handler.validate(tx, {
        action: request.action as ChangeAction,
        proposed,
        before: entity.before,
      });

      // Approved first: the record's own trigger refuses any change that is
      // not backed by an approved, unapplied request.
      const approved = await tx.changeRequest.update({
        where: { id },
        data: {
          status: 'APPROVED',
          decidedById,
          decidedAt: new Date(),
          decisionNote: note ?? null,
        },
      });
      const result = await handler.apply(tx, approved);
      await tx.changeRequest.update({
        where: { id },
        data: { appliedAt: new Date(), result: (result ?? {}) as never },
      });

      await this.audit.recordIn(tx, {
        action: 'change_request.approved',
        entityType: 'change_request',
        entityId: id,
        summary: `Approved the change to ${request.entityLabel}`,
        before: request.before,
        after: { proposed, result },
      });
      return { request, result };
    });

    await this.notifyRequester(outcome.request, 'approved', note);
    this.usage.inc('change_requests.applied');
    return { result: outcome.result };
  }

  /** An administrator says no, and says why. Nothing about the record changes. */
  async reject(id: string, note: string): Promise<void> {
    const decidedById = this.auth.userId!;
    const request = await this.db.tx(async (tx) => {
      const row = await this.lock(tx, id);
      if (row.requestedById === decidedById) {
        throw new AppError(
          409,
          ErrorCode.CANNOT_DECIDE_OWN_REQUEST,
          'Another administrator must decide this.',
        );
      }
      await tx.changeRequest.update({
        where: { id },
        data: { status: 'REJECTED', decidedById, decidedAt: new Date(), decisionNote: note },
      });
      await this.audit.recordIn(tx, {
        action: 'change_request.rejected',
        entityType: 'change_request',
        entityId: id,
        summary: `Rejected the change to ${row.entityLabel}: ${note}`,
      });
      return row;
    });
    await this.notifyRequester(request, 'rejected', note);
    this.usage.inc('change_requests.rejected');
  }

  async list(query: ChangeRequestQuery): Promise<ChangeRequestView[]> {
    const churchId = this.auth.requireChurch();
    const rows = await this.db.client.changeRequest.findMany({
      where: {
        churchId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.moduleKey ? { moduleKey: query.moduleKey } : {}),
        ...(query.mine ? { requestedById: this.auth.userId! } : {}),
      },
      orderBy: { requestedAt: 'desc' },
      take: query.limit ?? 50,
    });
    return this.views(rows);
  }

  async get(id: string): Promise<ChangeRequestView> {
    const churchId = this.auth.requireChurch();
    const row = await this.db.client.changeRequest.findFirst({ where: { id, churchId } });
    if (!row) throw new AppError(404, ErrorCode.NOT_FOUND, 'No such request.');
    return (await this.views([row]))[0]!;
  }

  /** The requests open on one record, for the record's own page. */
  async openFor(entityType: string, entityId: string): Promise<ChangeRequestView | null> {
    const churchId = this.auth.requireChurch();
    const row = await this.db.client.changeRequest.findFirst({
      where: { churchId, entityType, entityId, status: 'PENDING' },
    });
    return row ? ((await this.views([row]))[0] ?? null) : null;
  }

  /** The number on the sidebar's Requests badge. */
  async pendingCount(churchId: string): Promise<number> {
    return this.core.changeRequest.count({ where: { churchId, status: 'PENDING' } });
  }

  /** Turns stored rows into what a page shows: names, words and warnings. */
  private async views(rows: ChangeRequest[]): Promise<ChangeRequestView[]> {
    if (!rows.length) return [];
    const people = await this.db.client.user.findMany({
      where: {
        id: {
          in: [
            ...new Set(rows.flatMap((r) => [r.requestedById, r.decidedById].filter(Boolean))),
          ] as string[],
        },
      },
      select: { id: true, fullName: true },
    });
    const names = new Map(people.map((p) => [p.id, p.fullName]));
    const roles = await this.rolesOf(rows.map((r) => r.requestedById));

    return this.db.tx(async (tx) =>
      Promise.all(
        rows.map(async (row) => {
          const handler = this.registry.find(row.entityType);
          const before = row.before as Record<string, unknown>;
          const proposed = row.proposed as Record<string, unknown>;
          const explained = handler
            ? await handler.explain(tx, {
                action: row.action as ChangeAction,
                proposed,
                before,
              })
            : { changes: [], warning: null };
          const entity = handler ? await handler.describe(tx, row.entityId) : null;

          return {
            id: row.id,
            moduleKey: row.moduleKey,
            moduleName: moduleByKey(row.moduleKey)?.name ?? row.moduleKey,
            entityType: row.entityType,
            entityId: row.entityId,
            entityLabel: row.entityLabel,
            entityHref: entity?.href ?? null,
            action: row.action as ChangeAction,
            reason: row.reason,
            status: row.status,
            changes: explained.changes,
            warning: explained.warning,
            requestedBy: {
              id: row.requestedById,
              fullName: names.get(row.requestedById) ?? 'Someone',
              roles: roles.get(row.requestedById) ?? [],
            },
            requestedAt: row.requestedAt.toISOString(),
            decidedBy: row.decidedById
              ? { id: row.decidedById, fullName: names.get(row.decidedById) ?? 'Someone' }
              : null,
            decidedAt: row.decidedAt?.toISOString() ?? null,
            decisionNote: row.decisionNote,
            result: (row.result as { newCode?: string } | null) ?? null,
            isMine: row.requestedById === this.auth.userId,
          };
        }),
      ),
    );
  }

  private async rolesOf(userIds: string[]): Promise<Map<string, string[]>> {
    const churchId = this.auth.requireChurch();
    const rows = await this.db.client.membershipRole.findMany({
      where: {
        churchId,
        membership: { userId: { in: [...new Set(userIds)] } },
        role: { deletedAt: null },
      },
      include: { role: { select: { name: true } }, membership: { select: { userId: true } } },
    });
    const out = new Map<string, string[]>();
    for (const row of rows) {
      const list = out.get(row.membership.userId) ?? [];
      list.push(row.role.name);
      out.set(row.membership.userId, list);
    }
    return out;
  }

  /** Holds the row for the rest of the transaction, so two decisions cannot race. */
  private async lock(tx: TenantTx, id: string): Promise<ChangeRequest> {
    const churchId = this.auth.requireChurch();
    await tx.$executeRaw`
      -- tenant: church_id is pinned here as well as by row-level security
      select 1 from change_requests where id = ${id}::uuid and church_id = ${churchId}::uuid for update`;
    const request = await tx.changeRequest.findFirst({ where: { id, churchId } });
    if (!request) throw new AppError(404, ErrorCode.NOT_FOUND, 'No such request.');
    if (request.status !== 'PENDING') {
      throw new AppError(409, ErrorCode.CONFLICT, 'This request has already been decided.');
    }
    return request;
  }

  /**
   * Everyone who may decide, except the person asking: they cannot decide it,
   * so telling them would only be noise.
   */
  private async notifyApprovers(
    churchId: string,
    requesterId: string,
    what: { id: string; label: string; change: string; reason: string },
  ): Promise<void> {
    const requester = await this.core.user.findUnique({
      where: { id: requesterId },
      select: { fullName: true },
    });
    const approvers = await this.core.$queryRaw<{ email: string; full_name: string }[]>`
      select distinct u.email, u.full_name
      from church_memberships m
      join users u             on u.id = m.user_id and u.status = 'ACTIVE'
      join membership_roles mr on mr.membership_id = m.id and mr.church_id = m.church_id
      join roles r             on r.id = mr.role_id and r.church_id = m.church_id and r.deleted_at is null
      join role_permissions rp on rp.role_id = r.id and rp.church_id = r.church_id
      where m.church_id = ${churchId}::uuid
        and m.status = 'ACTIVE'
        and rp.permission_key = 'admin.requests.decide'
        and m.user_id <> ${requesterId}::uuid`;

    for (const approver of approvers) {
      await this.email.enqueueNow({
        to: approver.email,
        template: 'change-request-submitted',
        churchId,
        payload: {
          requesterName: requester?.fullName ?? 'Someone',
          what: what.label,
          change: what.change,
          reason: what.reason,
          link: `${this.config.get('PORTAL_ORIGIN')}/admin/requests`,
        },
      });
    }
  }

  private async notifyRequester(
    request: ChangeRequest,
    decision: 'approved' | 'rejected',
    note?: string,
  ): Promise<void> {
    const requester = await this.core.user.findUnique({
      where: { id: request.requestedById },
      select: { email: true, fullName: true },
    });
    if (!requester) return;
    await this.email.enqueueNow({
      to: requester.email,
      template: 'change-request-decided',
      churchId: request.churchId,
      payload: {
        personName: requester.fullName,
        what: request.entityLabel,
        decision,
        note,
        // The module's own page: core does not know what a finance entry is.
        link: `${this.config.get('PORTAL_ORIGIN')}${moduleByKey(request.moduleKey)?.home ?? ''}`,
      },
    });
  }
}

/** Only the fields that really differ, compared as the database stores them. */
function onlyDifferences(
  before: Record<string, unknown>,
  proposed: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(proposed).filter(
      ([key, value]) => value !== undefined && text(value) !== text(before[key]),
    ),
  );
}

function sameValues(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((key) => text(a[key]) === text(b[key]));
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

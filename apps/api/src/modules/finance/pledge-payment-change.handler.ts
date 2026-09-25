import { Injectable, OnModuleInit } from '@nestjs/common';
import { ErrorCode, PAYMENT_METHODS, formatMoney, type PaymentMethod } from '@irca/shared';
import type { ChangeRequest, PledgePayment } from '../../generated/prisma/client.js';
import type { Tx } from '../../core/database/db.service.js';
import { AppError, notFound } from '../../core/http/app-error.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { UsageService } from '../../core/usage/usage.service.js';
import { ChangeRequestRegistry } from '../../core/change-requests/registry.service.js';
import type {
  ChangeAction,
  ChangeLine,
  ChangeRequestHandler,
  DescribedEntity,
} from '../../core/change-requests/handler.js';
import { text } from '../../core/values.js';
import { checkLink, settle, today } from './pledges.service.js';

/** The fields a request may ask to change. Which pledge it was for is not one. */
const LABELS: Record<string, string> = {
  amount: 'Amount',
  paidOn: 'Paid on',
  method: 'Paid by',
  transactionId: 'Income entry',
  note: 'Note',
};

/**
 * How a payment towards a pledge is corrected or voided: never directly,
 * always through a request an administrator approves (D17), as a finance
 * entry is. After the change the pledge is settled again, so a void that
 * takes it back below its amount reopens it, and a correction that makes up
 * the difference marks it paid in full.
 *
 * What an administrator reads names the campaign and the amounts, never the
 * person: names against amounts belong to the few the leadership chose.
 */
@Injectable()
export class PledgePaymentChangeHandler implements ChangeRequestHandler, OnModuleInit {
  readonly moduleKey = 'finance';
  readonly entityType = 'pledge_payment';

  constructor(
    private readonly registry: ChangeRequestRegistry,
    private readonly audit: AuditService,
    private readonly usage: UsageService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async describe(tx: Tx, entityId: string): Promise<DescribedEntity | null> {
    const row = await this.row(tx, entityId);
    if (!row) return null;
    return {
      label: `Pledge payment · ${row.pledge.campaign.name} · ${longDate(day(row.paidOn))}`,
      href: `/finance/pledges/${row.pledge.campaignId}/${row.pledgeId}`,
      before: valuesOf(row),
    };
  }

  async validate(
    tx: Tx,
    input: {
      entityId: string;
      action: ChangeAction;
      proposed: Record<string, unknown>;
      before: Record<string, unknown>;
    },
  ): Promise<void> {
    const row = await this.row(tx, input.entityId);
    if (!row) throw notFound('No such payment.');
    if (row.status === 'VOIDED') {
      throw new AppError(409, ErrorCode.CONFLICT, 'This payment was voided and cannot change.');
    }
    if (input.action === 'VOID') return;
    const proposed = input.proposed;

    if (proposed.paidOn && text(proposed.paidOn) > (await today(tx))) {
      throw new AppError(422, ErrorCode.VALIDATION_FAILED, 'That date is in the future.', {
        paidOn: ['A payment cannot be dated later than today'],
      });
    }
    // A new amount against a linked entry, or a new link, must still fit
    // inside what the entry holds, this payment left out of the sum.
    const link =
      proposed.transactionId !== undefined
        ? text(proposed.transactionId)
        : text(input.before.transactionId);
    if (link && (proposed.amount !== undefined || proposed.transactionId !== undefined)) {
      const amount = text(proposed.amount ?? input.before.amount);
      await checkLink(tx, link, amount, input.entityId);
    }
  }

  async explain(
    tx: Tx,
    input: {
      action: ChangeAction;
      proposed: Record<string, unknown>;
      before: Record<string, unknown>;
    },
  ): Promise<{ changes: ChangeLine[]; warning: string | null }> {
    if (input.action === 'VOID') {
      return {
        changes: [],
        warning:
          'The payment stays in the records and stops counting towards the pledge. A pledge it had paid in full is open again.',
      };
    }
    const codes = await this.codes(tx, [input.before.transactionId, input.proposed.transactionId]);
    const show = (field: string, value: unknown): string => {
      if (value === undefined || value === null || value === '') return '—';
      if (field === 'amount') return formatMoney(text(value), '');
      if (field === 'paidOn') return longDate(text(value));
      if (field === 'method') return PAYMENT_METHODS[value as PaymentMethod] ?? text(value);
      if (field === 'transactionId') return codes.get(text(value)) ?? 'Unknown';
      return text(value);
    };
    return {
      changes: Object.keys(input.proposed).map((field) => ({
        field,
        label: LABELS[field] ?? field,
        from: show(field, input.before[field]),
        to: show(field, input.proposed[field]),
      })),
      warning: null,
    };
  }

  async apply(tx: Tx, request: ChangeRequest): Promise<Record<string, unknown> | null> {
    const found = await this.row(tx, request.entityId);
    if (!found) throw notFound('The payment no longer exists.');
    // The pledge is held, as when a payment is recorded, so its balance is
    // settled against payments nobody else is changing.
    await tx.$executeRaw`select 1 from pledges where id = ${found.pledgeId}::uuid for update`;
    const row = (await this.row(tx, request.entityId))!;
    const proposed = request.proposed as Record<string, unknown>;

    if ((request.action as ChangeAction) === 'VOID') {
      await tx.pledgePayment.update({
        where: { id: row.id },
        data: {
          status: 'VOIDED',
          voidedAt: new Date(),
          voidedById: request.decidedById,
          voidReason: request.reason.slice(0, 500),
          appliedRequestId: request.id,
          revision: { increment: 1 },
        },
      });
    } else {
      await tx.pledgePayment.update({
        where: { id: row.id },
        data: {
          ...(proposed.amount !== undefined ? { amount: text(proposed.amount) } : {}),
          ...(proposed.paidOn !== undefined
            ? { paidOn: new Date(`${text(proposed.paidOn)}T00:00:00Z`) }
            : {}),
          ...(proposed.method !== undefined ? { method: proposed.method as PaymentMethod } : {}),
          ...(proposed.transactionId !== undefined
            ? { transactionId: text(proposed.transactionId) || null }
            : {}),
          ...(proposed.note !== undefined ? { note: text(proposed.note) } : {}),
          appliedRequestId: request.id,
          revision: { increment: 1 },
        },
      });
    }
    const settled = await settle(tx, row.pledgeId);
    const updated = (await this.row(tx, row.id))!;

    const voided = (request.action as ChangeAction) === 'VOID';
    await this.audit.recordIn(tx, {
      action: voided ? 'finance.pledge.payment_voided' : 'finance.pledge.payment_changed',
      entityType: 'pledge',
      entityId: row.pledgeId,
      summary:
        `${voided ? 'Voided' : 'Corrected'} a payment towards "${row.pledge.campaign.name}": ${request.reason}` +
        (settled.status !== row.pledge.status
          ? settled.status === 'OPEN'
            ? '. The pledge is open again'
            : '. The pledge is paid in full'
          : ''),
      before: valuesOf(row),
      after: valuesOf(updated),
      meta: { requestId: request.id, paymentId: row.id },
    });
    if (voided) this.usage.inc('finance.pledges.payments.voided');
    return { pledgeStatus: settled.status };
  }

  private row(tx: Tx, id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return Promise.resolve(null);
    return tx.pledgePayment.findFirst({
      where: { id },
      include: {
        pledge: {
          select: { campaignId: true, status: true, campaign: { select: { name: true } } },
        },
      },
    });
  }

  private async codes(tx: Tx, ids: unknown[]): Promise<Map<string, string>> {
    const wanted = [...new Set(ids.map(text).filter(Boolean))];
    if (!wanted.length) return new Map();
    const rows = await tx.financeTransaction.findMany({
      where: { id: { in: wanted } },
      select: { id: true, code: true },
    });
    return new Map(rows.map((r) => [r.id, r.code]));
  }
}

/** The proposable values of a payment, in the shape a request stores them. */
function valuesOf(row: PledgePayment): Record<string, unknown> {
  return {
    amount: row.amount.toFixed(2),
    paidOn: day(row.paidOn),
    method: row.method,
    transactionId: row.transactionId,
    note: row.note,
  };
}

const day = (d: Date) => d.toISOString().slice(0, 10);

const longDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

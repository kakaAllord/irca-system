import { randomUUID } from 'node:crypto';
import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  ErrorCode,
  PAYMENT_METHODS,
  formatMoney,
  formatTransactionCode,
  sequenceKey,
  type PaymentMethod,
} from '@irca/shared';
import type { ChangeRequest, FinanceTransaction } from '../../generated/prisma/client.js';
import type { Tx } from '../../core/database/db.service.js';
import { RequestAuth } from '../../core/context/request-auth.js';
import { AppError } from '../../core/http/app-error.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { UsageService } from '../../core/usage/usage.service.js';
import { SequenceService } from '../../core/sequences/sequence.service.js';
import { ChangeRequestRegistry } from '../../core/change-requests/registry.service.js';
import type {
  ChangeAction,
  ChangeLine,
  ChangeRequestHandler,
  DescribedEntity,
} from '../../core/change-requests/handler.js';
import { text } from '../../core/values.js';
import { CatalogService } from './catalog.service.js';

/** The fields a request may ask to change. The kind of an entry is not one. */
const LABELS: Record<string, string> = {
  txnDate: 'Date',
  incomeSourceId: 'Income source',
  expenseItemId: 'Expense item',
  amount: 'Amount',
  method: 'Paid by',
  reference: 'Reference',
  counterparty: 'Payer or payee',
  notes: 'Notes',
};

/**
 * How a finance entry is corrected or voided: never directly, always through
 * a request an administrator approves (D17).
 *
 * The interesting case is a date that moves the entry into another month. The
 * month is part of the number, and numbers never change, so the entry is
 * replaced: a new one in the right month, the old one voided and pointing at
 * it. Both numbers then still tell the truth.
 */
@Injectable()
export class TransactionChangeHandler implements ChangeRequestHandler, OnModuleInit {
  readonly moduleKey = 'finance';
  readonly entityType = 'finance_transaction';

  constructor(
    private readonly registry: ChangeRequestRegistry,
    private readonly auth: RequestAuth,
    private readonly audit: AuditService,
    private readonly usage: UsageService,
    private readonly sequences: SequenceService,
    private readonly catalog: CatalogService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async describe(tx: Tx, entityId: string): Promise<DescribedEntity | null> {
    const row = await this.row(tx, entityId);
    if (!row) return null;
    return {
      label: row.code,
      href: `/finance/transactions/${row.code}`,
      before: valuesOf(row),
    };
  }

  async validate(
    tx: Tx,
    input: {
      action: ChangeAction;
      proposed: Record<string, unknown>;
      before: Record<string, unknown>;
    },
  ): Promise<void> {
    if (input.action === 'VOID') return;
    const proposed = input.proposed;

    // A change may not turn an expense into income: that is two entries, one
    // voided and one recorded, not an edit.
    if (proposed.incomeSourceId && !input.before.incomeSourceId) {
      throw new AppError(422, ErrorCode.VALIDATION_FAILED, 'An expense cannot become income.');
    }
    if (proposed.expenseItemId && !input.before.expenseItemId) {
      throw new AppError(422, ErrorCode.VALIDATION_FAILED, 'Income cannot become an expense.');
    }
    if (proposed.incomeSourceId) {
      await this.catalog.requireUsable(tx, 'income', text(proposed.incomeSourceId));
    }
    if (proposed.expenseItemId) {
      await this.catalog.requireUsable(tx, 'expense', text(proposed.expenseItemId));
    }
    if (proposed.txnDate) {
      const church = await tx.church.findFirstOrThrow();
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: church.timezone }).format(
        new Date(),
      );
      if (text(proposed.txnDate) > today) {
        throw new AppError(422, ErrorCode.VALIDATION_FAILED, 'That date is in the future.', {
          txnDate: ['An entry cannot be dated later than today'],
        });
      }
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
        warning: 'The entry keeps its number and stops counting in the totals.',
      };
    }

    const names = await this.itemNames(tx, [
      input.before.incomeSourceId,
      input.before.expenseItemId,
      input.proposed.incomeSourceId,
      input.proposed.expenseItemId,
    ]);
    const show = (field: string, value: unknown): string => {
      if (value === undefined || value === null || value === '') return '—';
      if (field === 'amount') return formatMoney(text(value), '');
      if (field === 'method') return PAYMENT_METHODS[value as PaymentMethod] ?? text(value);
      if (field.endsWith('Id')) return names.get(text(value)) ?? 'Unknown';
      return text(value);
    };

    const changes = Object.keys(input.proposed).map((field) => ({
      field,
      label: LABELS[field] ?? field,
      from: show(field, input.before[field]),
      to: show(field, input.proposed[field]),
    }));

    const warning = this.monthMove(input)
      ? `Approving this moves the entry to ${monthName(text(input.proposed.txnDate))}. It gets a new number, and this one is voided and points to it.`
      : null;
    return { changes, warning };
  }

  async apply(tx: Tx, request: ChangeRequest): Promise<Record<string, unknown> | null> {
    const row = await this.row(tx, request.entityId);
    if (!row) throw new AppError(404, ErrorCode.NOT_FOUND, 'The entry no longer exists.');
    const proposed = request.proposed as Record<string, unknown>;
    const action = request.action as ChangeAction;

    if (action === 'VOID') {
      await this.void(tx, row, request, request.reason);
      await this.audit.recordIn(tx, {
        action: 'finance.transaction.voided',
        entityType: 'finance_transaction',
        entityId: row.code,
        summary: `Voided ${row.code}: ${request.reason}`,
        before: valuesOf(row),
        meta: { requestId: request.id },
      });
      this.usage.inc('finance.transactions.voided');
      return null;
    }

    if (this.monthMove({ before: valuesOf(row), proposed })) {
      const replacement = await this.replace(tx, row, request, proposed);
      await this.audit.recordIn(tx, {
        action: 'finance.transaction.replaced',
        entityType: 'finance_transaction',
        entityId: row.code,
        summary: `Moved ${row.code} to ${replacement.code}`,
        before: valuesOf(row),
        after: valuesOf(replacement),
        meta: { requestId: request.id, newCode: replacement.code },
      });
      this.usage.inc('finance.transactions.replaced');
      return { newCode: replacement.code };
    }

    const updated = await tx.financeTransaction.update({
      where: { id: row.id },
      data: {
        ...this.changes(proposed),
        appliedRequestId: request.id,
        revision: { increment: 1 },
      },
    });
    await this.audit.recordIn(tx, {
      action: 'finance.transaction.changed',
      entityType: 'finance_transaction',
      entityId: row.code,
      summary: `Corrected ${row.code}: ${request.reason}`,
      before: valuesOf(row),
      after: valuesOf(updated),
      meta: { requestId: request.id },
    });
    return null;
  }

  /** The proposed values, as columns. Only what was asked for is touched. */
  private changes(proposed: Record<string, unknown>) {
    const out: Record<string, unknown> = {};
    if (proposed.txnDate) {
      const date = text(proposed.txnDate);
      out.txnDate = new Date(`${date}T00:00:00Z`);
      out.periodYear = Number(date.slice(0, 4));
      out.periodMonth = Number(date.slice(5, 7));
    }
    for (const field of ['incomeSourceId', 'expenseItemId', 'amount', 'method'] as const) {
      if (proposed[field] !== undefined) out[field] = proposed[field];
    }
    for (const field of ['reference', 'counterparty', 'notes'] as const) {
      if (proposed[field] !== undefined)
        out[field] = proposed[field] === '' ? null : proposed[field];
    }
    return out;
  }

  private monthMove(input: { before: Record<string, unknown>; proposed: Record<string, unknown> }) {
    const to = input.proposed.txnDate;
    if (!to) return false;
    return text(to).slice(0, 7) !== text(input.before.txnDate).slice(0, 7);
  }

  /**
   * A month move: the replacement is a new entry with the new month's number,
   * and the old one is voided pointing at it. Both rows stay, so a reader of
   * either number learns the whole story.
   */
  private async replace(
    tx: Tx,
    row: FinanceTransaction,
    request: ChangeRequest,
    proposed: Record<string, unknown>,
  ): Promise<FinanceTransaction> {
    const church = await tx.church.findFirstOrThrow();
    const date = text(proposed.txnDate);
    const year = Number(date.slice(0, 4));
    const month = Number(date.slice(5, 7));
    const seq = await this.sequences.next(tx, sequenceKey(row.kind, year, month));
    const code = formatTransactionCode({
      churchCode: church.code,
      kind: row.kind,
      year,
      month,
      seq,
    });
    const changed = this.changes(proposed) as Partial<FinanceTransaction>;

    const replacement = await tx.financeTransaction.create({
      data: {
        code,
        kind: row.kind,
        txnDate: new Date(`${date}T00:00:00Z`),
        periodYear: year,
        periodMonth: month,
        seq,
        amount: (changed.amount ?? row.amount) as never,
        currency: row.currency,
        incomeSourceId: (changed.incomeSourceId ?? row.incomeSourceId) as string | null,
        expenseItemId: (changed.expenseItemId ?? row.expenseItemId) as string | null,
        method: (changed.method ?? row.method) as never,
        reference: (changed.reference ?? row.reference) as string | null,
        counterparty: (changed.counterparty ?? row.counterparty) as string | null,
        notes: (changed.notes ?? row.notes) as string | null,
        clientRequestId: randomUUID(),
        // The person who asked for the correction recorded it, not the approver.
        createdById: request.requestedById,
        replacesId: row.id,
      },
    });

    await this.void(tx, row, request, `Replaced by ${code}: ${request.reason}`);
    return replacement;
  }

  private async void(
    tx: Tx,
    row: FinanceTransaction,
    request: ChangeRequest,
    reason: string,
  ): Promise<void> {
    await tx.financeTransaction.update({
      where: { id: row.id },
      data: {
        status: 'VOIDED',
        voidedAt: new Date(),
        voidedById: request.decidedById,
        voidReason: reason.slice(0, 500),
        appliedRequestId: request.id,
        revision: { increment: 1 },
      },
    });
  }

  private async row(tx: Tx, id: string): Promise<FinanceTransaction | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    return tx.financeTransaction.findFirst({ where: { id } });
  }

  private async itemNames(tx: Tx, ids: unknown[]): Promise<Map<string, string>> {
    const wanted = [...new Set(ids.filter(Boolean).map(String))];
    if (!wanted.length) return new Map();
    const [sources, items] = await Promise.all([
      tx.financeIncomeSource.findMany({
        where: { id: { in: wanted } },
        select: { id: true, name: true },
      }),
      tx.financeExpenseItem.findMany({
        where: { id: { in: wanted } },
        select: { id: true, name: true },
      }),
    ]);
    return new Map([...sources, ...items].map((i) => [i.id, i.name]));
  }
}

/** The proposable values of an entry, in the shape a request stores them. */
function valuesOf(row: FinanceTransaction): Record<string, unknown> {
  return {
    txnDate: row.txnDate.toISOString().slice(0, 10),
    incomeSourceId: row.incomeSourceId,
    expenseItemId: row.expenseItemId,
    amount: row.amount.toFixed(2),
    method: row.method,
    reference: row.reference,
    counterparty: row.counterparty,
    notes: row.notes,
  };
}

const monthName = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

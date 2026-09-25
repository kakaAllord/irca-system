import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  formatTransactionCode,
  parseTransactionCode,
  sequenceKey,
  type CreateTransactionInput,
  type FinanceTransaction as FinanceTransactionView,
  type PaymentMethod,
} from '@irca/shared';
import type { Prisma, FinanceTransaction } from '../../generated/prisma/client.js';
import { Db, type Tx } from '../../core/database/db.service.js';
import { RequestAuth } from '../../core/context/request-auth.js';
import { AppError } from '../../core/http/app-error.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { UsageService } from '../../core/usage/usage.service.js';
import { SequenceService } from '../../core/sequences/sequence.service.js';
import { ChangeRequestService } from '../../core/change-requests/change-request.service.js';
import { CatalogService } from './catalog.service.js';

/** Nothing before this can be a real entry; it is a typed year, not a date. */
const EARLIEST = '2000-01-01';

export type TransactionQuery = {
  kind?: 'INCOME' | 'EXPENSE';
  status?: 'POSTED' | 'VOIDED' | 'all';
  from?: string;
  to?: string;
  incomeSourceId?: string;
  expenseItemId?: string;
  method?: PaymentMethod;
  q?: string;
  page?: number;
  pageSize?: number;
  sort?: 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';
};

export type TransactionTotals = {
  incomeTotal: string;
  expenseTotal: string;
  net: string;
  count: number;
};

/**
 * The books themselves.
 *
 * An entry is written once and never rewritten: there is no edit and no void
 * endpoint here, because every correction is a change request an
 * administrator approves (D17). What this service does is record entries with
 * numbers that have no gaps, and find them again.
 */
@Injectable()
export class TransactionService {
  constructor(
    private readonly db: Db,
    private readonly auth: RequestAuth,
    private readonly audit: AuditService,
    private readonly usage: UsageService,
    private readonly sequences: SequenceService,
    private readonly catalog: CatalogService,
    private readonly changeRequests: ChangeRequestService,
  ) {}

  /**
   * Records one entry. Everything that must hold together — the counter, the
   * number, the row and the log line — happens in one transaction, which is
   * what keeps the numbers unbroken when two clerks save at the same moment.
   */
  async create(
    input: CreateTransactionInput,
  ): Promise<{ transaction: FinanceTransactionView; created: boolean }> {
    const church = await this.church();

    // A retried submit is the same entry, not a second one.
    const existing = await this.db.client.financeTransaction.findFirst({
      where: { clientRequestId: input.clientRequestId },
    });
    if (existing) return { transaction: await this.view(existing), created: false };

    this.checkDate(input.txnDate, church.timezone);
    const [year, month] = [
      Number(input.txnDate.slice(0, 4)),
      Number(input.txnDate.slice(5, 7)),
    ] as const;

    const row = await this.db.tx(async (tx) => {
      const item =
        input.kind === 'INCOME'
          ? await this.catalog.requireUsable(tx, 'income', input.incomeSourceId)
          : await this.catalog.requireUsable(tx, 'expense', input.expenseItemId);

      const seq = await this.sequences.next(tx, sequenceKey(input.kind, year, month));
      const code = formatTransactionCode({
        churchCode: church.code,
        kind: input.kind,
        year,
        month,
        seq,
      });

      const created = await tx.financeTransaction.create({
        data: {
          code,
          kind: input.kind,
          txnDate: new Date(`${input.txnDate}T00:00:00Z`),
          periodYear: year,
          periodMonth: month,
          seq,
          amount: input.amount,
          currency: church.currency,
          incomeSourceId: input.kind === 'INCOME' ? input.incomeSourceId : null,
          expenseItemId: input.kind === 'EXPENSE' ? input.expenseItemId : null,
          method: input.method,
          reference: input.reference || null,
          counterparty: input.counterparty || null,
          notes: input.notes || null,
          clientRequestId: input.clientRequestId,
          createdById: this.auth.userId!,
        },
      });

      await this.audit.recordIn(tx, {
        action: 'finance.transaction.created',
        entityType: 'finance_transaction',
        entityId: code,
        summary: `Recorded ${input.kind === 'INCOME' ? 'income' : 'expense'} ${code} · ${item.name} · ${church.currency} ${input.amount}`,
        after: {
          code,
          kind: input.kind,
          txnDate: input.txnDate,
          amount: input.amount,
          item: item.name,
          method: input.method,
        },
      });
      return created;
    });

    this.usage.inc('finance.transactions.created');
    return { transaction: await this.view(row), created: true };
  }

  async list(
    query: TransactionQuery,
  ): Promise<{ rows: FinanceTransactionView[]; total: number; totals: TransactionTotals }> {
    const where = this.where(query);
    const pageSize = Math.min(query.pageSize ?? 25, 100);
    const page = Math.max(1, query.page ?? 1);

    const [rows, total, income, expense] = await Promise.all([
      this.db.client.financeTransaction.findMany({
        where,
        orderBy: this.order(query.sort),
        take: pageSize,
        skip: (page - 1) * pageSize,
      }),
      this.db.client.financeTransaction.count({ where }),
      this.db.client.financeTransaction.aggregate({
        where: { ...where, kind: 'INCOME', status: 'POSTED' },
        _sum: { amount: true },
        _count: true,
      }),
      this.db.client.financeTransaction.aggregate({
        where: { ...where, kind: 'EXPENSE', status: 'POSTED' },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    const incomeTotal = income._sum.amount?.toFixed(2) ?? '0.00';
    const expenseTotal = expense._sum.amount?.toFixed(2) ?? '0.00';
    return {
      rows: await this.views(rows),
      total,
      totals: {
        incomeTotal,
        expenseTotal,
        net: (Number(incomeTotal) - Number(expenseTotal)).toFixed(2),
        count: income._count + expense._count,
      },
    };
  }

  /** Every entry matching the filters, for the CSV. No paging, one pass. */
  async all(query: TransactionQuery): Promise<FinanceTransactionView[]> {
    const rows = await this.db.client.financeTransaction.findMany({
      where: this.where(query),
      orderBy: this.order(query.sort),
      take: 20_000,
    });
    return this.views(rows);
  }

  async byCode(code: string): Promise<FinanceTransactionView> {
    return this.view(await this.rowByCode(code));
  }

  /** The entry, plus whatever is waiting for an administrator about it. */
  async detail(code: string) {
    const row = await this.rowByCode(code);
    return {
      ...(await this.view(row)),
      openRequest: await this.changeRequests.openFor('finance_transaction', row.id),
    };
  }

  /**
   * Everything that has happened to one entry: its own events, and the change
   * requests about it. The activity log is the only source, so nothing can be
   * shown here that was not written down at the time.
   */
  async history(code: string) {
    const row = await this.rowByCode(code);
    const requests = await this.db.client.changeRequest.findMany({
      where: { entityType: 'finance_transaction', entityId: row.id },
      select: { id: true },
    });
    const events = await this.db.client.$queryRaw<
      {
        id: string;
        actorUserId: string | null;
        action: string;
        summary: string | null;
        createdAt: Date;
      }[]
    >`
      select id, "actorUserId", action, summary, "createdAt"
      from church_audit_events()
      where source = 'feature'
        and (
          ("entityType" = 'finance_transaction' and "entityId" = ${code})
          or ("entityType" = 'change_request' and "entityId" = any(${requests.map((r) => r.id)}::text[]))
        )
      order by "createdAt" asc
      limit 100
    `;
    const actors = await this.db.client.user.findMany({
      where: {
        id: { in: [...new Set(events.map((e) => e.actorUserId).filter(Boolean))] as string[] },
      },
      select: { id: true, fullName: true },
    });
    const names = new Map(actors.map((a) => [a.id, a.fullName]));
    return events.map((event) => ({
      id: event.id,
      at: event.createdAt.toISOString(),
      who: event.actorUserId ? (names.get(event.actorUserId) ?? 'Someone') : 'The system',
      action: event.action,
      summary: event.summary,
    }));
  }

  /** The entry a change request is about, inside the caller's transaction. */
  async rowById(tx: Tx, id: string): Promise<FinanceTransaction | null> {
    return tx.financeTransaction.findFirst({ where: { id } });
  }

  private async rowByCode(code: string): Promise<FinanceTransaction> {
    if (!parseTransactionCode(code)) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'No entry with that number.');
    }
    const row = await this.db.client.financeTransaction.findFirst({ where: { code } });
    if (!row) throw new AppError(404, ErrorCode.NOT_FOUND, 'No entry with that number.');
    return row;
  }

  private where(query: TransactionQuery): Prisma.FinanceTransactionWhereInput {
    const status = query.status ?? 'POSTED';
    const q = query.q?.trim();
    return {
      ...(query.kind ? { kind: query.kind } : {}),
      ...(status === 'all' ? {} : { status }),
      ...(query.from || query.to
        ? {
            txnDate: {
              ...(query.from ? { gte: new Date(`${query.from}T00:00:00Z`) } : {}),
              ...(query.to ? { lte: new Date(`${query.to}T00:00:00Z`) } : {}),
            },
          }
        : {}),
      ...(query.incomeSourceId ? { incomeSourceId: query.incomeSourceId } : {}),
      ...(query.expenseItemId ? { expenseItemId: query.expenseItemId } : {}),
      ...(query.method ? { method: query.method } : {}),
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: 'insensitive' } },
              { reference: { contains: q, mode: 'insensitive' } },
              { counterparty: { contains: q, mode: 'insensitive' } },
              { notes: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private order(
    sort: TransactionQuery['sort'],
  ): Prisma.FinanceTransactionOrderByWithRelationInput[] {
    switch (sort) {
      case 'date_asc':
        return [{ txnDate: 'asc' }, { code: 'asc' }];
      case 'amount_desc':
        return [{ amount: 'desc' }, { txnDate: 'desc' }];
      case 'amount_asc':
        return [{ amount: 'asc' }, { txnDate: 'desc' }];
      default:
        return [{ txnDate: 'desc' }, { code: 'desc' }];
    }
  }

  /** Today where the church is: a Sunday evening in Arusha is not Monday. */
  private checkDate(txnDate: string, timezone: string): void {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
    if (txnDate > today) {
      throw new AppError(422, ErrorCode.VALIDATION_FAILED, 'That date is in the future.', {
        txnDate: ['An entry cannot be dated later than today'],
      });
    }
    if (txnDate < EARLIEST) {
      throw new AppError(422, ErrorCode.VALIDATION_FAILED, 'That date is too far back.', {
        txnDate: ['Check the year'],
      });
    }
  }

  private async church() {
    const church = await this.db.client.church.findFirst();
    if (!church) throw new AppError(404, ErrorCode.NOT_FOUND, 'No such church.');
    return church;
  }

  async view(row: FinanceTransaction): Promise<FinanceTransactionView> {
    return (await this.views([row]))[0]!;
  }

  /** Rows as pages show them: names instead of ids, amounts as strings. */
  async views(rows: FinanceTransaction[]): Promise<FinanceTransactionView[]> {
    if (!rows.length) return [];
    const [sources, items, people, links] = await Promise.all([
      this.db.client.financeIncomeSource.findMany({
        where: { id: { in: ids(rows.map((r) => r.incomeSourceId)) } },
        select: { id: true, name: true },
      }),
      this.db.client.financeExpenseItem.findMany({
        where: { id: { in: ids(rows.map((r) => r.expenseItemId)) } },
        select: { id: true, name: true },
      }),
      this.db.client.user.findMany({
        where: { id: { in: ids(rows.flatMap((r) => [r.createdById, r.voidedById])) } },
        select: { id: true, fullName: true },
      }),
      this.db.client.financeTransaction.findMany({
        where: {
          OR: [
            { id: { in: ids(rows.map((r) => r.replacesId)) } },
            { replacesId: { in: rows.map((r) => r.id) } },
          ],
        },
        select: { id: true, code: true, replacesId: true },
      }),
    ]);

    const names = new Map([...sources, ...items].map((i) => [i.id, i.name]));
    const people_ = new Map(people.map((p) => [p.id, p.fullName]));
    const codeById = new Map(links.map((l) => [l.id, l.code]));
    const replacedBy = new Map(
      links.filter((l) => l.replacesId).map((l) => [l.replacesId!, l.code]),
    );

    return rows.map((row) => {
      const itemId = row.incomeSourceId ?? row.expenseItemId;
      return {
        id: row.id,
        code: row.code,
        kind: row.kind,
        status: row.status,
        txnDate: row.txnDate.toISOString().slice(0, 10),
        amount: row.amount.toFixed(2),
        currency: row.currency,
        item: itemId ? { id: itemId, name: names.get(itemId) ?? 'Unknown' } : null,
        method: row.method,
        reference: row.reference,
        counterparty: row.counterparty,
        notes: row.notes,
        revision: row.revision,
        recordedBy: {
          id: row.createdById,
          fullName: people_.get(row.createdById) ?? 'Someone',
        },
        recordedAt: row.createdAt.toISOString(),
        voidedAt: row.voidedAt?.toISOString() ?? null,
        voidedBy: row.voidedById
          ? { id: row.voidedById, fullName: people_.get(row.voidedById) ?? 'Someone' }
          : null,
        voidReason: row.voidReason,
        replacesCode: row.replacesId ? (codeById.get(row.replacesId) ?? null) : null,
        replacedByCode: replacedBy.get(row.id) ?? null,
      };
    });
  }
}

const ids = (values: (string | null)[]): string[] =>
  [...new Set(values.filter(Boolean))] as string[];

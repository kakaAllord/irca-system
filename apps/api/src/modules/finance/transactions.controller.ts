import { Body, Controller, Get, Header, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  ChangeRequestSchema,
  CreateTransactionSchema,
  PAYMENT_METHODS,
  type ChangeRequestInput,
  type CreateTransactionInput,
} from '@irca/shared';
import { ZodPipe } from '../../core/http/zod.pipe.js';
import { RequirePermission } from '../../core/rbac/decorators.js';
import { RequestAuth } from '../../core/context/request-auth.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { ChangeRequestService } from '../../core/change-requests/change-request.service.js';
import { TransactionService, type TransactionQuery } from './transactions.service.js';
import { csv, csvFilename } from './csv.js';

/**
 * Recording, finding and reading entries — and asking for one to be changed.
 *
 * There is deliberately no PUT and no DELETE here. An entry is written once;
 * every correction, void included, goes to an administrator as a request.
 */
@Controller('finance/transactions')
export class TransactionsController {
  constructor(
    private readonly transactions: TransactionService,
    private readonly changeRequests: ChangeRequestService,
    private readonly auth: RequestAuth,
    private readonly audit: AuditService,
  ) {}

  @RequirePermission('finance.transactions.create')
  @Post()
  async create(
    @Body(new ZodPipe(CreateTransactionSchema)) body: CreateTransactionInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { transaction, created } = await this.transactions.create(body);
    // A retried submit is not a second entry, and says so with 200 rather than 201.
    res.status(created ? 201 : 200);
    return transaction;
  }

  @RequirePermission('finance.transactions.read')
  @Get()
  list(@Query() query: Record<string, string | undefined>) {
    return this.transactions.list(parseQuery(query));
  }

  @RequirePermission('finance.transactions.export')
  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async export(@Query() query: Record<string, string | undefined>, @Res() res: Response) {
    const filters = parseQuery(query);
    const rows = await this.transactions.all(filters);
    const churchCode = query.churchCode ?? 'finance';

    await this.audit.recordNow({
      action: 'finance.transactions.exported',
      entityType: 'finance_transaction',
      summary: `Downloaded ${rows.length} entries as CSV`,
      meta: { ...filters },
    });

    const body = csv(
      [
        'Code',
        'Date',
        'Kind',
        'Source or item',
        'Amount',
        'Currency',
        'Method',
        'Reference',
        'Payer/Payee',
        'Notes',
        'Status',
        'Recorded by',
        'Recorded at',
        'Voided at',
        'Void reason',
      ],
      rows.map((row) => [
        row.code,
        row.txnDate,
        row.kind === 'INCOME' ? 'Income' : 'Expense',
        row.item?.name ?? '',
        row.amount,
        row.currency,
        PAYMENT_METHODS[row.method],
        row.reference,
        row.counterparty,
        row.notes,
        row.status === 'VOIDED' ? 'Voided' : 'Posted',
        row.recordedBy?.fullName,
        row.recordedAt,
        row.voidedAt,
        row.voidReason,
      ]),
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${csvFilename(churchCode, 'finance', filters.from, filters.to)}"`,
    );
    res.send(body);
  }

  @RequirePermission('finance.transactions.read')
  @Get(':code')
  detail(@Param('code') code: string) {
    return this.transactions.detail(code);
  }

  @RequirePermission('finance.transactions.read')
  @Get(':code/history')
  history(@Param('code') code: string) {
    return this.transactions.history(code);
  }

  @RequirePermission('finance.transactions.request_change')
  @Post(':code/change-requests')
  @HttpCode(201)
  async requestChange(
    @Param('code') code: string,
    @Body(new ZodPipe(ChangeRequestSchema)) body: ChangeRequestInput,
  ) {
    const entry = await this.transactions.byCode(code);
    const proposed: Record<string, unknown> = { ...body.proposed };
    // Amounts are compared with what the database holds, which has two decimals.
    if (proposed.amount !== undefined) proposed.amount = Number(proposed.amount).toFixed(2);
    return this.changeRequests.create({
      entityType: 'finance_transaction',
      entityId: entry.id,
      action: body.action,
      proposed: body.action === 'VOID' ? {} : proposed,
      reason: body.reason,
    });
  }
}

/** Query strings are text; this is where they become the filters we mean. */
function parseQuery(query: Record<string, string | undefined>): TransactionQuery {
  return {
    kind: query.kind === 'INCOME' || query.kind === 'EXPENSE' ? query.kind : undefined,
    status:
      query.status === 'all' || query.status === 'VOIDED' || query.status === 'POSTED'
        ? query.status
        : undefined,
    from: query.from,
    to: query.to,
    incomeSourceId: query.incomeSourceId,
    expenseItemId: query.expenseItemId,
    method: query.method as TransactionQuery['method'],
    q: query.q,
    page: query.page ? Number(query.page) : 1,
    pageSize: query.pageSize ? Number(query.pageSize) : undefined,
    sort: query.sort as TransactionQuery['sort'],
  };
}

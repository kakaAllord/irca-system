import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { RequirePermission } from '../../core/rbac/decorators.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { ReportsService } from './reports.service.js';
import { csv, csvFilename } from './csv.js';

/** The overview page's numbers, and the statement behind the Reports page. */
@Controller('finance')
export class FinanceReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly audit: AuditService,
  ) {}

  @RequirePermission('finance.overview.read')
  @Get('overview')
  overview(@Query('month') month?: string) {
    return this.reports.overview(month ?? thisMonth());
  }

  @RequirePermission('finance.reports.read')
  @Get('reports/statement')
  statement(@Query('from') from: string, @Query('to') to: string) {
    return this.reports.statement(from, to);
  }

  @RequirePermission('finance.reports.read')
  @Get('reports/statement.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async statementCsv(@Query('from') from: string, @Query('to') to: string, @Res() res: Response) {
    const statement = await this.reports.statement(from, to);
    await this.audit.recordNow({
      action: 'finance.statement.exported',
      summary: `Downloaded the statement for ${from} to ${to}`,
      meta: { from, to },
    });

    const body = csv(
      ['Section', 'Name', 'Total'],
      [
        ...statement.incomeBySource.map((row) => ['Income', row.name, row.total]),
        ['Income', 'Total income', statement.incomeTotal],
        ...statement.expensesByItem.map((row) => ['Expenses', row.name, row.total]),
        ['Expenses', 'Total expenses', statement.expenseTotal],
        ['Net', '', statement.net],
        ...statement.months.map((m) => ['Month', m.month, `${m.income} / ${m.expense}`]),
      ],
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${csvFilename('statement', 'finance', from, to)}"`,
    );
    res.send(body);
  }
}

const thisMonth = () => new Date().toISOString().slice(0, 7);

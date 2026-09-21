import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@irca/shared';
import { Db } from '../../core/database/db.service.js';
import { identifier, sql, type Sql } from '../../core/database/sql.js';
import { RequestAuth } from '../../core/context/request-auth.js';
import { AppError } from '../../core/http/app-error.js';
import { TransactionService } from './transactions.service.js';

type GroupRow = { id: string; name: string; total: string };
type MonthRow = { month: string; income: string; expense: string };

const MAX_MONTHS = 24;

/**
 * The numbers, added up by Postgres.
 *
 * Every total here is a sum() in SQL over posted entries: voided ones are out
 * of the totals but still in the books. Nothing is added up in JavaScript,
 * because money is not a double.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly db: Db,
    private readonly auth: RequestAuth,
    private readonly transactions: TransactionService,
  ) {}

  /** The Finance home page: this month, last month, and the year behind it. */
  async overview(month: string) {
    const churchId = this.auth.requireChurch();
    const [year, m] = parseMonth(month);
    const previous = m === 1 ? [year - 1, 12] : [year, m - 1];

    const [totals, previousTotals, bySource, topItems, trend] = await Promise.all([
      this.monthTotals(churchId, year, m),
      this.monthTotals(churchId, previous[0]!, previous[1]!),
      this.groupBy(churchId, 'INCOME', year, m),
      this.groupBy(churchId, 'EXPENSE', year, m),
      this.trend(churchId, year, m),
    ]);

    // The recent entries card is only for people who may see entries at all.
    const recent = this.auth.has('finance.transactions.read')
      ? (
          await this.transactions.list({
            from: monthStart(year, m),
            to: monthEnd(year, m),
            pageSize: 10,
          })
        ).rows
      : null;

    return {
      month: `${year}-${pad(m)}`,
      ...totals,
      previous: previousTotals,
      bySource: withShare(bySource, totals.income),
      topItems: withShare(topItems.slice(0, 10), totals.expense),
      trend,
      recent,
    };
  }

  /** A statement for any range, with a month-by-month table when it spans months. */
  async statement(from: string, to: string) {
    const churchId = this.auth.requireChurch();
    if (from > to)
      throw new AppError(400, ErrorCode.VALIDATION_FAILED, 'That range runs backwards.');
    if (monthsBetween(from, to) > MAX_MONTHS) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_FAILED,
        `Ask for at most ${MAX_MONTHS} months at a time.`,
      );
    }

    const [incomeBySource, expensesByItem, totals, months] = await Promise.all([
      this.groupByRange(churchId, 'INCOME', from, to),
      this.groupByRange(churchId, 'EXPENSE', from, to),
      this.rangeTotals(churchId, from, to),
      this.monthsInRange(churchId, from, to),
    ]);

    return {
      from,
      to,
      incomeBySource: withShare(incomeBySource, totals.income),
      expensesByItem: withShare(expensesByItem, totals.expense),
      incomeTotal: totals.income,
      expenseTotal: totals.expense,
      net: totals.net,
      count: totals.count,
      months: months.length > 1 ? months : [],
    };
  }

  private async monthTotals(churchId: string, year: number, month: number) {
    const rows = await this.query<{ kind: string; total: string; count: number }>(
      sql`-- tenant: church_id is bound below
       select kind, sum(amount)::text as total, count(*)::int as count
       from finance_transactions
       where church_id = ${churchId}::uuid and status = 'POSTED'
         and period_year = ${year} and period_month = ${month}
       group by kind`,
    );
    return summarise(rows);
  }

  private async rangeTotals(churchId: string, from: string, to: string) {
    const rows = await this.query<{ kind: string; total: string; count: number }>(
      sql`-- tenant: church_id is bound below
       select kind, sum(amount)::text as total, count(*)::int as count
       from finance_transactions
       where church_id = ${churchId}::uuid and status = 'POSTED'
         and txn_date between ${from}::date and ${to}::date
       group by kind`,
    );
    return summarise(rows);
  }

  private groupBy(churchId: string, kind: 'INCOME' | 'EXPENSE', year: number, month: number) {
    return this.groupQuery(
      churchId,
      kind,
      sql`and t.period_year = ${year} and t.period_month = ${month}`,
    );
  }

  private groupByRange(churchId: string, kind: 'INCOME' | 'EXPENSE', from: string, to: string) {
    return this.groupQuery(
      churchId,
      kind,
      sql`and t.txn_date between ${from}::date and ${to}::date`,
    );
  }

  /** The same grouping for a month or a range; only the dates differ. */
  private async groupQuery(
    churchId: string,
    kind: 'INCOME' | 'EXPENSE',
    period: Sql,
  ): Promise<GroupRow[]> {
    const table = identifier(
      kind === 'INCOME' ? 'finance_income_sources' : 'finance_expense_items',
    );
    const column = identifier(kind === 'INCOME' ? 'income_source_id' : 'expense_item_id');
    return this.query<GroupRow>(
      sql`-- tenant: church_id is bound below
       select i.id, i.name, sum(t.amount)::text as total
       from finance_transactions t
       join ${table} i on i.id = t.${column} and i.church_id = t.church_id
       where t.church_id = ${churchId}::uuid and t.status = 'POSTED' and t.kind = ${kind} ${period}
       group by i.id, i.name
       order by sum(t.amount) desc`,
    );
  }

  /** The last twelve months, ending with the month being shown. */
  private async trend(churchId: string, year: number, month: number): Promise<MonthRow[]> {
    const rows = await this.query<{ month: string; kind: string; total: string }>(
      sql`-- tenant: church_id is bound below
       select to_char(make_date(period_year, period_month, 1), 'YYYY-MM') as month,
              kind, sum(amount)::text as total
       from finance_transactions
       where church_id = ${churchId}::uuid and status = 'POSTED'
         and make_date(period_year, period_month, 1)
             between make_date(${year}, ${month}, 1) - interval '11 months'
                 and make_date(${year}, ${month}, 1)
       group by 1, 2
       order by 1`,
    );
    return byMonth(rows, lastMonths(year, month, 12));
  }

  private async monthsInRange(churchId: string, from: string, to: string): Promise<MonthRow[]> {
    const rows = await this.query<{ month: string; kind: string; total: string }>(
      sql`-- tenant: church_id is bound below
       select to_char(make_date(period_year, period_month, 1), 'YYYY-MM') as month,
              kind, sum(amount)::text as total
       from finance_transactions
       where church_id = ${churchId}::uuid and status = 'POSTED'
         and txn_date between ${from}::date and ${to}::date
       group by 1, 2
       order by 1`,
    );
    return byMonth(rows, [...new Set(rows.map((r) => r.month))].sort());
  }

  /** Raw SQL goes through a transaction: that is what sets the church for RLS. */
  private query<T>(query: Sql): Promise<T[]> {
    return this.db.tx((tx) => tx.$queryRaw<T[]>(query));
  }
}

function summarise(rows: { kind: string; total: string; count: number }[]) {
  const income = rows.find((r) => r.kind === 'INCOME');
  const expense = rows.find((r) => r.kind === 'EXPENSE');
  const incomeTotal = income?.total ?? '0';
  const expenseTotal = expense?.total ?? '0';
  return {
    income: money(incomeTotal),
    expense: money(expenseTotal),
    net: (Number(incomeTotal) - Number(expenseTotal)).toFixed(2),
    count: (income?.count ?? 0) + (expense?.count ?? 0),
  };
}

function byMonth(
  rows: { month: string; kind: string; total: string }[],
  months: string[],
): MonthRow[] {
  return months.map((month) => ({
    month,
    income: money(rows.find((r) => r.month === month && r.kind === 'INCOME')?.total ?? '0'),
    expense: money(rows.find((r) => r.month === month && r.kind === 'EXPENSE')?.total ?? '0'),
  }));
}

/** What each source or item was of the whole, rounded for a bar, not for the books. */
function withShare(rows: GroupRow[], total: string) {
  const whole = Number(total);
  return rows.map((row) => ({
    ...row,
    total: money(row.total),
    share: whole > 0 ? Math.round((Number(row.total) / whole) * 100) : 0,
  }));
}

const money = (value: string) => Number(value).toFixed(2);
const pad = (n: number) => String(n).padStart(2, '0');

function parseMonth(month: string): [number, number] {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) throw new AppError(400, ErrorCode.VALIDATION_FAILED, 'Ask for a month like 2026-09.');
  const value = Number(m[2]);
  if (value < 1 || value > 12) {
    throw new AppError(400, ErrorCode.VALIDATION_FAILED, 'Ask for a month like 2026-09.');
  }
  return [Number(m[1]), value];
}

const monthStart = (year: number, month: number) => `${year}-${pad(month)}-01`;
const monthEnd = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);

function lastMonths(year: number, month: number, count: number): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`);
  }
  return out;
}

function monthsBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`);
  const b = new Date(`${to}T00:00:00Z`);
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) + 1;
}

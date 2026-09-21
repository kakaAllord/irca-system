import type { Metadata } from 'next';
import { formatMoney, type MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { ForbiddenState } from '@/components/shell/States';
import { RangePicker, PrintButton } from './RangeControls';

export const metadata: Metadata = { title: 'Reports' };

type Group = { id: string; name: string; total: string; share: number };
type Statement = {
  from: string;
  to: string;
  incomeBySource: Group[];
  expensesByItem: Group[];
  incomeTotal: string;
  expenseTotal: string;
  net: string;
  count: number;
  months: { month: string; income: string; expense: string }[];
};

/** A statement for any range, made to be printed and handed over. */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'finance.reports.read')) return <ForbiddenState what="finance reports" />;

  const params = await searchParams;
  const now = new Date();
  const from = params.from ?? `${now.toISOString().slice(0, 7)}-01`;
  const to =
    params.to ??
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);

  const statement = await serverApi<Statement>(`/finance/reports/statement?from=${from}&to=${to}`);
  const currency = me.church?.currency ?? 'TZS';

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title="Reports"
          subtitle="A statement for any range of dates, ready to print."
          actions={<PrintButton from={from} to={to} />}
        />
        <RangePicker from={from} to={to} />
      </div>

      <article className="mt-4 rounded-[10px] border border-border bg-surface p-5 print:border-0 print:p-0">
        <header className="mb-4">
          <h2 className="text-[15px] font-semibold text-fg">{me.church?.name}</h2>
          <p className="text-[12.5px] text-fg2">
            Statement, {longDate(from)} to {longDate(to)}
          </p>
        </header>

        <div className="grid gap-6 sm:grid-cols-2">
          <Section
            title="Income"
            rows={statement.incomeBySource}
            total={statement.incomeTotal}
            totalLabel="Total income"
            currency={currency}
          />
          <Section
            title="Expenses"
            rows={statement.expensesByItem}
            total={statement.expenseTotal}
            totalLabel="Total expenses"
            currency={currency}
          />
        </div>

        <p className="mt-5 flex justify-between border-t border-border pt-3 text-[13px] font-semibold text-fg">
          <span>NET</span>
          <span className="tabular-nums">{formatMoney(statement.net, currency)}</span>
        </p>

        {statement.months.length > 0 && (
          <table className="mt-5 w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[11px] tracking-wide text-fg3 uppercase">
                <th className="py-1">Month</th>
                <th className="py-1 text-right">Income</th>
                <th className="py-1 text-right">Expenses</th>
                <th className="py-1 text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {statement.months.map((row) => (
                <tr key={row.month} className="border-t border-border2">
                  <td className="py-1">{row.month}</td>
                  <td className="py-1 text-right tabular-nums">{formatMoney(row.income, '')}</td>
                  <td className="py-1 text-right tabular-nums">{formatMoney(row.expense, '')}</td>
                  <td className="py-1 text-right tabular-nums">
                    {formatMoney((Number(row.income) - Number(row.expense)).toFixed(2), '')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p className="mt-4 text-[11.5px] text-fg3">
          {statement.count} entr{statement.count === 1 ? 'y' : 'ies'} · voided entries excluded ·
          printed {longDate(new Date().toISOString().slice(0, 10))} by {me.user.fullName}
        </p>
      </article>
    </>
  );
}

function Section({
  title,
  rows,
  total,
  totalLabel,
  currency,
}: {
  title: string;
  rows: Group[];
  total: string;
  totalLabel: string;
  currency: string;
}) {
  return (
    <section>
      <h3 className="mb-1.5 text-[11px] font-semibold tracking-wide text-fg3 uppercase">{title}</h3>
      <ul className="flex flex-col">
        {rows.length === 0 && <li className="py-1 text-[12.5px] text-fg3">Nothing recorded.</li>}
        {rows.map((row) => (
          <li key={row.id} className="flex justify-between py-1 text-[12.5px]">
            <span className="text-fg2">{row.name}</span>
            <span className="tabular-nums text-fg">{formatMoney(row.total, '')}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 flex justify-between border-t border-border2 pt-1.5 text-[12.5px] font-semibold">
        <span>{totalLabel}</span>
        <span className="tabular-nums">{formatMoney(total, currency)}</span>
      </p>
    </section>
  );
}

const longDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

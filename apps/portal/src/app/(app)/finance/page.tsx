import type { Metadata } from 'next';
import Link from 'next/link';
import { formatMoney, type FinanceTransaction, type MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { EmptyState, ForbiddenState } from '@/components/shell/States';
import { RecordButtons } from '@/modules/finance/components/RecordButtons';
import { Bars } from '@/modules/finance/components/Bars';

export const metadata: Metadata = { title: 'Finance' };

type Group = { id: string; name: string; total: string; share: number };

type Overview = {
  month: string;
  income: string;
  expense: string;
  net: string;
  count: number;
  previous: { income: string; expense: string; net: string; count: number };
  bySource: Group[];
  topItems: Group[];
  trend: { month: string; income: string; expense: string }[];
  recent: FinanceTransaction[] | null;
};

/** Money in, money out and what is left, for one month at a time. */
export default async function FinanceOverview({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'finance.overview.read')) return <ForbiddenState what="the finance overview" />;

  const { month } = await searchParams;
  const asked = month ?? new Date().toISOString().slice(0, 7);
  const data = await serverApi<Overview>(`/finance/overview?month=${asked}`);
  const currency = me.church?.currency ?? 'TZS';

  return (
    <>
      <PageHeader
        title="Finance"
        subtitle={`Income and expenses for ${me.church?.name ?? 'this church'}.`}
        actions={
          <>
            <MonthSwitcher month={data.month} />
            <RecordButtons />
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Income"
          value={formatMoney(data.income, currency)}
          change={change(data.income, data.previous.income)}
        />
        <Tile
          label="Expenses"
          value={formatMoney(data.expense, currency)}
          change={change(data.expense, data.previous.expense)}
        />
        <Tile label="Net" value={formatMoney(data.net, currency)} />
        <Tile label="Entries" value={String(data.count)} />
      </div>

      {data.count === 0 && (
        <div className="mt-4">
          <EmptyState title="No entries yet">
            Record your first income or expense for this month.
          </EmptyState>
        </div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 text-[13px] font-semibold text-fg">Income by source</h2>
          <Bars rows={data.bySource} currency={currency} />
        </section>
        <section>
          <h2 className="mb-2 text-[13px] font-semibold text-fg">Top expenses this month</h2>
          <Bars rows={data.topItems} currency={currency} />
        </section>
      </div>

      <section className="mt-5">
        <h2 className="mb-2 text-[13px] font-semibold text-fg">Last 12 months</h2>
        <Trend rows={data.trend} currency={currency} />
      </section>

      {data.recent && data.recent.length > 0 && (
        <section className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-fg">Recent entries</h2>
            <Link href="/finance/transactions" className="text-[12px] text-accent underline">
              See all →
            </Link>
          </div>
          <ul className="flex flex-col divide-y divide-border2 rounded-[10px] border border-border">
            {data.recent.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 px-3 py-2 text-[12.5px]">
                <Link
                  href={`/finance/transactions/${entry.code}`}
                  className="font-mono text-accent"
                >
                  {entry.code}
                </Link>
                <span className="truncate text-fg2">{entry.item?.name}</span>
                <span
                  className={`ml-auto tabular-nums ${entry.kind === 'INCOME' ? 'text-pos' : 'text-fg'}`}
                >
                  {entry.kind === 'INCOME' ? '+' : '−'}
                  {formatMoney(entry.amount, '')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function Tile({ label, value, change }: { label: string; value: string; change?: string | null }) {
  return (
    <div className="rounded-[10px] border border-border bg-surface p-3.5">
      <p className="text-[11px] font-semibold tracking-wide text-fg3 uppercase">{label}</p>
      <p className="mt-1 text-[19px] font-semibold tabular-nums text-fg">{value}</p>
      {change && <p className="mt-0.5 text-[11.5px] text-fg3">{change}</p>}
    </div>
  );
}

/** Left out entirely when last month was zero: there is no "+∞%". */
function change(now: string, before: string): string | null {
  const previous = Number(before);
  if (previous <= 0) return null;
  const percent = Math.round(((Number(now) - previous) / previous) * 100);
  return `${percent >= 0 ? '+' : ''}${percent}% vs last month`;
}

function Trend({
  rows,
  currency,
}: {
  rows: { month: string; income: string; expense: string }[];
  currency: string;
}) {
  const highest = Math.max(1, ...rows.flatMap((r) => [Number(r.income), Number(r.expense)]));
  return (
    <div className="flex items-end gap-2 overflow-x-auto rounded-[10px] border border-border bg-surface p-3.5">
      {rows.map((row) => (
        <div key={row.month} className="flex min-w-[42px] flex-1 flex-col items-center gap-1">
          <div className="flex h-24 items-end gap-0.5" aria-hidden="true">
            <span
              className="w-2.5 rounded-t-[2px] bg-pos"
              style={{ height: `${(Number(row.income) / highest) * 100}%` }}
            />
            <span
              className="w-2.5 rounded-t-[2px] bg-neutral-bar"
              style={{ height: `${(Number(row.expense) / highest) * 100}%` }}
            />
          </div>
          <span className="text-[10.5px] text-fg3">{row.month.slice(5)}</span>
          <span className="sr-only">
            {row.month}: income {formatMoney(row.income, currency)}, expenses{' '}
            {formatMoney(row.expense, currency)}
          </span>
        </div>
      ))}
    </div>
  );
}

function MonthSwitcher({ month }: { month: string }) {
  const [year, m] = month.split('-').map(Number);
  const shift = (by: number) => {
    const d = new Date(Date.UTC(year!, m! - 1 + by, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  };
  const shown = new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return (
    <span className="flex items-center gap-1 text-[12.5px] text-fg2">
      <Link href={`/finance?month=${shift(-1)}`} aria-label="Previous month" className="px-1.5">
        ‹
      </Link>
      <span className="min-w-[110px] text-center font-medium text-fg">{shown}</span>
      <Link href={`/finance?month=${shift(1)}`} aria-label="Next month" className="px-1.5">
        ›
      </Link>
    </span>
  );
}

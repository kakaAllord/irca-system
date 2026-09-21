import type { Metadata } from 'next';
import Link from 'next/link';
import {
  PAYMENT_METHODS,
  formatMoney,
  type CatalogItem,
  type FinanceTransaction,
  type MeResponse,
} from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { EmptyState, ForbiddenState } from '@/components/shell/States';
import { Badge } from '@/components/ui/Badge';
import { Table, Row, Cell } from '@/components/ui/Table';
import { RecordButtons } from '@/modules/finance/components/RecordButtons';
import { TransactionFilters } from './TransactionFilters';
import { ExportButton } from './ExportButton';

export const metadata: Metadata = { title: 'Transactions' };

type Listed = {
  rows: FinanceTransaction[];
  total: number;
  totals: { incomeTotal: string; expenseTotal: string; net: string; count: number };
};

const FILTERS = [
  'kind',
  'status',
  'from',
  'to',
  'incomeSourceId',
  'expenseItemId',
  'method',
  'q',
  'page',
] as const;

/** Everything recorded, with the totals for whatever is being looked at. */
export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'finance.transactions.read')) return <ForbiddenState what="finance entries" />;

  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of FILTERS) if (params[key]) query.set(key, params[key]);
  if (!params.from && !params.to) {
    // This month, unless someone asked for something else.
    const now = new Date();
    query.set('from', `${now.toISOString().slice(0, 7)}-01`);
  }

  const [data, sources, items] = await Promise.all([
    serverApi<Listed>(`/finance/transactions?${query}`),
    can(me, 'finance.catalog.read')
      ? serverApi<{ rows: CatalogItem[] }>('/finance/income-sources?status=all')
      : Promise.resolve({ rows: [] as CatalogItem[] }),
    can(me, 'finance.catalog.read')
      ? serverApi<{ rows: CatalogItem[] }>('/finance/expense-items?status=all')
      : Promise.resolve({ rows: [] as CatalogItem[] }),
  ]);
  const currency = me.church?.currency ?? 'TZS';

  return (
    <>
      <PageHeader
        title="Transactions"
        subtitle="Every entry in the books. Voided ones stay, and stop counting."
        actions={
          <>
            {can(me, 'finance.transactions.export') && <ExportButton query={query.toString()} />}
            <RecordButtons />
          </>
        }
      />

      <TransactionFilters
        sources={sources.rows.map((r) => ({ id: r.id, name: r.name }))}
        items={items.rows.map((r) => ({ id: r.id, name: r.name }))}
      />

      <div className="mt-4">
        {data.rows.length === 0 ? (
          <EmptyState title="Nothing matches these filters">
            <Link href="/finance/transactions" className="text-accent underline">
              Clear them
            </Link>
          </EmptyState>
        ) : (
          <Table head={['Number', 'Date', 'Source / item', 'Payer / payee', 'Method', 'Amount']}>
            {data.rows.map((entry) => (
              <Row key={entry.id}>
                <Cell nowrap>
                  <Link
                    href={`/finance/transactions/${entry.code}`}
                    className={`font-mono text-[12px] ${entry.status === 'VOIDED' ? 'text-fg3 line-through' : 'text-accent'}`}
                  >
                    {entry.code}
                  </Link>
                  {entry.status === 'VOIDED' && (
                    <span className="ml-2">
                      <Badge tone="muted">Voided</Badge>
                    </span>
                  )}
                </Cell>
                <Cell nowrap>{day(entry.txnDate)}</Cell>
                <Cell>{entry.item?.name}</Cell>
                <Cell>{entry.counterparty ?? '—'}</Cell>
                <Cell nowrap>{PAYMENT_METHODS[entry.method]}</Cell>
                <Cell nowrap>
                  <span
                    className={`tabular-nums ${entry.status === 'VOIDED' ? 'text-fg3 line-through' : entry.kind === 'INCOME' ? 'text-pos' : 'text-fg'}`}
                  >
                    {entry.kind === 'INCOME' ? '+' : '−'}
                    {formatMoney(entry.amount, '')}
                  </span>
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </div>

      <p className="mt-3 text-[12.5px] text-fg2">
        {data.totals.count} entr{data.totals.count === 1 ? 'y' : 'ies'} · Income{' '}
        <span className="tabular-nums">{formatMoney(data.totals.incomeTotal, currency)}</span> ·
        Expenses{' '}
        <span className="tabular-nums">{formatMoney(data.totals.expenseTotal, currency)}</span> ·
        Net <span className="tabular-nums">{formatMoney(data.totals.net, currency)}</span>
      </p>
    </>
  );
}

const day = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

import type { Metadata } from 'next';
import { serverApi } from '@/lib/api/server';
import { EmptyState } from '@/components/shell/States';
import { Table, Row, Cell } from '@/components/ui/Table';
import { BarList } from '@/modules/platform/components/Charts';
import { bytes, number, type DatabaseUse } from '@/modules/platform/types';

export const metadata: Metadata = { title: 'Database' };

/** How the table names read to a person: finance_transactions → Finance transactions. */
const pretty = (table: string) => table.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** "+412 this week" — growth is the number that decides when to worry. */
function growth(now: number, then: number): string {
  const change = now - then;
  if (!then || change === 0) return '—';
  return `${change > 0 ? '+' : ''}${number(change)}`;
}

export default async function DatabasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const use = await serverApi<DatabaseUse>(`/platform/churches/${id}/database`);

  if (!use.tables.length) {
    return (
      <EmptyState title="Nothing measured yet">
        The nightly job measures every church&apos;s share of the database. It has not run since
        this church was set up.
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-[10px] border border-border bg-surface p-4">
        <h2 className="text-[13px] font-semibold text-fg">
          {bytes(use.totalBytes)} across {use.tables.length} tables
        </h2>
        <p className="mt-0.5 mb-3 text-[11.5px] text-fg3">
          An estimate: each table&apos;s size on disk, including its indexes, shared out by this
          church&apos;s share of the rows.
        </p>
        <BarList
          rows={use.tables.slice(0, 10).map((t) => ({
            label: pretty(t.table),
            value: t.bytes,
            hint: bytes(t.bytes),
          }))}
        />
      </section>

      <Table head={['Table', 'Rows', 'This week', 'This month', 'Size', 'Share']}>
        {use.tables.map((t) => (
          <Row key={t.table}>
            <Cell>
              <span className="font-medium text-fg">{pretty(t.table)}</span>
            </Cell>
            <Cell nowrap>
              <span className="tabular-nums text-fg2">{number(t.rows)}</span>
            </Cell>
            <Cell nowrap>
              <span className="tabular-nums text-fg3">{growth(t.rows, t.rowsWeekAgo)}</span>
            </Cell>
            <Cell nowrap>
              <span className="tabular-nums text-fg3">{growth(t.rows, t.rowsMonthAgo)}</span>
            </Cell>
            <Cell nowrap>
              <span className="tabular-nums text-fg2">{bytes(t.bytes)}</span>
            </Cell>
            <Cell nowrap>
              <span className="tabular-nums text-fg3">{t.share}%</span>
            </Cell>
          </Row>
        ))}
      </Table>
    </div>
  );
}

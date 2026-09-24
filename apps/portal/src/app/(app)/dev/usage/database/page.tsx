import type { Metadata } from 'next';
import { serverApi } from '@/lib/api/server';
import { EmptyState } from '@/components/shell/States';
import { Table, Row, Cell } from '@/components/ui/Table';
import { BarList, LineChart } from '@/modules/dev/components/Charts';
import { Panel } from '@/modules/dev/components/Figure';
import { bytes, daysAgo, number, type DatabaseUse, type Series } from '@/modules/dev/types';

export const metadata: Metadata = { title: 'Database' };

/** How the table names read to a person: finance_transactions → Finance transactions. */
const pretty = (table: string) => table.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** "+412" — growth is the number that decides when to worry. */
function growth(now: number, then: number): string {
  const change = now - then;
  if (!then || change === 0) return '—';
  return `${change > 0 ? '+' : ''}${number(change)}`;
}

export default async function DatabasePage() {
  const [use, size] = await Promise.all([
    serverApi<DatabaseUse>('/dev/database'),
    serverApi<Series[]>(`/dev/usage?metrics=db.bytes.total&from=${daysAgo(89)}`),
  ]);

  if (!use.tables.length) {
    return (
      <EmptyState title="Nothing measured yet">
        The nightly job measures every table at 02:00. It has not run on this database yet; run it
        now with <code>job:run usage-snapshot</code>.
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title={`${bytes(use.totalBytes)} across ${use.tables.length} tables`}
          note="Each table's size on disk, with its indexes, as measured last night."
        >
          <BarList
            rows={use.tables.slice(0, 10).map((t) => ({
              label: pretty(t.table),
              value: t.bytes,
              hint: bytes(t.bytes),
            }))}
          />
        </Panel>
        <Panel title="All the tables together" note="The last 90 days.">
          <LineChart series={size} labels={{ 'db.bytes.total': 'Size' }} />
        </Panel>
      </div>

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

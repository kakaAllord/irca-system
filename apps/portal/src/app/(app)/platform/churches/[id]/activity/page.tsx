import type { Metadata } from 'next';
import { serverApi } from '@/lib/api/server';
import { EmptyState } from '@/components/shell/States';
import { Table, Row, Cell } from '@/components/ui/Table';

export const metadata: Metadata = { title: 'Activity' };

type Entry = { id: string; at: string; who: string; action: string; summary: string };

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

export default async function ActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const entries = await serverApi<Entry[]>(`/platform/churches/${id}/audit`);

  if (!entries.length) return <EmptyState title="Nothing has happened here yet" />;

  return (
    <>
      <Table head={['When', 'Who', 'What']}>
        {entries.map((entry) => (
          <Row key={entry.id}>
            <Cell nowrap>
              <span className="text-fg3 tabular-nums">{when(entry.at)}</span>
            </Cell>
            <Cell nowrap>
              <span className="text-fg2">{entry.who}</span>
            </Cell>
            <Cell>
              <span className="text-fg">{entry.summary}</span>
              <span className="ml-2 text-[11px] text-fg3">{entry.action}</span>
            </Cell>
          </Row>
        ))}
      </Table>
      <p className="mt-2 text-[11.5px] text-fg3">
        The church&apos;s own log, exactly as its administrators see it. Viewing as someone never
        appears here — it is in the view-as log instead.
      </p>
    </>
  );
}

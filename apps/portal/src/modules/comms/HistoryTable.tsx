import Link from 'next/link';
import { EmptyState } from '@/components/shell/States';
import { Badge } from '@/components/ui/Badge';
import { Table, Row, Cell } from '@/components/ui/Table';
import { MESSAGE_STATUS, money, when, type MessageRow } from './types';

/** Every message, newest first: to whom, with what, how it went, what it cost. */
export function HistoryTable({
  rows,
  base,
  showDepartment,
}: {
  rows: MessageRow[];
  base: string;
  showDepartment: boolean;
}) {
  if (!rows.length) return <EmptyState title="Nothing sent yet" />;
  return (
    <Table head={['Sent', 'To', 'What', 'How it went', 'Cost']}>
      {rows.map((m) => {
        const delivered = m.byStatus.DELIVERED ?? 0;
        const sent = (m.byStatus.SENT ?? 0) + delivered;
        const failed = m.byStatus.FAILED ?? 0;
        return (
          <Row key={m.id}>
            <Cell nowrap>
              <Link href={`${base}/${m.id}`} className="font-medium text-fg hover:underline">
                {when(m.scheduledFor ?? m.createdAt)}
              </Link>
              {m.fromBeat && <p className="text-[11px] text-fg3">recurring</p>}
            </Cell>
            <Cell>
              <span className="text-fg">{m.audienceName}</span>
              {showDepartment && (
                <p className="text-[11px] text-fg3">{m.department?.name ?? 'Communications'}</p>
              )}
            </Cell>
            <Cell>
              <span className="text-fg2">{m.template?.name ?? 'Own words'}</span>
            </Cell>
            <Cell nowrap>
              <span className="flex flex-col gap-1">
                <Badge tone={MESSAGE_STATUS[m.status].tone}>{MESSAGE_STATUS[m.status].label}</Badge>
                <span className="text-[11px] text-fg3">
                  {sent} of {m.recipientCount} sent
                  {delivered ? `, ${delivered} delivered` : ''}
                  {failed ? `, ${failed} failed` : ''}
                  {m.skippedCount ? ` · ${m.skippedCount} left alone` : ''}
                </span>
              </span>
            </Cell>
            <Cell nowrap>
              <span className="text-fg2 tabular-nums">{money(m.cost)} TZS</span>
            </Cell>
          </Row>
        );
      })}
    </Table>
  );
}

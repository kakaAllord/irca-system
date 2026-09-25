import { SMS_LANGS } from '@irca/shared';
import { Badge } from '@/components/ui/Badge';
import { Table, Row, Cell } from '@/components/ui/Table';
import { CancelMessage } from './CancelMessage';
import {
  LANG_LABEL,
  MESSAGE_STATUS,
  RECIPIENT_STATUS,
  money,
  when,
  type MessageDetail,
} from './types';

/** One message: what it said, to whom, and what happened to each. */
export function MessageView({
  message: m,
  canCancel,
}: {
  message: MessageDetail;
  canCancel: boolean;
}) {
  const delivered = m.byStatus.DELIVERED ?? 0;
  const reached = Object.entries(m.byStatus)
    .filter(([status]) => !status.startsWith('SKIPPED'))
    .reduce((n, [, count]) => n + count, 0);
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Status">
          <Badge tone={MESSAGE_STATUS[m.status].tone}>{MESSAGE_STATUS[m.status].label}</Badge>
        </Fact>
        <Fact label={m.scheduledFor ? 'Scheduled for' : 'Sent'}>
          {when(m.scheduledFor ?? m.createdAt)}
        </Fact>
        <Fact label="Delivered">{`${delivered} of ${reached}`}</Fact>
        <Fact label="Cost">{`${money(m.cost)} TZS · ${m.segments} segments`}</Fact>
      </div>
      <p className="text-[12.5px] text-fg2">
        {m.template ? `"${m.template.name}"` : 'Own words'}
        {m.createdBy && `, sent by ${m.createdBy}`}
        {m.department ? ` for ${m.department.name}` : ''}.
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        {SMS_LANGS.filter((l) => m.bodies[l]).map((l) => (
          <div key={l} className="rounded-[8px] border border-border bg-surface2 p-3">
            <p className="mb-1 text-[11px] font-semibold text-fg3">{LANG_LABEL[l]}</p>
            <p className="text-[12.5px] text-fg">{m.bodies[l]}</p>
          </div>
        ))}
      </div>
      {canCancel && (m.status === 'SCHEDULED' || m.status === 'SENDING') && (
        <CancelMessage id={m.id} />
      )}
      {m.recipientsHidden ? (
        <p className="rounded-[10px] border border-border bg-surface2 px-4 py-3 text-[12.5px] text-fg2">
          {Object.entries(m.byStatus)
            .map(([status, n]) => `${n} ${(RECIPIENT_STATUS[status] ?? status).toLowerCase()}`)
            .join(' · ')}
          . Who it reached is kept for those who may see pledges.
        </p>
      ) : (
        <Table head={['Person', 'Number', 'Language', 'What happened']}>
          {m.recipients.map((r) => (
            <Row key={r.id}>
              <Cell>
                <span className="font-medium text-fg">{r.name}</span>
              </Cell>
              <Cell nowrap>
                <span className="text-fg2 tabular-nums">{r.phone || '—'}</span>
              </Cell>
              <Cell nowrap>
                <span className="text-fg2">{LANG_LABEL[r.lang]}</span>
              </Cell>
              <Cell>
                <span
                  className={
                    r.status === 'FAILED'
                      ? 'text-danger'
                      : r.status.startsWith('SKIPPED')
                        ? 'text-fg3'
                        : 'text-fg2'
                  }
                >
                  {RECIPIENT_STATUS[r.status] ?? r.status}
                  {r.deliveredAt
                    ? ` · ${when(r.deliveredAt)}`
                    : r.sentAt
                      ? ` · ${when(r.sentAt)}`
                      : ''}
                </span>
                {r.error && <p className="text-[11px] text-fg3">{r.error}</p>}
              </Cell>
            </Row>
          ))}
        </Table>
      )}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[10px] border border-border bg-surface p-3">
      <p className="text-[11px] font-semibold tracking-wide text-fg3 uppercase">{label}</p>
      <div className="mt-1 text-[13px] font-medium text-fg">{children}</div>
    </div>
  );
}

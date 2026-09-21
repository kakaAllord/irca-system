'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { ChangeRequestView } from '@irca/shared';
import { Badge } from '@/components/ui/Badge';
import { Table, Row, Cell } from '@/components/ui/Table';
import { CancelRequestButton } from './CancelRequestButton';

/**
 * Requests as a list you can scan, not a wall of paragraphs.
 *
 * A row says only what is needed to recognise it: what is being asked, about
 * which entry, by whom, when, and where it stands. Everything else — the
 * reason, what would change, and how it was decided — opens underneath the row
 * that asks for it, so reading ten of these does not mean reading everything
 * about all ten.
 */
export function RequestsTable({
  requests,
  allowCancel = false,
}: {
  requests: ChangeRequestView[];
  /** Whether the reader may withdraw their own requests from here. */
  allowCancel?: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <Table head={['Change', 'Entry', 'Asked by', 'When', 'Status', '']}>
      {requests.map((request) => {
        const shown = open === request.id;
        return (
          <Rows
            key={request.id}
            request={request}
            shown={shown}
            onToggle={() => setOpen(shown ? null : request.id)}
            allowCancel={allowCancel}
          />
        );
      })}
    </Table>
  );
}

function Rows({
  request,
  shown,
  onToggle,
  allowCancel,
}: {
  request: ChangeRequestView;
  shown: boolean;
  onToggle: () => void;
  allowCancel: boolean;
}) {
  const panelId = `request-${request.id}`;
  const summary =
    request.action === 'VOID'
      ? 'Void the entry'
      : request.changes.map((change) => change.label).join(', ') || 'Correct the entry';

  return (
    <>
      <Row>
        <Cell>
          <span className="font-medium text-fg">
            {request.action === 'VOID' ? 'Void' : 'Correct'}
          </span>
          <span className="ml-1.5 text-fg3">{summary}</span>
        </Cell>
        <Cell nowrap>
          {request.entityHref ? (
            <Link href={request.entityHref} className="font-mono text-[12px] text-accent">
              {request.entityLabel}
            </Link>
          ) : (
            <span className="font-mono text-[12px]">{request.entityLabel}</span>
          )}
        </Cell>
        <Cell nowrap>
          <span className="text-fg2">
            {request.requestedBy.fullName}
            {request.isMine && <span className="ml-1 text-fg3">(you)</span>}
          </span>
        </Cell>
        <Cell nowrap>
          <span className="text-fg2">{when(request.requestedAt)}</span>
        </Cell>
        <Cell nowrap>
          <Badge tone={tone(request.status)}>{label(request.status)}</Badge>
        </Cell>
        <Cell nowrap>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={shown}
            aria-controls={panelId}
            className="rounded-[6px] border border-border px-2 py-0.5 text-[11.5px] text-fg2 hover:bg-hover hover:text-fg"
          >
            {shown ? 'Hide' : 'Details'} <span aria-hidden="true">{shown ? '▴' : '▾'}</span>
          </button>
        </Cell>
      </Row>

      {shown && (
        <tr className="border-t border-border2 bg-surface2">
          <Cell colSpan={6}>
            <div id={panelId} className="flex flex-col gap-3 py-1">
              <p className="text-[12.5px] text-fg2">
                <span className="text-fg3">Reason: </span>
                &ldquo;{request.reason}&rdquo;
              </p>

              {request.changes.length > 0 && (
                <table className="w-fit text-[12.5px]">
                  <thead>
                    <tr className="text-left text-[10.5px] tracking-wide text-fg3 uppercase">
                      <th className="pr-6 pb-1 font-semibold">Field</th>
                      <th className="pr-3 pb-1 font-semibold">Now</th>
                      <th className="pr-3 pb-1"></th>
                      <th className="pb-1 font-semibold">Asked for</th>
                    </tr>
                  </thead>
                  <tbody>
                    {request.changes.map((change) => (
                      <tr key={change.field}>
                        <td className="py-0.5 pr-6 text-fg3">{change.label}</td>
                        <td className="py-0.5 pr-3 tabular-nums text-fg2">{change.from}</td>
                        <td className="py-0.5 pr-3 text-fg3" aria-label="becomes">
                          →
                        </td>
                        <td className="py-0.5 font-medium tabular-nums text-fg">{change.to}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {request.warning && <p className="text-[12px] text-warn-fg">{request.warning}</p>}

              <p className="text-[11.5px] text-fg3">
                Asked by {request.requestedBy.fullName}
                {request.requestedBy.roles.length > 0 &&
                  ` (${request.requestedBy.roles.join(', ')})`}{' '}
                on {full(request.requestedAt)}
                {request.decidedBy && (
                  <>
                    {' · '}
                    {label(request.status)} by {request.decidedBy.fullName} on{' '}
                    {full(request.decidedAt!)}
                    {request.decisionNote && `: ${request.decisionNote}`}
                  </>
                )}
                {request.result?.newCode && ` · now ${request.result.newCode}`}
              </p>

              {allowCancel && request.isMine && request.status === 'PENDING' && (
                <div className="flex justify-end">
                  <CancelRequestButton id={request.id} />
                </div>
              )}
            </div>
          </Cell>
        </tr>
      )}
    </>
  );
}

const label = (status: ChangeRequestView['status']) =>
  ({ PENDING: 'Waiting', APPROVED: 'Approved', REJECTED: 'Rejected', CANCELLED: 'Withdrawn' })[
    status
  ];

const tone = (status: ChangeRequestView['status']) =>
  status === 'APPROVED'
    ? ('positive' as const)
    : status === 'REJECTED'
      ? ('danger' as const)
      : status === 'PENDING'
        ? ('accent' as const)
        : ('muted' as const);

/** "2 hours ago", "yesterday", "3 Sept" — enough to know how long it has waited. */
function when(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const full = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

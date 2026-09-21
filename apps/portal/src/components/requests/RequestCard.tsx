import Link from 'next/link';
import type { ChangeRequestView } from '@irca/shared';
import { Badge } from '@/components/ui/Badge';

/**
 * One request, the same card wherever it is read: the administrators' inbox,
 * where it can be decided, and the department's own list, where it cannot.
 */
export function RequestCard({
  request,
  actions,
}: {
  request: ChangeRequestView;
  actions?: React.ReactNode;
}) {
  return (
    <article className="rounded-[10px] border border-border bg-surface">
      <header className="flex flex-wrap items-center gap-2 border-b border-border2 px-4 py-2.5">
        <span className="text-[10.5px] font-semibold tracking-wide text-fg3 uppercase">
          {request.moduleName}
        </span>
        <span className="text-[12.5px] font-medium text-fg">
          {request.action === 'VOID' ? 'Void' : 'Correct'}{' '}
          {request.entityHref ? (
            <Link href={request.entityHref} className="font-mono text-accent underline">
              {request.entityLabel}
            </Link>
          ) : (
            <span className="font-mono">{request.entityLabel}</span>
          )}
        </span>
        <span className="ml-auto text-[11.5px] text-fg3">asked {when(request.requestedAt)}</span>
        {request.status !== 'PENDING' && (
          <Badge tone={tone(request.status)}>{label(request.status)}</Badge>
        )}
      </header>

      <div className="flex flex-col gap-3 px-4 py-3">
        <p className="text-[12.5px] text-fg2">
          <span className="font-medium text-fg">
            {request.requestedBy.fullName}
            {request.isMine && ' (you)'}
          </span>
          {request.requestedBy.roles.length > 0 && ` (${request.requestedBy.roles.join(', ')})`}:
          &ldquo;{request.reason}&rdquo;
        </p>

        {request.changes.length > 0 && (
          <table className="w-fit text-[12.5px]">
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

        {request.decidedBy && (
          <p className="text-[12px] text-fg3">
            {label(request.status)} by {request.decidedBy.fullName}
            {request.decisionNote && `: ${request.decisionNote}`}
            {request.result?.newCode && ` · now ${request.result.newCode}`}
          </p>
        )}

        {actions && <div className="flex flex-wrap justify-end gap-2">{actions}</div>}
      </div>
    </article>
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
      : ('muted' as const);

/** "2 hours ago", "yesterday", "3 Sept" — enough to know how long it has waited. */
function when(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

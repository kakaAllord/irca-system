import type { Metadata } from 'next';
import Link from 'next/link';
import type { ChangeRequestView, MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { EmptyState, ForbiddenState } from '@/components/shell/States';
import { RequestsTable } from '@/components/requests/RequestsTable';
import { cn } from '@/lib/cn';

export const metadata: Metadata = { title: 'Finance requests' };

const TABS = [
  { key: 'PENDING', label: 'Waiting' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: '', label: 'All' },
] as const;

/**
 * What finance has asked for, and how it went.
 *
 * There are no approve buttons here, ever: deciding happens in Admin, by
 * someone other than the person who asked.
 */
export default async function FinanceRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ mine?: string; status?: string }>;
}) {
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'finance.transactions.read')) return <ForbiddenState what="finance requests" />;

  const params = await searchParams;
  const mine = params.mine === 'true';
  const status = params.status ?? '';
  const query = new URLSearchParams();
  if (mine) query.set('mine', 'true');
  if (status) query.set('status', status);
  const requests = await serverApi<ChangeRequestView[]>(`/finance/change-requests?${query}`);

  const href = (next: { mine?: boolean; status?: string }) => {
    const q = new URLSearchParams();
    if (next.mine ?? mine) q.set('mine', 'true');
    const s = next.status ?? status;
    if (s) q.set('status', s);
    return `/finance/requests${q.size ? `?${q}` : ''}`;
  };

  return (
    <>
      <PageHeader
        title="Requests"
        subtitle="Corrections and voids waiting for an administrator, and the ones already decided."
      />

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <nav className="flex flex-wrap gap-1.5" aria-label="Filter by decision">
          {TABS.map((tab) => (
            <Link
              key={tab.key}
              href={href({ status: tab.key })}
              aria-current={status === tab.key ? 'page' : undefined}
              className={cn(
                'rounded-full border px-3 py-1 text-[12px]',
                status === tab.key
                  ? 'border-accent-br bg-chip text-fg'
                  : 'border-border text-fg2 hover:bg-hover',
              )}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
        <Link
          href={href({ mine: !mine })}
          className={cn(
            'ml-auto rounded-full border px-3 py-1 text-[12px]',
            mine ? 'border-accent-br bg-chip text-fg' : 'border-border text-fg2 hover:bg-hover',
          )}
        >
          {mine ? 'Showing only mine' : 'Only mine'}
        </Link>
      </div>

      {requests.length === 0 ? (
        <EmptyState title="Nothing asked for yet">
          Corrections to entries are requested from the entry itself.
        </EmptyState>
      ) : (
        <RequestsTable requests={requests} allowCancel />
      )}
    </>
  );
}

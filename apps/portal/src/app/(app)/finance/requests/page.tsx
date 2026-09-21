import type { Metadata } from 'next';
import Link from 'next/link';
import type { ChangeRequestView, MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { EmptyState, ForbiddenState } from '@/components/shell/States';
import { RequestCard } from '@/components/requests/RequestCard';
import { CancelRequestButton } from './CancelRequestButton';
import { cn } from '@/lib/cn';

export const metadata: Metadata = { title: 'Finance requests' };

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
  const query = new URLSearchParams();
  if (mine) query.set('mine', 'true');
  if (params.status) query.set('status', params.status);
  const requests = await serverApi<ChangeRequestView[]>(`/finance/change-requests?${query}`);

  return (
    <>
      <PageHeader
        title="Requests"
        subtitle="Corrections and voids waiting for an administrator, and the ones already decided."
      />

      <nav className="mb-4 flex gap-1.5" aria-label="Whose requests">
        {[
          { key: false, label: 'Everyone' },
          { key: true, label: 'Mine' },
        ].map((tab) => (
          <Link
            key={String(tab.key)}
            href={tab.key ? '/finance/requests?mine=true' : '/finance/requests'}
            aria-current={mine === tab.key ? 'page' : undefined}
            className={cn(
              'rounded-full border px-3 py-1 text-[12px]',
              mine === tab.key
                ? 'border-accent-br bg-chip text-fg'
                : 'border-border text-fg2 hover:bg-hover',
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {requests.length === 0 ? (
        <EmptyState title="Nothing asked for yet">
          Corrections to entries are requested from the entry itself.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {requests.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              actions={
                request.status === 'PENDING' && request.isMine ? (
                  <CancelRequestButton id={request.id} />
                ) : null
              }
            />
          ))}
        </div>
      )}
    </>
  );
}

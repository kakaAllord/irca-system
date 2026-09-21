import type { Metadata } from 'next';
import Link from 'next/link';
import type { ChangeRequestView, MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { EmptyState, ForbiddenState } from '@/components/shell/States';
import { RequestCard } from '@/components/requests/RequestCard';
import { DecideButtons } from '@/components/requests/DecideButtons';
import { cn } from '@/lib/cn';

export const metadata: Metadata = { title: 'Requests' };

const TABS = [
  { key: 'PENDING', label: 'Waiting' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: '', label: 'All' },
] as const;

/**
 * Everything any portal has asked an administrator to approve.
 *
 * Nothing changes until someone here says yes, and nobody can say yes to
 * their own request, which is why a card of your own shows why instead of a
 * button that would fail.
 */
export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; module?: string }>;
}) {
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'admin.requests.read')) return <ForbiddenState what="change requests" />;

  const params = await searchParams;
  const status = params.status ?? 'PENDING';
  const query = new URLSearchParams();
  if (status) query.set('status', status);
  if (params.module) query.set('module', params.module);
  const requests = await serverApi<ChangeRequestView[]>(`/admin/requests?${query}`);

  return (
    <>
      <PageHeader
        title="Requests"
        subtitle="Changes people have asked for. Nothing changes until an administrator approves."
      />

      <nav className="mb-4 flex flex-wrap gap-1.5" aria-label="Filter by decision">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tab.key ? `/admin/requests?status=${tab.key}` : '/admin/requests?status='}
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

      {requests.length === 0 ? (
        <EmptyState title="Nothing is waiting">
          Corrections people ask for will appear here.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {requests.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              actions={
                request.status === 'PENDING' && can(me, 'admin.requests.decide') ? (
                  <DecideButtons request={request} />
                ) : null
              }
            />
          ))}
        </div>
      )}
    </>
  );
}

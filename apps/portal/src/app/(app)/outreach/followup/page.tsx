import type { Metadata } from 'next';
import Link from 'next/link';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { EmptyState, ForbiddenState } from '@/components/shell/States';
import { shortDay, type PendingFollowUp } from '@/modules/outreach/types';

export const metadata: Metadata = { title: 'Follow-up' };

/**
 * Everyone Outreach reached who still needs following up, the longest waiting
 * first, with a number to ring and the last thing that happened.
 */
export default async function FollowUpPage() {
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'outreach.reached.read')) return <ForbiddenState what="the follow-up" />;
  const people = await serverApi<PendingFollowUp[]>('/outreach/followup');

  return (
    <>
      <PageHeader
        title="Follow-up"
        subtitle="People reached who still need a call or a visit, the longest waiting first."
      />
      {people.length === 0 ? (
        <EmptyState title="Nobody waiting">Everyone reached has been followed up.</EmptyState>
      ) : (
        <ul className="flex flex-col divide-y divide-border2 rounded-[10px] border border-border bg-surface">
          {people.map((p) => (
            <li key={p.personId} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <Link
                href={`/outreach/people/${p.personId}`}
                className="flex min-w-0 flex-col hover:underline"
              >
                <span className="text-[13px] font-medium text-fg">{p.name}</span>
                <span className="text-[12px] text-fg2">
                  Reached {shortDay(p.reachedOn)}
                  {p.area && ` in ${p.area}`}
                  {' · '}
                  {p.followups === 0
                    ? 'not followed up yet'
                    : `${p.followups} follow-up${p.followups === 1 ? '' : 's'}`}
                </span>
                {p.last && (
                  <span className="truncate text-[12px] text-fg3">
                    Last: {p.last.summary}, {shortDay(p.last.at)}
                  </span>
                )}
              </Link>
              {p.phone && (
                <a
                  href={`tel:${p.phone.replace(/[^\d+]/g, '')}`}
                  className="inline-flex h-9 items-center rounded-[7px] border border-border px-3 text-[12.5px] font-medium text-fg hover:bg-hover"
                  aria-label={`Call ${p.name}`}
                >
                  Call
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

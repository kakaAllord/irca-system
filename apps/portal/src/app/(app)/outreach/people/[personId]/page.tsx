import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { ApiRequestError } from '@/lib/api/errors';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { ForbiddenState } from '@/components/shell/States';
import { Badge } from '@/components/ui/Badge';
import { STAGE_LABEL } from '@/modules/membership/types';
import { Timeline } from '@/modules/membership/Timeline';
import { FollowUpForm } from '@/modules/outreach/FollowUpForm';
import { churchToday, longDay, type ReachedPerson } from '@/modules/outreach/types';

export const metadata: Metadata = { title: 'Reached' };

/**
 * Someone Outreach reached: their number, each time they were reached, the
 * follow-up, and their whole timeline. Only people Outreach reached open
 * here; everyone else in People is Membership's.
 */
export default async function ReachedPersonPage({
  params,
}: {
  params: Promise<{ personId: string }>;
}) {
  const { personId } = await params;
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'outreach.reached.read')) return <ForbiddenState what="the people reached" />;

  let person: ReachedPerson;
  try {
    person = await serverApi<ReachedPerson>(`/outreach/people/${personId}`);
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 404) notFound();
    throw err;
  }

  return (
    <div className="max-w-3xl">
      <Link href="/outreach/followup" className="text-[12px] text-fg2 hover:text-fg">
        ← Follow-up
      </Link>
      <div className="mt-2">
        <PageHeader
          title={person.name}
          subtitle={`${STAGE_LABEL[person.stage]}${person.optedOut ? ' · asked not to be texted' : ''}`}
          actions={
            person.phone ? (
              <a
                href={`tel:${person.phone.replace(/[^\d+]/g, '')}`}
                className="inline-flex h-9 items-center rounded-[7px] bg-btn-bg px-3.5 text-[12.5px] font-medium text-btn-fg hover:opacity-90"
              >
                Call {person.phone}
              </a>
            ) : undefined
          }
        />
      </div>

      <div className="flex flex-col gap-4">
        {can(me, 'outreach.reached.record') && (
          <section className="rounded-[10px] border border-border bg-surface p-4">
            <h2 className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-fg">
              Follow up
              {person.needsFollowUp ? (
                <Badge tone="accent">Needs following up</Badge>
              ) : (
                <Badge tone="muted">Nothing to do for now</Badge>
              )}
            </h2>
            <FollowUpForm personId={person.id} today={churchToday(me.church?.timezone)} />
          </section>
        )}

        <section className="rounded-[10px] border border-border bg-surface p-4">
          <h2 className="mb-3 text-[13px] font-semibold text-fg">Timeline</h2>
          <Timeline lines={person.timeline} />
        </section>

        <section className="rounded-[10px] border border-border bg-surface p-4">
          <h2 className="mb-3 text-[13px] font-semibold text-fg">
            Reached <span className="font-normal text-fg3">· {person.reaches.length}</span>
          </h2>
          <ul className="flex flex-col gap-2 text-[12.5px]">
            {person.reaches.map((r) => (
              <li key={r.id} className="border-t border-border2 pt-2 first:border-0 first:pt-0">
                <span className="text-fg">
                  {longDay(r.reachedOn)}
                  {r.area && ` · ${r.area}`}
                </span>
                <span className="block text-fg2">
                  {r.reachedBy.length > 0 && `by ${r.reachedBy.join(', ')}`}
                  {r.session && (
                    <>
                      {r.reachedBy.length > 0 && ' · '}
                      <Link
                        href={`/outreach/sessions/${r.session.id}`}
                        className="text-accent underline"
                      >
                        {r.session.title || 'the Saturday'}
                      </Link>
                    </>
                  )}
                </span>
                {r.note && <span className="block text-fg3">{r.note}</span>}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

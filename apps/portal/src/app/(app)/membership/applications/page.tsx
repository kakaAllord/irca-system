import type { Metadata } from 'next';
import Link from 'next/link';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { EmptyState, ForbiddenState } from '@/components/shell/States';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';
import { STAGE_LABEL, day, type Stage } from '@/modules/membership/types';
import { ApplicationActions, NewApplication } from './ApplicationActions';

export const metadata: Metadata = { title: 'Applications' };

type Status = 'UNDER_REVIEW' | 'APPROVED' | 'CONFIRMED' | 'REJECTED' | 'WITHDRAWN';
export type Application = {
  id: string;
  status: Status;
  source: 'FORM' | 'OFFICE';
  submittedAt: string;
  decidedAt: string | null;
  rejectReason: string | null;
  availableOn: string | null;
  canConfirm: boolean;
  person: {
    id: string;
    fullName: string;
    initials: string;
    stage: Stage;
    memberNumber: number | null;
    attendsSince: string;
    baptised: boolean;
    foundationClass: 'finished' | 'dropped' | 'attending' | 'not started';
  };
};

const TABS: [Status, string][] = [
  ['UNDER_REVIEW', 'Under review'],
  ['APPROVED', 'Approved'],
  ['CONFIRMED', 'Confirmed'],
  ['REJECTED', 'Not approved'],
  ['WITHDRAWN', 'Withdrawn'],
];

const STEPS = [
  ['Application submitted', 'From the form, or entered by the office.'],
  ['Under review', 'A pastor looks at it.'],
  ['Approved', 'Approved by Pastor Ndelimbi or Pastor Sarah.'],
  ['Confirmed', 'After the probation month they become members, with a number.'],
] as const;

/** Asking to become a member, and the pastors' decisions. */
export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'membership.applications.read'))
    return <ForbiddenState what="membership applications" />;

  const { status: raw } = await searchParams;
  const status = (TABS.find(([key]) => key === raw)?.[0] ?? 'UNDER_REVIEW') as Status;
  const data = await serverApi<{
    counts: Partial<Record<Status, number>>;
    probationDays: number;
    rows: Application[];
  }>(`/membership/applications?status=${status}`);
  const reached = { UNDER_REVIEW: 2, APPROVED: 3, CONFIRMED: 4, REJECTED: 2, WITHDRAWN: 1 }[status];

  return (
    <>
      <PageHeader
        title="Applications"
        subtitle="People asking to become members of the church."
        actions={<NewApplication />}
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div>
          <nav className="mb-4 flex flex-wrap gap-1.5" aria-label="Applications by step">
            {TABS.map(([key, label]) => (
              <Link
                key={key}
                href={`/membership/applications?status=${key}`}
                aria-current={status === key ? 'page' : undefined}
                className={cn(
                  'rounded-full border px-3 py-1 text-[12px]',
                  status === key
                    ? 'border-accent-br bg-chip text-fg'
                    : 'border-border text-fg2 hover:bg-hover',
                )}
              >
                {label} <span className="text-fg3 tabular-nums">{data.counts[key] ?? 0}</span>
              </Link>
            ))}
          </nav>

          {data.rows.length === 0 ? (
            <EmptyState title="Nobody at this step" />
          ) : (
            <ul className="flex flex-col divide-y divide-border2 rounded-[10px] border border-border bg-surface">
              {data.rows.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span
                    aria-hidden="true"
                    className="flex size-8 flex-none items-center justify-center rounded-full bg-chip text-[11.5px] font-semibold text-fg2"
                  >
                    {a.person.initials}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <Link
                      href={`/membership/people/${a.person.id}`}
                      className="font-medium text-fg hover:underline"
                    >
                      {a.person.fullName}
                    </Link>
                    <span className="text-[11.5px] text-fg3">
                      Applied {day(a.submittedAt)}
                      {a.source === 'FORM' && ' on the form'} · attends since{' '}
                      {day(a.person.attendsSince)} · foundation class {a.person.foundationClass} ·{' '}
                      {a.person.baptised ? 'baptised' : 'not baptised'}
                      {a.rejectReason && ` · ${a.rejectReason}`}
                    </span>
                  </span>
                  <Badge
                    tone={
                      a.status === 'CONFIRMED'
                        ? 'positive'
                        : a.status === 'REJECTED'
                          ? 'danger'
                          : 'neutral'
                    }
                  >
                    {a.status === 'CONFIRMED' && a.person.memberNumber
                      ? `Member ${a.person.memberNumber}`
                      : STAGE_LABEL[a.person.stage]}
                  </Badge>
                  <ApplicationActions application={a} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside className="h-fit rounded-[10px] border border-border bg-surface p-4">
          <h2 className="mb-3 text-[13px] font-semibold text-fg">Approval steps</h2>
          <ol className="flex flex-col gap-3">
            {STEPS.map(([title, note], i) => (
              <li key={title} className="flex gap-2.5">
                <span
                  aria-hidden="true"
                  className={cn(
                    'mt-1 size-2.5 flex-none rounded-full border',
                    i < reached ? 'border-accent bg-accent' : 'border-border',
                  )}
                />
                <span className="flex flex-col">
                  <span className="text-[12.5px] font-medium text-fg">{title}</span>
                  <span className="text-[11.5px] text-fg3">
                    {i === 3
                      ? `After ${data.probationDays} days they become members, with a number.`
                      : note}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </>
  );
}

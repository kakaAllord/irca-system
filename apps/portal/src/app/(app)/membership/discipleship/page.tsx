import type { Metadata } from 'next';
import Link from 'next/link';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { EmptyState, ForbiddenState } from '@/components/shell/States';
import { cn } from '@/lib/cn';
import { STAGE_LABEL, type Group, type Stage } from '@/modules/membership/types';
import { NewGroup, Register } from './Register';

export const metadata: Metadata = { title: 'Discipleship' };

type Card = {
  personId: string;
  fullName: string;
  initials: string;
  group: string | null;
  enrollmentId: string | null;
  progress: { attended: number; of: number } | null;
  atRisk: boolean;
  baptised: boolean;
  memberNumber: number | null;
  readyToApply: boolean;
};
type Board = { sessions: number; columns: { stage: Stage; count: number; cards: Card[] }[] };
export type RegisterData = {
  sessions: number;
  rows: {
    enrollmentId: string;
    personId: string;
    fullName: string;
    initials: string;
    completed: boolean;
    marks: ('ATTENDED' | 'MISSED' | null)[];
    attended: number;
    atRisk: boolean;
  }[];
};

/** From the decision to follow Christ to full membership. */
export default async function DiscipleshipPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; group?: string }>;
}) {
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'membership.discipleship.read'))
    return <ForbiddenState what="the foundation class" />;

  const params = await searchParams;
  const view = params.view === 'register' ? 'register' : 'board';
  const groups = await serverApi<Group[]>('/membership/discipleship/groups');
  const group =
    params.group ?? (view === 'register' ? groups.find((g) => g.isActive)?.id : undefined);

  const board =
    view === 'board'
      ? await serverApi<Board>(`/membership/discipleship/board${group ? `?group=${group}` : ''}`)
      : null;
  const register =
    view === 'register' && group
      ? await serverApi<RegisterData>(`/membership/discipleship/register?group=${group}`)
      : null;

  const link = (next: { view?: string; group?: string }) => {
    const q = new URLSearchParams();
    const v = next.view ?? view;
    if (v !== 'board') q.set('view', v);
    const g = next.group ?? group;
    if (g) q.set('group', g);
    return `/membership/discipleship${q.size ? `?${q}` : ''}`;
  };

  return (
    <>
      <PageHeader
        title="Discipleship"
        subtitle="Every new convert from the decision to full membership."
        actions={<NewGroup />}
      />

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {(
          [
            ['board', 'Board'],
            ['register', 'Class register'],
          ] as const
        ).map(([key, label]) => (
          <Link
            key={key}
            href={link({ view: key })}
            aria-current={view === key ? 'page' : undefined}
            className={cn(
              'rounded-full border px-3 py-1 text-[12px]',
              view === key
                ? 'border-accent-br bg-chip text-fg'
                : 'border-border text-fg2 hover:bg-hover',
            )}
          >
            {label}
          </Link>
        ))}
        <span className="mx-2 h-4 w-px bg-border" aria-hidden="true" />
        {view === 'board' && (
          <Link
            href="/membership/discipleship"
            className={cn(
              'rounded-full px-3 py-1 text-[12px]',
              !group ? 'bg-chip text-fg' : 'text-fg2 hover:bg-hover',
            )}
          >
            All groups
          </Link>
        )}
        {groups
          .filter((g) => g.isActive)
          .map((g) => (
            <Link
              key={g.id}
              href={link({ group: g.id })}
              className={cn(
                'rounded-full px-3 py-1 text-[12px]',
                group === g.id ? 'bg-chip text-fg' : 'text-fg2 hover:bg-hover',
              )}
            >
              {g.name}
            </Link>
          ))}
      </div>

      {board && (
        <div className="grid gap-3 overflow-x-auto md:grid-cols-5">
          {board.columns.map((column) => (
            <section
              key={column.stage}
              className="flex min-w-[200px] flex-col gap-2 rounded-[10px] bg-surface2 p-2.5"
            >
              <h2 className="flex items-center justify-between px-1 text-[12px] font-semibold text-fg">
                {STAGE_LABEL[column.stage]}
                <span className="text-fg3 tabular-nums">{column.count}</span>
              </h2>
              {column.cards.length === 0 && (
                <p className="px-1 text-[11.5px] text-fg3">Nobody yet.</p>
              )}
              {column.cards.map((card) => (
                <Link
                  key={card.personId}
                  href={`/membership/people/${card.personId}`}
                  className="flex flex-col gap-1 rounded-[8px] border border-border bg-surface p-2.5 hover:border-accent-br"
                >
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="flex size-6 flex-none items-center justify-center rounded-full bg-chip text-[10px] font-semibold text-fg2"
                    >
                      {card.initials}
                    </span>
                    <span className="truncate text-[12.5px] font-medium text-fg">
                      {card.fullName}
                    </span>
                  </span>
                  <span className="text-[11px] text-fg3">
                    {[
                      card.group,
                      card.progress && `${card.progress.attended} of ${card.progress.of} sessions`,
                      card.memberNumber && `Member ${card.memberNumber}`,
                    ]
                      .filter(Boolean)
                      .join(' · ') || (card.baptised ? 'Baptised' : 'Not in a class yet')}
                  </span>
                  {card.atRisk && (
                    <span className="text-[11px] text-warn-fg">
                      Missed two in a row — worth a visit
                    </span>
                  )}
                  {card.readyToApply && (
                    <span className="text-[11px] text-pos">Ready to apply</span>
                  )}
                </Link>
              ))}
            </section>
          ))}
        </div>
      )}

      {view === 'register' &&
        (register ? (
          <Register groupId={group!} data={register} />
        ) : (
          <EmptyState title="No groups yet">
            Start a group, then sign people up from their record.
          </EmptyState>
        ))}
    </>
  );
}

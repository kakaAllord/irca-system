import type { Metadata } from 'next';
import Link from 'next/link';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { EmptyState, ForbiddenState } from '@/components/shell/States';
import { MarkLegend } from '@/components/ui/MarkButton';
import { cn } from '@/lib/cn';
import { TrainingDrawer } from '@/modules/outreach/TrainingControls';
import {
  churchToday,
  longDay,
  shortDay,
  type Team,
  type TrainingHistory,
  type TrainingRow,
} from '@/modules/outreach/types';

export const metadata: Metadata = { title: 'Training' };

/** Friday training: each one, who came, and who has stopped coming. */
export default async function TrainingPage() {
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'outreach.training.read')) return <ForbiddenState what="the training" />;
  const [trainings, history, team] = await Promise.all([
    serverApi<TrainingRow[]>('/outreach/trainings'),
    serverApi<TrainingHistory>('/outreach/trainings/history'),
    can(me, 'outreach.team.read') ? serverApi<Team>('/outreach/team') : null,
  ]);
  const today = churchToday(me.church?.timezone);

  return (
    <>
      <PageHeader
        title="Training"
        subtitle="The Friday training, who taught it, and who came."
        actions={
          <>
            {team?.youLead && (
              <Link
                href={`/departments/${team.department.id}/messages?to=everyone`}
                className="inline-flex h-9 items-center rounded-[7px] border border-border px-3.5 text-[12.5px] font-medium text-fg hover:bg-hover"
              >
                Remind the team
              </Link>
            )}
            {can(me, 'outreach.training.manage') && (
              <TrainingDrawer defaultDate={nextFriday(today)} />
            )}
          </>
        }
      />

      <div className="flex flex-col gap-7">
        <section className="flex flex-col gap-2">
          {trainings.length === 0 ? (
            <EmptyState title="No trainings yet">
              A leader plans one, then marks who came on the day.
            </EmptyState>
          ) : (
            <ul className="flex flex-col gap-2">
              {trainings.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/outreach/training/${t.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-border bg-surface p-3 hover:border-accent-br"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="text-[13px] font-medium text-fg">{t.topic}</span>
                      <span className="text-[12px] text-fg2">
                        {[
                          `${longDay(t.date)}, ${t.time}`,
                          t.venue,
                          t.trainer && `with ${t.trainer}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <span className="text-[12px] tabular-nums text-fg2">
                      {t.date > today
                        ? 'Coming up'
                        : t.marked
                          ? `${t.attended} came`
                          : 'Not marked yet'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {history.trainings.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-[14px] font-semibold text-fg">Who has been coming</h2>
            <p className="text-[12px] text-fg3">
              {history.trainings.length === 1
                ? 'The one training so far.'
                : `The last ${history.trainings.length} trainings, oldest first.`}
            </p>
            <div className="overflow-x-auto rounded-[10px] border border-border bg-surface p-3">
              <table className="text-[12.5px]">
                <thead>
                  <tr className="text-left text-[11px] text-fg3">
                    <th className="py-1.5 pr-3 font-semibold">Person</th>
                    {history.trainings.map((t) => (
                      <th
                        key={t.id}
                        className="w-9 py-1.5 text-center font-semibold"
                        title={t.topic}
                      >
                        {shortDay(t.date)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.people.map((p) => (
                    <tr key={p.personId} className="border-t border-border2">
                      <td className="py-1.5 pr-3 whitespace-nowrap text-fg">{p.name}</td>
                      {p.marks.map((m, i) => (
                        <td
                          key={i}
                          className={cn(
                            'py-1.5 text-center',
                            m === 'ATTENDED' && 'text-pos',
                            m === 'MISSED' && 'text-danger',
                            !m && 'text-fg3',
                          )}
                          aria-label={
                            m === 'ATTENDED' ? 'attended' : m === 'MISSED' ? 'missed' : 'not marked'
                          }
                        >
                          {m === 'ATTENDED' ? '✓' : m === 'MISSED' ? '✕' : '·'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <MarkLegend empty="Not marked" />
            </div>
          </section>
        )}
      </div>
    </>
  );
}

/** The coming Friday, or today when it is one. */
function nextFriday(today: string): string {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + ((5 - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
}

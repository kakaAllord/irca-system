import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { ApiRequestError } from '@/lib/api/errors';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { EmptyState, ForbiddenState } from '@/components/shell/States';
import { Badge } from '@/components/ui/Badge';
import {
  RemoveTeamButton,
  SessionDrawer,
  SpokenToField,
  StatusButtons,
  TeamDrawer,
} from '@/modules/outreach/SessionControls';
import { ReportPanel } from '@/modules/outreach/ReportPanel';
import {
  STATUS_LABEL,
  churchToday,
  longDay,
  type ReportVersions,
  type Session,
  type Team,
} from '@/modules/outreach/types';

export const metadata: Metadata = { title: 'Saturday' };

/** One Saturday: its teams, where they went, and recording who they reached. */
export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'outreach.sessions.read')) return <ForbiddenState what="the Saturdays" />;

  let session: Session;
  try {
    session = await serverApi<Session>(`/outreach/sessions/${id}`);
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 404) notFound();
    throw err;
  }
  const manage = can(me, 'outreach.sessions.manage');
  // People are recorded on the day or after it, never ahead of it.
  const record =
    can(me, 'outreach.reached.record') &&
    session.status !== 'CANCELLED' &&
    session.heldOn <= churchToday(me.church?.timezone);
  const planned = session.status === 'PLANNED';
  const report = can(me, 'outreach.reports.read')
    ? await serverApi<ReportVersions>(`/outreach/sessions/${session.id}/report/versions`)
    : null;
  const [team, areas] =
    manage && planned
      ? await Promise.all([
          serverApi<Team>('/outreach/team'),
          serverApi<string[]>('/outreach/areas'),
        ])
      : [null, []];

  return (
    <>
      <Link href="/outreach/sessions" className="text-[12px] text-fg2 hover:text-fg">
        ← Saturdays
      </Link>
      <div className="mt-2">
        <PageHeader
          title={longDay(session.heldOn)}
          subtitle={
            [session.title, session.createdBy && `planned by ${session.createdBy}`]
              .filter(Boolean)
              .join(' · ') || undefined
          }
          actions={
            manage ? (
              <>
                <StatusButtons session={session} />
                <SessionDrawer session={session} />
              </>
            ) : undefined
          }
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-[12.5px] text-fg2">
        <Badge
          tone={
            session.status === 'COMPLETED'
              ? 'positive'
              : session.status === 'CANCELLED'
                ? 'muted'
                : 'accent'
          }
        >
          {STATUS_LABEL[session.status]}
        </Badge>
        {can(me, 'outreach.reached.read') && (
          <Link href={`/outreach/reached?session=${session.id}`} className="text-accent underline">
            {session.reached} {session.reached === 1 ? 'person' : 'people'} reached
          </Link>
        )}
        {session.notes && <span>· {session.notes}</span>}
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[14px] font-semibold text-fg">
            Teams <span className="font-normal text-fg3">· {session.teams.length}</span>
          </h2>
          {team && (
            <TeamDrawer
              sessionId={session.id}
              people={team.people}
              groups={team.groups}
              areas={areas}
            />
          )}
        </div>
        {session.teams.length === 0 ? (
          <EmptyState title="No teams yet">
            {manage && planned
              ? 'Send a team to each area: a partner group, or people put together for the day.'
              : 'A leader sends teams to areas.'}
          </EmptyState>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {session.teams.map((t) => (
              <li
                key={t.id}
                className="flex flex-col gap-3 rounded-[10px] border border-border bg-surface p-3.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="flex flex-col">
                    <span className="text-[14px] font-semibold text-fg">{t.area}</span>
                    <span className="text-[12px] text-fg2">
                      {t.people.map((p) => p.name).join(', ')}
                      {t.group && <span className="text-fg3"> · {t.group.name}</span>}
                    </span>
                  </span>
                  {team && (
                    <span className="flex flex-none items-center">
                      <TeamDrawer
                        sessionId={session.id}
                        team={t}
                        people={team.people}
                        groups={team.groups}
                        areas={areas}
                      />
                      {t.reached === 0 && <RemoveTeamButton sessionId={session.id} team={t} />}
                    </span>
                  )}
                </div>
                <p className="text-[12.5px] text-fg2">
                  <span className="font-semibold text-fg tabular-nums">{t.reached}</span> recorded
                  {' · '}
                  <span className="font-semibold text-fg tabular-nums">{t.spokenToOnly}</span>{' '}
                  spoken to, no details{' · '}
                  <span className="font-semibold text-fg tabular-nums">
                    {t.saved + t.savedOnly}
                  </span>{' '}
                  saved
                </p>
                {record && (
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <SpokenToField team={t} />
                    <Link
                      href={`/outreach/reached/new?team=${t.id}`}
                      className="inline-flex h-9 items-center rounded-[7px] bg-btn-bg px-3.5 text-[12.5px] font-medium text-btn-fg hover:opacity-90"
                    >
                      Record someone
                    </Link>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {report && (
        <div className="mt-7 max-w-2xl">
          <ReportPanel
            sessionId={session.id}
            versions={report}
            canUpload={can(me, 'outreach.reports.upload')}
          />
        </div>
      )}
    </>
  );
}

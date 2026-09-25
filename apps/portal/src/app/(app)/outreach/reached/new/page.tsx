import type { Metadata } from 'next';
import Link from 'next/link';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { ApiRequestError } from '@/lib/api/errors';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { ForbiddenState } from '@/components/shell/States';
import { RecordForm, type TeamChoice } from '@/modules/outreach/RecordForm';
import {
  churchToday,
  shortDay,
  type Session,
  type SessionRow,
  type Team,
} from '@/modules/outreach/types';

export const metadata: Metadata = { title: 'Record someone' };

/** How many planned Saturdays offer their teams. More than this is a planning backlog. */
const PLANNED = 4;

/** Recording someone reached: a page of its own, because it is used standing up. */
export default async function RecordPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string; team?: string }>;
}) {
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'outreach.reached.record')) return <ForbiddenState what="recording people" />;
  const params = await searchParams;

  // Saturdays that have come: nobody is reached on one still ahead.
  const planned = await serverApi<SessionRow[]>(
    `/outreach/sessions?status=PLANNED&to=${churchToday(me.church?.timezone)}`,
  );
  const ids = [...new Set([params.session, ...planned.slice(0, PLANNED).map((s) => s.id)])];
  const sessions = (
    await Promise.all(
      ids
        .filter((id): id is string => !!id)
        .map((id) =>
          serverApi<Session>(`/outreach/sessions/${id}`).catch((err: unknown) => {
            if (err instanceof ApiRequestError && err.status === 404) return null;
            throw err;
          }),
        ),
    )
  ).filter(
    (s): s is Session =>
      !!s && s.status !== 'CANCELLED' && s.heldOn <= churchToday(me.church?.timezone),
  );

  const teams: TeamChoice[] = sessions.flatMap((s) =>
    s.teams.map((t) => ({
      id: t.id,
      sessionId: s.id,
      label: `${t.area} · ${shortDay(s.heldOn)}`,
      area: t.area,
      people: t.people.map((p) => p.name),
    })),
  );
  const [team, areas] = await Promise.all([
    can(me, 'outreach.team.read') ? serverApi<Team>('/outreach/team') : null,
    can(me, 'outreach.sessions.read') ? serverApi<string[]>('/outreach/areas') : [],
  ]);

  return (
    <>
      <Link href="/outreach/reached" className="text-[12px] text-fg2 hover:text-fg">
        ← Reached
      </Link>
      <div className="mt-2">
        <PageHeader
          title="Record someone"
          subtitle="Their name and number, and whether the church may text them."
        />
      </div>
      <RecordForm
        teams={teams}
        defaultTeamId={teams.some((t) => t.id === params.team) ? params.team! : null}
        people={
          team?.people.map((p) => ({
            personId: p.personId,
            name: p.name,
            phoneTail: p.phoneTail,
          })) ?? []
        }
        areas={areas}
      />
    </>
  );
}

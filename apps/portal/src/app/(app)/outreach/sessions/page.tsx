import type { Metadata } from 'next';
import Link from 'next/link';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { EmptyState, ForbiddenState } from '@/components/shell/States';
import { Badge } from '@/components/ui/Badge';
import { SessionDrawer } from '@/modules/outreach/SessionControls';
import { STATUS_LABEL, longDay, type SessionRow } from '@/modules/outreach/types';

export const metadata: Metadata = { title: 'Saturdays' };

/** Every Saturday, newest first: where the teams went and how many they reached. */
export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; from?: string; to?: string }>;
}) {
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'outreach.sessions.read')) return <ForbiddenState what="the Saturdays" />;
  const params = await searchParams;
  const query = new URLSearchParams(
    Object.entries(params).filter((e): e is [string, string] => typeof e[1] === 'string'),
  );
  const sessions = await serverApi<SessionRow[]>(`/outreach/sessions?${query}`);
  const filtered = query.size > 0;

  return (
    <>
      <PageHeader
        title="Saturdays"
        subtitle="Each Saturday's teams, the areas they went to, and who they reached."
        actions={can(me, 'outreach.sessions.manage') ? <SessionDrawer /> : undefined}
      />
      {filtered && (
        <p className="mb-3 text-[12.5px] text-fg2">
          {[
            params.status && STATUS_LABEL[params.status as keyof typeof STATUS_LABEL],
            params.from && `from ${longDay(params.from)}`,
            params.to && `to ${longDay(params.to)}`,
          ]
            .filter(Boolean)
            .join(' ')}{' '}
          ·{' '}
          <Link href="/outreach/sessions" className="text-accent underline">
            Show every Saturday
          </Link>
        </p>
      )}
      {sessions.length === 0 ? (
        <EmptyState title={filtered ? 'No Saturdays in this list' : 'No Saturdays yet'}>
          {filtered ? null : 'A leader plans one, then sends a team to each area.'}
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {sessions.map((s) => (
            <li key={s.id}>
              <Link
                href={`/outreach/sessions/${s.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-border bg-surface p-3 hover:border-accent-br"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-2 text-[13px] font-medium text-fg">
                    {longDay(s.heldOn)}
                    <Badge
                      tone={
                        s.status === 'COMPLETED'
                          ? 'positive'
                          : s.status === 'CANCELLED'
                            ? 'muted'
                            : 'accent'
                      }
                    >
                      {STATUS_LABEL[s.status]}
                    </Badge>
                  </span>
                  <span className="truncate text-[12px] text-fg2">
                    {[s.title, s.areas.join(', ')].filter(Boolean).join(' · ') || 'No teams yet'}
                  </span>
                </span>
                <span className="text-[12px] tabular-nums text-fg2">
                  {s.reached} reached
                  {s.spokenToOnly > 0 && ` · ${s.spokenToOnly} spoken to`}
                  {s.saved > 0 && ` · ${s.saved} saved`} · {s.people} out
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

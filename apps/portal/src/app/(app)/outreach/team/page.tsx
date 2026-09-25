import type { Metadata } from 'next';
import Link from 'next/link';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { EmptyState, ForbiddenState } from '@/components/shell/States';
import { Badge } from '@/components/ui/Badge';
import { Cell, Row, Table } from '@/components/ui/Table';
import { STAGE_LABEL } from '@/modules/membership/types';
import { GroupActiveButton, GroupDrawer } from '@/modules/outreach/GroupDrawer';
import { GroupHistory } from '@/modules/outreach/GroupHistory';
import type { Team } from '@/modules/outreach/types';

export const metadata: Metadata = { title: 'Team' };

/**
 * The Outreach team: the department's leaders and members, now (D28). Nobody
 * is added here. Its leaders keep the team in My departments, and this page
 * sends them there.
 */
export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'outreach.team.read')) return <ForbiddenState what="the Outreach team" />;
  const team = await serverApi<Team>('/outreach/team');
  // A team may be a hundred or two: a name narrows the list.
  const q = ((await searchParams).q ?? '').trim();
  const shown = q
    ? team.people.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
    : team.people;
  const manage = can(me, 'outreach.groups.manage');
  const active = team.groups.filter((g) => g.active);
  const off = team.groups.filter((g) => !g.active);

  return (
    <>
      <PageHeader
        title="Team"
        subtitle={`The ${team.department.name} department's leaders and members, and the partner groups they go out in.`}
        actions={
          team.youLead ? (
            <Link
              href={`/departments/${team.department.id}`}
              className="inline-flex h-9 items-center rounded-[7px] border border-border px-3.5 text-[12.5px] font-medium text-fg hover:bg-hover"
            >
              Add or remove people
            </Link>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-7">
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[14px] font-semibold text-fg">
              People <span className="font-normal text-fg3">· {team.people.length}</span>
            </h2>
            {team.people.length > 8 && (
              <form action="/outreach/team">
                <input
                  type="search"
                  name="q"
                  defaultValue={q}
                  placeholder="Find someone"
                  aria-label="Find someone on the team"
                  className="h-9 w-56 rounded-[7px] border border-border bg-input px-3 text-[13px] text-fg placeholder:text-fg3"
                />
              </form>
            )}
          </div>
          {q && shown.length === 0 ? (
            <EmptyState title={`Nobody on the team called “${q}”`} />
          ) : team.people.length === 0 ? (
            <EmptyState title="Nobody on the team yet">
              The department&apos;s leaders add people in My departments → {team.department.name}.
            </EmptyState>
          ) : (
            <Table head={['Name', 'Partner group', 'Saturdays', 'Training']}>
              {shown.map((p) => (
                <Row key={p.personId}>
                  <Cell>
                    <span className="flex flex-col">
                      <span className="flex items-center gap-2 font-medium text-fg">
                        {p.name}
                        {p.title && <Badge tone="accent">{p.title}</Badge>}
                      </span>
                      <span className="text-[11.5px] text-fg3">
                        {[STAGE_LABEL[p.stage], p.phoneTail && `phone ${p.phoneTail}`]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                  </Cell>
                  <Cell nowrap>
                    <span className={p.group ? 'text-fg2' : 'text-fg3'}>{p.group ?? '—'}</span>
                  </Cell>
                  <Cell nowrap>
                    <span className="tabular-nums text-fg2" title="In the last three months">
                      {p.saturdays}
                    </span>
                  </Cell>
                  <Cell nowrap>
                    <span className="tabular-nums text-fg2" title="Over the last twelve trainings">
                      {p.training.of ? `${p.training.attended} of ${p.training.of}` : '—'}
                    </span>
                  </Cell>
                </Row>
              ))}
            </Table>
          )}
          <p className="text-[11.5px] text-fg3">
            Saturdays out are counted over the last three months; training over the last twelve.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[14px] font-semibold text-fg">
              Partner groups <span className="font-normal text-fg3">· {active.length}</span>
            </h2>
            {manage && team.people.length >= 2 && <GroupDrawer team={team.people} />}
          </div>
          {active.length === 0 ? (
            <EmptyState title="No partner groups yet">
              Two or three who usually go out together. A Saturday&apos;s teams start from them.
            </EmptyState>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {active.map((g) => (
                <li
                  key={g.id}
                  className="flex items-start justify-between gap-2 rounded-[10px] border border-border bg-surface p-3"
                >
                  <span className="flex flex-col">
                    <span className="text-[13px] font-medium text-fg">{g.name}</span>
                    <span className="text-[12px] text-fg2">
                      {g.people.map((p) => p.name).join(', ')}
                    </span>
                    <GroupHistory group={g} />
                  </span>
                  {manage && (
                    <span className="flex flex-none items-center">
                      <GroupDrawer team={team.people} group={g} />
                      <GroupActiveButton group={g} />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {off.length > 0 && (
            <details className="text-[12.5px]">
              <summary className="cursor-pointer text-fg2">
                Switched off <span className="text-fg3">· {off.length}</span>
              </summary>
              <ul className="mt-2 flex flex-col gap-1.5">
                {off.map((g) => (
                  <li key={g.id} className="flex items-center gap-2 text-fg3">
                    <span className="flex flex-col">
                      {g.name}
                      <GroupHistory group={g} />
                    </span>
                    {manage && <GroupActiveButton group={g} />}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      </div>
    </>
  );
}

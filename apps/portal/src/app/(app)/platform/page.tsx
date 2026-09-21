import type { Metadata } from 'next';
import Link from 'next/link';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { ForbiddenState } from '@/components/shell/States';
import { Badge } from '@/components/ui/Badge';
import { Table, Row, Cell } from '@/components/ui/Table';
import { Sparkline } from '@/modules/platform/components/Charts';
import { ago, bytes, number, type ChurchRow } from '@/modules/platform/types';
import { NewChurchButton } from './NewChurchButton';
import { WindowPicker } from './WindowPicker';

export const metadata: Metadata = { title: 'Churches' };

/** 7, 30 or 90 days of numbers behind every church. */
const WINDOWS = [7, 30, 90];

export default async function ChurchesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'platform.churches.read')) return <ForbiddenState what="the dev console" />;

  const params = await searchParams;
  const days = WINDOWS.includes(Number(params.days)) ? Number(params.days) : 7;
  const churches = await serverApi<ChurchRow[]>(`/platform/churches?days=${days}`);

  const total = (pick: (c: ChurchRow) => number) => churches.reduce((sum, c) => sum + pick(c), 0);

  return (
    <>
      <PageHeader
        title="Churches"
        subtitle={`Every church on the platform, with what it used over the last ${days} days.`}
        actions={
          <>
            <WindowPicker days={days} windows={WINDOWS} />
            {can(me, 'platform.churches.manage') && <NewChurchButton />}
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="Churches" value={number(churches.length)} />
        <Figure label="Staff signing in" value={number(total((c) => c.activeUsers))} />
        <Figure label="Requests" value={number(total((c) => c.requests))} />
        <Figure label="Data stored" value={bytes(total((c) => c.dbBytes))} />
      </div>

      <Table head={['Church', 'People', 'Requests', 'Errors', 'Emails', 'Data', 'Last active', '']}>
        {churches.map((church) => (
          <Row key={church.id}>
            <Cell>
              <Link href={`/platform/churches/${church.id}`} className="flex flex-col">
                <span className="font-medium text-fg">{church.name}</span>
                <span className="text-[11.5px] text-fg3">
                  {church.code} · {church.portals} portal{church.portals === 1 ? '' : 's'}
                </span>
              </Link>
            </Cell>
            <Cell nowrap>
              <span className="text-fg2">{number(church.people.active)}</span>
              {church.people.invited > 0 && (
                <span className="text-fg3"> +{church.people.invited} invited</span>
              )}
            </Cell>
            <Cell nowrap>
              <span className="flex items-center gap-2">
                <span className="tabular-nums text-fg2">{number(church.requests)}</span>
                <Sparkline points={church.requestsByDay} />
              </span>
            </Cell>
            <Cell nowrap>
              <span className={church.errors ? 'font-medium text-danger' : 'text-fg3'}>
                {number(church.errors)}
              </span>
            </Cell>
            <Cell nowrap>
              <span className="text-fg2">{number(church.emails)}</span>
            </Cell>
            <Cell nowrap>
              <span className="text-fg2">{bytes(church.dbBytes)}</span>
              <span className="text-fg3"> · {church.dbSharePct.toFixed(1)}%</span>
            </Cell>
            <Cell nowrap>
              <span className="text-fg2">{ago(church.lastActiveAt)}</span>
            </Cell>
            <Cell nowrap>
              {church.status === 'SUSPENDED' && <Badge tone="danger">Paused</Badge>}
            </Cell>
          </Row>
        ))}
      </Table>
    </>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-border bg-surface p-3.5">
      <p className="text-[11px] font-semibold tracking-wide text-fg3 uppercase">{label}</p>
      <p className="mt-1 text-[19px] font-semibold text-fg tabular-nums">{value}</p>
    </div>
  );
}

import type { Metadata } from 'next';
import { serverApi } from '@/lib/api/server';
import { Badge } from '@/components/ui/Badge';
import { Table, Row, Cell } from '@/components/ui/Table';
import { LineChart } from '@/modules/platform/components/Charts';
import { ago, bytes, number, type ChurchDetail, type Series } from '@/modules/platform/types';

export const metadata: Metadata = { title: 'Church' };

/** The figures a dev looks at first, and the people to call about them. */
const HEADLINE = [
  'entities.people',
  'entities.users.active',
  'entities.finance.transactions',
  'db.bytes.total',
];
const TREND = ['api.requests', 'auth.logins', 'api.errors.5xx'];
const TREND_LABELS: Record<string, string> = {
  'api.requests': 'Requests',
  'auth.logins': 'Sign-ins',
  'api.errors.5xx': 'Failures',
};

export default async function OverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const from = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
  const [church, headline, trend] = await Promise.all([
    serverApi<ChurchDetail>(`/platform/churches/${id}`),
    serverApi<Series[]>(
      `/platform/churches/${id}/usage?metrics=${HEADLINE.join(',')}&from=${from}`,
    ),
    serverApi<Series[]>(`/platform/churches/${id}/usage?metrics=${TREND.join(',')}&from=${from}`),
  ]);
  const latest = (metric: string) =>
    headline.find((s) => s.metric === metric)?.points.at(-1)?.value ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="People" value={number(latest('entities.people'))} />
        <Figure label="Staff" value={number(latest('entities.users.active'))} />
        <Figure label="Finance entries" value={number(latest('entities.finance.transactions'))} />
        <Figure label="Data stored" value={bytes(latest('db.bytes.total'))} />
      </div>

      <section className="rounded-[10px] border border-border bg-surface p-4">
        <h2 className="mb-3 text-[13px] font-semibold text-fg">The last 30 days</h2>
        <LineChart series={trend} labels={TREND_LABELS} />
      </section>

      <section>
        <h2 className="mb-2 text-[13px] font-semibold text-fg">Who runs it</h2>
        <Table head={['Administrator', 'Email', '']}>
          {church.admins.map((admin) => (
            <Row key={admin.id}>
              <Cell>
                <span className="font-medium text-fg">{admin.fullName}</span>
              </Cell>
              <Cell>
                <span className="text-fg2">{admin.email}</span>
              </Cell>
              <Cell nowrap>
                {admin.status === 'INVITED' && <Badge tone="accent">Invited</Badge>}
              </Cell>
            </Row>
          ))}
        </Table>
        <p className="mt-2 text-[11.5px] text-fg3">
          Set up {ago(church.createdAt)}.
          {church.codeLocked
            ? ` Its code ${church.code} is on finance references now, so it cannot change.`
            : ' It has no finance entries yet, so its code could still change.'}
        </p>
      </section>
    </div>
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

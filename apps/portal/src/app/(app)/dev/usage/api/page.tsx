import type { Metadata } from 'next';
import { serverApi } from '@/lib/api/server';
import { Table, Row, Cell } from '@/components/ui/Table';
import { LineChart } from '@/modules/dev/components/Charts';
import { Figure, Panel } from '@/modules/dev/components/Figure';
import { daysAgo, number, total, type RouteUse, type Series } from '@/modules/dev/types';
import { WindowPicker } from '../../WindowPicker';

export const metadata: Metadata = { title: 'API' };

/** Below this many calls an average is one unlucky request, not a slow route. */
const ENOUGH_CALLS = 20;

export default async function ApiPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const asked = Number((await searchParams).days);
  const days = [7, 30, 90].includes(asked) ? asked : 30;
  const [routes, series] = await Promise.all([
    serverApi<RouteUse[]>(`/dev/usage/routes?days=${days}`),
    serverApi<Series[]>(
      `/dev/usage?metrics=api.requests,api.latency_ms.sum,api.latency_ms.max,api.errors.4xx,api.errors.403,api.errors.5xx,api.throttled&from=${daysAgo(days - 1)}`,
    ),
  ]);
  const requests = total(series, 'api.requests');
  const average = requests ? Math.round(total(series, 'api.latency_ms.sum') / requests) : 0;
  const slowest = Math.max(
    0,
    ...(series.find((s) => s.metric === 'api.latency_ms.max')?.points.map((p) => p.value) ?? []),
  );
  const slow = routes
    .filter((r) => r.averageMs !== null && r.calls >= ENOUGH_CALLS)
    .sort((a, b) => b.averageMs! - a.averageMs!)
    .slice(0, 10);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <WindowPicker days={days} windows={[7, 30, 90]} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="Requests" value={number(requests)} note={`in ${days} days`} />
        <Figure label="Average answer" value={`${number(average)} ms`} />
        <Figure label="Slowest answer" value={`${number(slowest)} ms`} />
        <Figure
          label="Slowed for going too fast"
          value={number(total(series, 'api.throttled'))}
          note="the rate limits, doing their job"
        />
      </div>

      <Panel title="Refused and failed, by day">
        <LineChart
          series={series.filter((s) =>
            ['api.errors.4xx', 'api.errors.403', 'api.errors.5xx'].includes(s.metric),
          )}
          labels={{
            'api.errors.4xx': 'Refused (other 4xx)',
            'api.errors.403': 'Not allowed (403)',
            'api.errors.5xx': 'Failed (5xx)',
          }}
        />
      </Panel>

      <div className="grid gap-5 xl:grid-cols-2">
        <section>
          <h2 className="mb-2 text-[13px] font-semibold text-fg">Busiest routes</h2>
          <RouteTable routes={routes.slice(0, 15)} />
        </section>
        <section>
          <h2 className="mb-2 text-[13px] font-semibold text-fg">Slowest routes</h2>
          <RouteTable routes={slow} />
          <p className="mt-2 text-[11.5px] text-fg3">
            Routes called at least {ENOUGH_CALLS} times, so one slow request cannot top the list.
          </p>
        </section>
      </div>
    </div>
  );
}

function RouteTable({ routes }: { routes: RouteUse[] }) {
  if (!routes.length) return <p className="text-[12.5px] text-fg3">Nothing counted yet.</p>;
  return (
    <Table head={['Route', 'Calls', 'Average']}>
      {routes.map((r) => (
        <Row key={r.route}>
          <Cell>
            <code className="font-mono text-[11.5px] text-fg">{r.route}</code>
          </Cell>
          <Cell nowrap>
            <span className="tabular-nums text-fg2">{number(r.calls)}</span>
          </Cell>
          <Cell nowrap>
            <span className="tabular-nums text-fg2">
              {r.averageMs === null ? '—' : `${number(r.averageMs)} ms`}
            </span>
          </Cell>
        </Row>
      ))}
    </Table>
  );
}

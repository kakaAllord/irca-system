import type { Metadata } from 'next';
import { USAGE_METRICS, metricDef } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { LineChart } from '@/modules/dev/components/Charts';
import { Figure, Panel } from '@/modules/dev/components/Figure';
import { bytes, daysAgo, number, type Series } from '@/modules/dev/types';
import { MetricPicker } from './MetricPicker';

export const metadata: Metadata = { title: 'Every number' };

/**
 * Every metric the system keeps, any four at a time. The per-table, per-portal
 * and per-route families have their own tabs; everything else is here.
 */
const CHARTABLE = USAGE_METRICS.filter((m) => !m.key.endsWith('*'));
const DEFAULT = ['api.requests', 'auth.logins', 'email.sent'];

export default async function EveryNumberPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  const days = Math.min(Math.max(Number(query.days) || 30, 7), 365);
  const chosen = (query.metrics?.split(',').filter(Boolean) ?? DEFAULT).filter((key) =>
    CHARTABLE.some((m) => m.key === key),
  );
  const metrics = chosen.length ? chosen : DEFAULT;
  const series = await serverApi<Series[]>(
    `/dev/usage?metrics=${metrics.join(',')}&from=${daysAgo(days - 1)}`,
  );
  const labels = Object.fromEntries(metrics.map((key) => [key, metricDef(key)?.label ?? key]));
  const show = (key: string, value: number) =>
    metricDef(key)?.unit === 'bytes' ? bytes(value) : number(value);

  return (
    <div className="flex flex-col gap-4">
      <MetricPicker metrics={CHARTABLE} chosen={metrics} days={days} />

      <Panel title={`The last ${days} days`}>
        <LineChart series={series} labels={labels} height={200} />
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {series.map((s) => {
          const def = metricDef(s.metric);
          const values = s.points.map((p) => p.value);
          const counter = def?.type === 'counter';
          return (
            <Figure
              key={s.metric}
              label={def?.label ?? s.metric}
              value={show(
                s.metric,
                counter ? values.reduce((a, b) => a + b, 0) : (values.at(-1) ?? 0),
              )}
              note={
                counter ? `in ${days} days` : `now; highest ${show(s.metric, Math.max(...values))}`
              }
            />
          );
        })}
      </div>
    </div>
  );
}

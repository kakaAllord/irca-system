import type { Metadata } from 'next';
import { USAGE_METRICS, metricDef } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { LineChart } from '@/modules/platform/components/Charts';
import { bytes, number, type Series } from '@/modules/platform/types';
import { MetricPicker } from './MetricPicker';

export const metadata: Metadata = { title: 'Usage' };

/** Everything that can be charted: the catalogue, minus the per-table tails. */
const CHARTABLE = USAGE_METRICS.filter((m) => !m.key.endsWith('*') && !m.platform);
const DEFAULT = ['api.requests', 'auth.logins', 'email.sent'];

export default async function UsagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const days = Math.min(Math.max(Number(query.days) || 30, 7), 365);
  const chosen = (query.metrics?.split(',').filter(Boolean) ?? DEFAULT).filter((key) =>
    CHARTABLE.some((m) => m.key === key),
  );
  const metrics = chosen.length ? chosen : DEFAULT;
  const from = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const series = await serverApi<Series[]>(
    `/platform/churches/${id}/usage?metrics=${metrics.join(',')}&from=${from}`,
  );

  const labels = Object.fromEntries(
    metrics.map((key) => [key, metricDef(key)?.label ?? key]),
  ) as Record<string, string>;

  return (
    <div className="flex flex-col gap-4">
      <MetricPicker metrics={CHARTABLE} chosen={metrics} days={days} />

      <section className="rounded-[10px] border border-border bg-surface p-4">
        <LineChart series={series} labels={labels} height={200} />
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {series.map((s) => {
          const def = metricDef(s.metric);
          const values = s.points.map((p) => p.value);
          const last = values.at(-1) ?? 0;
          const totalOrPeak =
            def?.type === 'counter' ? values.reduce((a, b) => a + b, 0) : Math.max(...values);
          return (
            <div key={s.metric} className="rounded-[10px] border border-border bg-surface p-3.5">
              <p className="text-[11px] font-semibold tracking-wide text-fg3 uppercase">
                {def?.label ?? s.metric}
              </p>
              <p className="mt-1 text-[17px] font-semibold text-fg tabular-nums">
                {def?.unit === 'bytes' ? bytes(last) : number(last)}
                <span className="ml-1.5 text-[11.5px] font-normal text-fg3">
                  {def?.type === 'counter' ? 'that day' : 'now'}
                </span>
              </p>
              <p className="mt-0.5 text-[11.5px] text-fg3">
                {def?.type === 'counter' ? 'Total' : 'Highest'} over {days} days:{' '}
                {def?.unit === 'bytes' ? bytes(totalOrPeak) : number(totalOrPeak)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

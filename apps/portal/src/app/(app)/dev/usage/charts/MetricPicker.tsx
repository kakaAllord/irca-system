'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { MetricDef } from '@irca/shared';
import { Select } from '@/components/ui/Select';
import { cn } from '@/lib/cn';

const DAYS = [7, 30, 90, 365];

/** Which numbers to draw, grouped the way the catalogue groups them. */
export function MetricPicker({
  metrics,
  chosen,
  days,
}: {
  metrics: MetricDef[];
  chosen: string[];
  days: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const areas = [...new Set(metrics.map((m) => m.area))];

  function go(next: URLSearchParams) {
    router.push(`?${next}`);
  }
  function toggle(key: string) {
    const next = new URLSearchParams(params);
    // At most four lines on one chart stays readable.
    const picked = chosen.includes(key)
      ? chosen.filter((k) => k !== key)
      : [...chosen, key].slice(-4);
    if (picked.length) next.set('metrics', picked.join(','));
    else next.delete('metrics');
    go(next);
  }

  return (
    <div className="flex flex-col gap-3 rounded-[10px] border border-border bg-surface p-3.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] font-medium text-fg2">Pick up to four to compare</p>
        <Select
          inline
          label="Period"
          value={String(days)}
          options={DAYS.map((d) => ({ value: String(d), label: `Last ${d} days` }))}
          onChange={(e) => {
            const next = new URLSearchParams(params);
            next.set('days', e.target.value);
            go(next);
          }}
        />
      </div>
      {areas.map((area) => (
        <div key={area} className="flex flex-wrap items-center gap-1.5">
          <span className="w-28 flex-none text-[11px] font-semibold tracking-wide text-fg3 uppercase">
            {area}
          </span>
          {metrics
            .filter((m) => m.area === area)
            .map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => toggle(m.key)}
                aria-pressed={chosen.includes(m.key)}
                title={m.key}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[11.5px]',
                  chosen.includes(m.key)
                    ? 'border-accent bg-accent text-accent-ink'
                    : 'border-border text-fg2 hover:bg-hover',
                )}
              >
                {m.label}
              </button>
            ))}
        </div>
      ))}
    </div>
  );
}

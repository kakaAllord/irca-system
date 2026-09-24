/**
 * Three small charts, drawn as SVG.
 *
 * A dozen churches and ninety days of numbers do not need a charting
 * library; they need a line, a bar and a sparkline that read at a glance and
 * say their numbers in text for anyone who cannot see them.
 */

export type Point = { day: string; value: number };

export function Sparkline({
  points,
  width = 110,
  height = 22,
}: {
  points: Point[];
  width?: number;
  height?: number;
}) {
  if (points.length < 2) return <span className="text-[11px] text-fg3">—</span>;
  const max = Math.max(1, ...points.map((p) => p.value));
  const step = width / (points.length - 1);
  const d = points
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(1)} ${(height - (p.value / max) * height).toFixed(1)}`,
    )
    .join(' ');
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${points.at(-1)!.value} on the last day`}
    >
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent" />
    </svg>
  );
}

/** One or more series over days, with a legend and a table for screen readers. */
export function LineChart({
  series,
  height = 160,
  labels,
}: {
  series: { metric: string; points: Point[] }[];
  height?: number;
  labels?: Record<string, string>;
}) {
  const points = series[0]?.points ?? [];
  if (points.length < 2) return <p className="text-[12.5px] text-fg3">Not enough days yet.</p>;
  const max = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.value)));
  const width = 600;
  const step = width / (points.length - 1);
  const colours = ['text-accent', 'text-pos', 'text-danger', 'text-fg3'];

  return (
    <figure className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label="Usage over time"
      >
        {series.map((s, i) => (
          <path
            key={s.metric}
            d={s.points
              .map(
                (p, n) =>
                  `${n === 0 ? 'M' : 'L'} ${(n * step).toFixed(1)} ${(height - (p.value / max) * (height - 8)).toFixed(1)}`,
              )
              .join(' ')}
            fill="none"
            strokeWidth="1.8"
            stroke="currentColor"
            className={colours[i % colours.length]}
          />
        ))}
      </svg>
      <figcaption className="flex flex-wrap gap-3 text-[11.5px] text-fg3">
        {series.map((s, i) => (
          <span key={s.metric} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={`inline-block h-0.5 w-4 bg-current ${colours[i % colours.length]}`}
            />
            {labels?.[s.metric] ?? s.metric}: {s.points.at(-1)!.value.toLocaleString('en-GB')} on{' '}
            {points.at(-1)!.day}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

/** A row of bars, biggest first, with the number beside each. */
export function BarList({ rows }: { rows: { label: string; value: number; hint?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="text-[12.5px] text-fg3">Nothing yet.</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center gap-2 text-[12.5px]">
          <span className="w-52 truncate text-fg2" title={r.label}>
            {r.label}
          </span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-chip" aria-hidden="true">
            <span
              className="block h-full rounded-full bg-accent"
              style={{ width: `${Math.max((r.value / max) * 100, 2)}%` }}
            />
          </span>
          <span className="w-28 text-right tabular-nums text-fg">
            {r.hint ?? r.value.toLocaleString('en-GB')}
          </span>
        </li>
      ))}
    </ul>
  );
}

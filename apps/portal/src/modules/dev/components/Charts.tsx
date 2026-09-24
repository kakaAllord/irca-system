/**
 * Three small charts, drawn as SVG.
 *
 * Ninety days of one church's numbers do not need a charting library; they
 * need a line, a bar and a sparkline that read at a glance and say their
 * numbers in text for anyone who cannot see them.
 */

/** Series colours, in order, never cycled past four (globals.css says why). */
const SERIES = ['text-series-1', 'text-series-2', 'text-series-3', 'text-series-4'];

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
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-series-1" />
    </svg>
  );
}

/**
 * Up to four series over days, on one scale. The legend names each with its
 * last value, pointing at a day shows every value that day, and the same
 * numbers are one click away as a table.
 */
export function LineChart({
  series: all,
  height = 160,
  labels,
}: {
  series: { metric: string; points: Point[] }[];
  height?: number;
  labels?: Record<string, string>;
}) {
  const series = all.slice(0, SERIES.length);
  const points = series[0]?.points ?? [];
  if (points.length < 2) return <p className="text-[12.5px] text-fg3">Not enough days yet.</p>;
  const max = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.value)));
  const width = 600;
  const step = width / (points.length - 1);
  const y = (value: number) => height - (value / max) * (height - 8);
  const name = (metric: string) => labels?.[metric] ?? metric;
  const format = (value: number) => value.toLocaleString('en-GB');

  return (
    <figure className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label={`${series.map((s) => name(s.metric)).join(', ')}, by day`}
      >
        <line x1="0" x2={width} y1={height - 0.5} y2={height - 0.5} className="stroke-border" />
        {series.map((s, i) => (
          <path
            key={s.metric}
            d={s.points
              .map(
                (p, n) =>
                  `${n === 0 ? 'M' : 'L'} ${(n * step).toFixed(1)} ${y(p.value).toFixed(1)}`,
              )
              .join(' ')}
            fill="none"
            strokeWidth="2"
            strokeLinejoin="round"
            stroke="currentColor"
            className={SERIES[i]}
          />
        ))}
        {/* One band per day, wider than the line, so pointing anywhere near a
            day reads it; the browser shows the title as the tooltip. */}
        {points.map((p, n) => (
          <rect
            key={p.day}
            x={Math.max(0, n * step - step / 2)}
            width={step}
            y="0"
            height={height}
            className="fill-transparent hover:fill-hover"
          >
            <title>
              {[
                p.day,
                ...series.map((s) => `${name(s.metric)}: ${format(s.points[n]?.value ?? 0)}`),
              ].join('\n')}
            </title>
          </rect>
        ))}
      </svg>
      <figcaption className="flex flex-wrap gap-3 text-[11.5px] text-fg3">
        {series.map((s, i) => (
          <span key={s.metric} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`inline-block h-0.5 w-4 bg-current ${SERIES[i]}`} />
            <span className="text-fg2">{name(s.metric)}</span> {format(s.points.at(-1)!.value)} on{' '}
            {points.at(-1)!.day}
          </span>
        ))}
      </figcaption>
      <details className="text-[11.5px] text-fg3">
        <summary className="w-fit cursor-pointer hover:text-fg2">Show as a table</summary>
        <div className="mt-2 max-h-64 overflow-auto rounded-[8px] border border-border">
          <table className="w-full text-left tabular-nums">
            <thead className="sticky top-0 bg-thead">
              <tr>
                <th scope="col" className="px-2 py-1.5 font-semibold">
                  Day
                </th>
                {series.map((s) => (
                  <th key={s.metric} scope="col" className="px-2 py-1.5 text-right font-semibold">
                    {name(s.metric)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => {
                const n = points.indexOf(p);
                return (
                  <tr key={p.day} className="border-t border-border2 text-fg2">
                    <td className="px-2 py-1">{p.day}</td>
                    {series.map((s) => (
                      <td key={s.metric} className="px-2 py-1 text-right">
                        {format(s.points[n]?.value ?? 0)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
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
              className="block h-full rounded-full bg-series-1"
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

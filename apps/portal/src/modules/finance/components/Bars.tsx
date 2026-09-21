import { formatMoney } from '@irca/shared';

/**
 * A share of a total as a bar. CSS, not a charting library: three numbers and
 * a rectangle each do not need 40kB of JavaScript.
 */
export function Bars({
  rows,
  currency,
}: {
  rows: { id: string; name: string; total: string; share: number }[];
  currency: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-[10px] border border-dashed border-border p-4 text-[12.5px] text-fg3">
        Nothing recorded this month.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2 rounded-[10px] border border-border bg-surface p-3.5">
      {rows.map((row) => (
        <li key={row.id} className="flex items-center gap-3 text-[12.5px]">
          <span className="w-32 shrink-0 truncate text-fg2">{row.name}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-chip" aria-hidden="true">
            <span
              className="block h-full rounded-full bg-neutral-bar"
              style={{ width: `${Math.max(row.share, 2)}%` }}
            />
          </span>
          <span className="w-28 shrink-0 text-right tabular-nums text-fg">
            {formatMoney(row.total, currency)}
          </span>
          <span className="w-9 shrink-0 text-right text-fg3">{row.share}%</span>
        </li>
      ))}
    </ul>
  );
}

'use client';

import { useState } from 'react';
import type { ActivityRow } from './page';

/** Only the fields that actually changed, old struck through. */
function Diff({ before, after }: { before: unknown; after: unknown }) {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter(
    (k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]),
  );
  if (!keys.length) return <p className="text-[11.5px] text-fg3">No details were recorded.</p>;

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11.5px]">
      {keys.map((key) => (
        <div key={key} className="contents">
          <dt className="text-fg3">{key}</dt>
          <dd className="text-fg">
            {key in b && <span className="text-fg3 line-through">{format(b[key])}</span>}{' '}
            {key in a && <span>{format(a[key])}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const format = (value: unknown) =>
  value === null || value === undefined
    ? '—'
    : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value);

export function ActivityList({ rows, timezone }: { rows: ActivityRow[]; timezone: string }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <ul className="flex flex-col divide-y divide-border2 rounded-[10px] border border-border bg-surface">
      {rows.map((row) => (
        <li key={row.id}>
          <button
            type="button"
            onClick={() => setOpen((id) => (id === row.id ? null : row.id))}
            aria-expanded={open === row.id}
            className="flex w-full flex-wrap items-baseline gap-x-2 gap-y-0.5 px-4 py-2.5 text-left hover:bg-hover"
          >
            <span className="w-[130px] shrink-0 text-[11.5px] text-fg3">
              {new Date(row.at).toLocaleString('en-GB', {
                timeZone: timezone,
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            <span className="text-[12.5px] font-medium text-fg">{row.who}</span>
            <span className="text-[12.5px] text-fg2">{row.summary ?? row.action}</span>
          </button>
          {open === row.id && (
            <div className="border-t border-border2 bg-surface2 px-4 py-3">
              <Diff before={row.before} after={row.after} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

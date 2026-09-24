import type { ReactNode } from 'react';

/**
 * One number and what it is, for the top of a page. A number that is a
 * warning says so in words beside it, not in colour alone.
 */
export function Figure({
  label,
  value,
  note,
  tone = 'fine',
}: {
  label: string;
  value: string;
  note?: ReactNode;
  tone?: 'fine' | 'bad';
}) {
  return (
    <div className="rounded-[10px] border border-border bg-surface p-3.5">
      <p className="text-[11px] font-semibold tracking-wide text-fg3 uppercase">{label}</p>
      <p
        className={`mt-1 text-[19px] font-semibold tabular-nums ${tone === 'bad' ? 'text-danger' : 'text-fg'}`}
      >
        {value}
      </p>
      {note && <p className="mt-0.5 text-[11.5px] text-fg3">{note}</p>}
    </div>
  );
}

/** A titled box around a chart or a list. */
export function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[10px] border border-border bg-surface p-4">
      <h2 className="text-[13px] font-semibold text-fg">{title}</h2>
      {note && <p className="mt-0.5 text-[11.5px] text-fg3">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

'use client';

import { cn } from '@/lib/cn';

export type AttendanceMark = 'ATTENDED' | 'MISSED';

const GLYPH = { ATTENDED: '✓', MISSED: '✕' } as const;

/** Attended, missed, not yet: the order a tap moves through, so a wrong tap is one more to undo. */
export const nextMark = (now: AttendanceMark | null): AttendanceMark | null =>
  now === null ? 'ATTENDED' : now === 'ATTENDED' ? 'MISSED' : null;

/**
 * One box on a register: a tick for attended, a cross for missed, empty for
 * not yet. The foundation class and Outreach's training both mark with it, so
 * nobody learns it twice.
 */
export function MarkButton({
  mark,
  label,
  disabled,
  empty = 'not yet marked',
  onClick,
}: {
  mark: AttendanceMark | null;
  /** Who and what, for a screen reader: "Grace, session 3". */
  label: string;
  disabled?: boolean;
  /** What an empty box means here, for a screen reader: "not yet held". */
  empty?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={`${label}: ${mark === 'ATTENDED' ? 'attended' : mark === 'MISSED' ? 'missed' : empty}`}
      className={cn(
        'size-7 rounded-[6px] border text-[12px]',
        mark === 'ATTENDED' && 'border-pos-br bg-pos-bg text-pos',
        mark === 'MISSED' && 'border-danger-br bg-danger-bg text-danger',
        !mark && 'border-dashed border-border text-fg3',
      )}
    >
      {mark ? GLYPH[mark] : ''}
    </button>
  );
}

/** The key under a register. */
export function MarkLegend({ empty = 'Not yet held' }: { empty?: string }) {
  return (
    <p className="mt-3 flex gap-4 text-[11.5px] text-fg3">
      <span>
        <span className="text-pos">✓</span> Attended
      </span>
      <span>
        <span className="text-danger">✕</span> Missed
      </span>
      <span>▢ {empty}</span>
    </p>
  );
}

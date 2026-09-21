import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'info' | 'error' | 'warn';

const TONES: Record<Tone, string> = {
  info: 'border-border bg-surface2 text-fg2',
  error: 'border-danger-br bg-danger-bg text-danger',
  warn: 'border-warn-br bg-warn-bg text-warn-fg',
};

/** Errors are announced as they appear (role="alert"); other tones are polite. */
export function Alert({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('rounded-[8px] border px-3 py-2.5 text-[12.5px] leading-snug', TONES[tone])}
    >
      {children}
    </div>
  );
}

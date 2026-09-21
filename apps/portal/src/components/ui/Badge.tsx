import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'accent' | 'positive' | 'danger' | 'muted';

const TONES: Record<Tone, string> = {
  neutral: 'border-border text-fg2',
  accent: 'border-accent-br text-accent',
  positive: 'border-pos-br bg-pos-bg text-pos',
  danger: 'border-danger-br bg-danger-bg text-danger',
  muted: 'border-border text-fg3',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-semibold whitespace-nowrap',
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

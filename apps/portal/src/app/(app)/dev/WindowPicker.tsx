'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Select } from '@/components/ui/Select';

/** How many days of numbers the page adds up. */
export function WindowPicker({ days, windows }: { days: number; windows: number[] }) {
  const router = useRouter();
  const params = useSearchParams();

  return (
    <Select
      inline
      label="Period"
      value={String(days)}
      options={windows.map((d) => ({ value: String(d), label: `Last ${d} days` }))}
      onChange={(e) => {
        const next = new URLSearchParams(params);
        next.set('days', e.target.value);
        router.push(`?${next}`);
      }}
    />
  );
}

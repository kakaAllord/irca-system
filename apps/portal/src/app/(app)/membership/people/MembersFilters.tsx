'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useLiveSearch } from '@/lib/useLiveSearch';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

const TABS = [
  ['all', 'All'],
  ['joining', 'Joining church'],
  ['salvation', 'Salvation'],
  ['baptism', 'Baptism'],
  ['volunteers', 'Volunteers'],
  ['new_converts', 'New converts'],
  ['incomplete', 'Incomplete'],
] as const;

/** The design's filters. Everything lives in the URL, and applies as you type. */
export function MembersFilters({
  counts,
  shown,
  total,
}: {
  counts: Record<string, number>;
  shown: number;
  total: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useLiveSearch('/membership/people');

  const set = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value && value !== 'any') next.set(key, value);
      else next.delete(key);
    }
    next.delete('page');
    router.replace(`/membership/people${next.size ? `?${next}` : ''}`, { scroll: false });
  };

  const value = (key: string) => params.get(key) ?? 'any';
  const tab = params.get('tab') ?? 'all';
  const filtered = [...params.keys()].some((k) => !['tab', 'page'].includes(k));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1">
          <Input
            label="Search"
            placeholder="Search name or phone…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select
          inline
          label="Salvation"
          value={value('salvation')}
          onChange={(e) => set({ salvation: e.target.value })}
          options={[
            { value: 'any', label: 'any' },
            { value: 'saved', label: 'Saved' },
            { value: 'not', label: 'Not yet' },
          ]}
        />
        <Select
          inline
          label="Baptism"
          value={value('baptism')}
          onChange={(e) => set({ baptism: e.target.value })}
          options={[
            { value: 'any', label: 'any' },
            { value: 'baptised', label: 'Baptised' },
            { value: 'not', label: 'Not yet' },
          ]}
        />
        <Select
          inline
          label="Gender"
          value={value('gender')}
          onChange={(e) => set({ gender: e.target.value })}
          options={[
            { value: 'any', label: 'any' },
            { value: 'Female', label: 'Female' },
            { value: 'Male', label: 'Male' },
          ]}
        />
        <Select
          inline
          label="Age"
          value={value('age')}
          onChange={(e) => set({ age: e.target.value })}
          options={[
            { value: 'any', label: 'any' },
            { value: 'Under 18', label: 'Under 18' },
            { value: '19–35', label: '19 – 35' },
            { value: '36–44', label: '36 – 44' },
            { value: '45+', label: '45 & above' },
          ]}
        />
        <Select
          inline
          label="Lives in"
          value={value('lives')}
          onChange={(e) => set({ lives: e.target.value })}
          options={[
            { value: 'any', label: 'anywhere' },
            { value: 'arusha', label: 'Arusha' },
            { value: 'region', label: 'Another region' },
            { value: 'country', label: 'Another country' },
          ]}
        />
        <Select
          inline
          label="Heard via"
          value={value('source')}
          onChange={(e) => set({ source: e.target.value })}
          options={[
            { value: 'any', label: 'any' },
            { value: 'A friend', label: 'A friend' },
            { value: 'Social media', label: 'Social media' },
            { value: 'Outreach', label: 'Outreach' },
            { value: 'Walked past', label: 'Walked past' },
            { value: 'Other', label: 'Another way' },
          ]}
        />
        {filtered && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.replace('/membership/people')}
          >
            Clear
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => set({ tab: key === 'all' ? '' : key })}
            aria-pressed={tab === key}
            className={cn(
              'rounded-full border px-3 py-1 text-[12px]',
              tab === key
                ? 'border-accent-br bg-chip text-fg'
                : 'border-border text-fg2 hover:bg-hover',
            )}
          >
            {label} <span className="text-fg3 tabular-nums">{counts[key] ?? 0}</span>
          </button>
        ))}
        <p className="ml-auto text-[11.5px] text-fg3">
          {shown} of {total.toLocaleString('en-GB')} shown · filtering live
        </p>
      </div>
    </div>
  );
}

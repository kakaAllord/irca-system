'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { PledgeFilter } from '@irca/shared';
import { useLiveSearch } from '@/lib/useLiveSearch';
import { cn } from '@/lib/cn';
import { Input } from '@/components/ui/Input';

const TABS: { key: PledgeFilter; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'completed', label: 'Paid in full' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'all', label: 'All' },
];

/** Filters live in the URL, as everywhere in the portal. */
export function PledgeFilters({ path, counts }: { path: string; counts: Record<string, number> }) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useLiveSearch(path);
  const current = (params.get('filter') as PledgeFilter | null) ?? 'open';

  function choose(filter: PledgeFilter) {
    const next = new URLSearchParams(params.toString());
    if (filter === 'open') next.delete('filter');
    else next.set('filter', filter);
    router.replace(`${path}${next.size ? `?${next}` : ''}`, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div role="tablist" aria-label="Which pledges" className="flex flex-wrap gap-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={current === tab.key}
            onClick={() => choose(tab.key)}
            className={cn(
              'h-8 rounded-[7px] border px-3 text-[12px] font-medium',
              current === tab.key
                ? 'border-accent-br bg-chip text-accent'
                : 'border-border text-fg2 hover:bg-hover',
            )}
          >
            {tab.label}
            {counts[tab.key] !== undefined && (
              <span className="ml-1.5 text-fg3 tabular-nums">{counts[tab.key]}</span>
            )}
          </button>
        ))}
      </div>
      <div className="min-w-[200px] flex-1">
        <Input
          label="Search"
          placeholder="Search by name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
    </div>
  );
}

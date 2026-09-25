'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Select } from '@/components/ui/Select';
import { MESSAGE_STATUS } from './types';

/** Department and status, in the address bar so a filtered list can be shared. */
export function HistoryFilters({ departments }: { departments: { id: string; name: string }[] }) {
  const router = useRouter();
  const params = useSearchParams();
  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value && value !== 'any') next.set(key, value);
    else next.delete(key);
    next.delete('page');
    router.replace(`/comms/history${next.size ? `?${next}` : ''}`, { scroll: false });
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Select
        inline
        label="Department"
        value={params.get('department') ?? 'any'}
        onChange={(e) => set('department', e.target.value)}
        options={[
          { value: 'any', label: 'All' },
          { value: 'none', label: 'Communications' },
          ...departments.map((d) => ({ value: d.id, label: d.name })),
        ]}
      />
      <Select
        inline
        label="Status"
        value={params.get('status') ?? 'any'}
        onChange={(e) => set('status', e.target.value)}
        options={[
          { value: 'any', label: 'All' },
          ...Object.entries(MESSAGE_STATUS).map(([value, s]) => ({ value, label: s.label })),
        ]}
      />
    </div>
  );
}

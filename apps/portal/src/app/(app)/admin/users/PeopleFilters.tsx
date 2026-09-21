'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';

type RoleGroup = { moduleName: string; roles: { id: string; name: string }[] };

/**
 * Filters live in the URL and apply as you type, as the owner asked for: no
 * Filter button to press, the Back button works, and a filtered list can be
 * sent to someone as a link.
 */
export function PeopleFilters({
  roleGroups,
  total,
  shown,
}: {
  roleGroups: RoleGroup[];
  total: number;
  shown: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');

  const set = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete('page');
    router.replace(`/admin/users${next.size ? `?${next}` : ''}`, { scroll: false });
  };

  // Typing filters the list without a button, but not on every keystroke.
  const current = params.toString();
  useEffect(() => {
    const id = setTimeout(() => {
      const next = new URLSearchParams(current);
      if ((next.get('q') ?? '') === q) return;
      if (q) next.set('q', q);
      else next.delete('q');
      next.delete('page');
      router.replace(`/admin/users${next.size ? `?${next}` : ''}`, { scroll: false });
    }, 250);
    return () => clearTimeout(id);
  }, [q, current, router]);

  const filtered = Boolean(params.get('q') || params.get('status') || params.get('roleId'));

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-[220px] flex-1">
        <Input
          label="Search"
          placeholder="Search name or email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <Select
        inline
        label="Status"
        value={params.get('status') ?? 'any'}
        onChange={(e) => set({ status: e.target.value === 'any' ? '' : e.target.value })}
        options={[
          { value: 'any', label: 'any' },
          { value: 'ACTIVE', label: 'Active' },
          { value: 'INVITED', label: 'Invited' },
          { value: 'DISABLED', label: 'Disabled' },
        ]}
      />
      <Select
        inline
        label="Role"
        value={params.get('roleId') ?? 'any'}
        onChange={(e) => set({ roleId: e.target.value === 'any' ? '' : e.target.value })}
        options={[
          { value: 'any', label: 'any' },
          ...roleGroups.flatMap((g) =>
            g.roles.map((r) => ({ value: r.id, label: `${g.moduleName}: ${r.name}` })),
          ),
        ]}
      />
      {filtered && (
        <Button variant="secondary" size="sm" onClick={() => router.replace('/admin/users')}>
          Clear
        </Button>
      )}
      <p className="ml-auto text-[11.5px] text-fg3">
        {shown} of {total} shown · filtering live
      </p>
    </div>
  );
}

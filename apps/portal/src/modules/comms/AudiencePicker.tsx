'use client';

import { Select } from '@/components/ui/Select';
import type { Audience, AudienceOptions } from './types';

/**
 * Who a message goes to. Communications chooses among everything — the whole
 * church, members, staff, the foundation class, one or more departments,
 * every leader or the leaders of chosen departments. A department's leader
 * sees their own department and whatever Communications gave it.
 */
export function AudiencePicker({
  options,
  departmentId,
  value,
  onChange,
}: {
  options: AudienceOptions;
  /** Set on a department's own page: its audiences are that department's. */
  departmentId: string | null;
  value: Audience | null;
  onChange: (next: Audience | null) => void;
}) {
  const key = value?.key ?? '';
  const chosen = (value?.params.departmentIds as string[] | undefined) ?? [];

  function pick(nextKey: string) {
    if (!nextKey) return onChange(null);
    if (nextKey === 'departments.everyone' || nextKey === 'departments.leaders') {
      if (departmentId)
        return onChange({ key: nextKey, params: { departmentIds: [departmentId] } });
      return onChange({
        key: nextKey,
        params: nextKey === 'departments.everyone' ? { departmentIds: [] } : {},
      });
    }
    onChange({ key: nextKey, params: {} });
  }

  function toggle(id: string, on: boolean) {
    const ids = on ? [...chosen, id] : chosen.filter((d) => d !== id);
    if (key === 'departments.leaders' && ids.length === 0) return onChange({ key, params: {} });
    onChange({ key, params: { departmentIds: ids } });
  }

  const labelOf = (a: AudienceOptions['audiences'][number]) => {
    if (!departmentId) return a.label;
    const name = options.departments[0]?.name ?? 'this department';
    if (a.key === 'departments.everyone') return `Everyone in ${name}`;
    if (a.key === 'departments.leaders') return `The leaders of ${name}`;
    return a.label;
  };

  const selected = options.audiences.find((a) => a.key === key);
  const pickDepartments =
    !departmentId && (key === 'departments.everyone' || key === 'departments.leaders');

  return (
    <div className="flex flex-col gap-3">
      <Select
        label="Who it goes to"
        required
        value={key}
        onChange={(e) => pick(e.target.value)}
        options={[
          { value: '', label: 'Choose who' },
          ...options.audiences.map((a) => ({ value: a.key, label: labelOf(a) })),
        ]}
      />
      {selected && <p className="-mt-1.5 text-[11.5px] text-fg3">{selected.description}</p>}

      {pickDepartments && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-[12px] font-medium text-fg2">
            {key === 'departments.leaders' ? 'Leaders of which departments' : 'Which departments'}
          </legend>
          {key === 'departments.leaders' && (
            <label className="flex items-center gap-2 text-[12.5px]">
              <input
                type="radio"
                checked={chosen.length === 0}
                onChange={() => onChange({ key, params: {} })}
              />
              Every department
            </label>
          )}
          <div className="grid gap-1 sm:grid-cols-2">
            {options.departments.map((d) => (
              <label key={d.id} className="flex items-center gap-2 text-[12.5px]">
                <input
                  type="checkbox"
                  checked={chosen.includes(d.id)}
                  onChange={(e) => toggle(d.id, e.target.checked)}
                />
                {d.name}
              </label>
            ))}
          </div>
          {options.departments.length === 0 && (
            <p className="text-[12px] text-fg3">
              There are no departments yet. Admin → Departments makes them.
            </p>
          )}
        </fieldset>
      )}

      {key === 'membership.class' && (
        <Select
          label="Which group"
          value={(value?.params.groupId as string | undefined) ?? ''}
          onChange={(e) =>
            onChange({ key, params: e.target.value ? { groupId: e.target.value } : {} })
          }
          options={[
            { value: '', label: 'Every group' },
            ...options.groups.map((g) => ({ value: g.id, label: g.name })),
          ]}
        />
      )}
    </div>
  );
}

/** Whether an audience is chosen well enough to ask about. */
export function audienceReady(a: Audience | null): a is Audience {
  if (!a) return false;
  if (a.key === 'departments.everyone')
    return ((a.params.departmentIds as string[]) ?? []).length > 0;
  return true;
}

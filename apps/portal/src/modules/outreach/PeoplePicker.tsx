'use client';

import { useId, useState } from 'react';

export type Pickable = {
  personId: string;
  name: string;
  note?: string | null;
  /** The end of their number, shown when two on the team share a name. */
  phoneTail?: string;
};

/**
 * Ticking people from the team, which may be a hundred or two (owner, 25 Sept
 * 2026). A search narrows the list by name; whoever is ticked stays at the
 * top, so a choice made is always in sight; and the list scrolls in its own
 * box, so the rest of the form does not scroll away on a phone.
 */
export function PeoplePicker({
  legend,
  people,
  picked,
  onChange,
  max,
}: {
  legend: string;
  people: Pickable[];
  picked: string[];
  onChange: (picked: string[]) => void;
  /** The most that may be ticked; the rest are disabled once reached. */
  max?: number;
}) {
  const searchId = useId();
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const ticked = people.filter((p) => picked.includes(p.personId));
  const rest = people.filter(
    (p) => !picked.includes(p.personId) && (!term || p.name.toLowerCase().includes(term)),
  );
  const full = max !== undefined && picked.length >= max;
  const count = new Map<string, number>();
  for (const p of people) count.set(p.name, (count.get(p.name) ?? 0) + 1);

  const row = (p: Pickable) => {
    const checked = picked.includes(p.personId);
    return (
      <label key={p.personId} className="flex items-center gap-2 py-1 text-[12.5px]">
        <input
          type="checkbox"
          checked={checked}
          disabled={!checked && full}
          onChange={(e) =>
            onChange(
              e.target.checked ? [...picked, p.personId] : picked.filter((id) => id !== p.personId),
            )
          }
        />
        <span className="text-fg">{p.name}</span>
        {(count.get(p.name) ?? 0) > 1 && p.phoneTail && (
          <span className="text-[11.5px] text-fg3">phone {p.phoneTail}</span>
        )}
        {p.note && <span className="text-[11.5px] text-fg3">{p.note}</span>}
      </label>
    );
  };

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-[12px] font-medium text-fg2">
        {legend}{' '}
        <span className="font-normal text-fg3">
          · {picked.length}
          {max !== undefined ? ` of ${max}` : ` of ${people.length}`}
        </span>
      </legend>
      {people.length > 8 && (
        <input
          id={searchId}
          type="search"
          aria-label={`Find someone for ${legend.toLowerCase()}`}
          placeholder="Type part of a name"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-9 w-full rounded-[7px] border border-border bg-input px-3 text-[13px] text-fg placeholder:text-fg3"
        />
      )}
      <div className="flex max-h-64 flex-col overflow-y-auto rounded-[7px] border border-border px-3 py-1">
        {ticked.map(row)}
        {ticked.length > 0 && rest.length > 0 && <hr className="my-1 border-border2" />}
        {rest.map(row)}
        {rest.length === 0 && term && (
          <p className="py-1 text-[12px] text-fg3">Nobody else on the team by that name.</p>
        )}
      </div>
    </fieldset>
  );
}

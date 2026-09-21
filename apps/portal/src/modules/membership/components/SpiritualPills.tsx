'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clientApi } from '@/lib/api/client';
import { useCan } from '@/lib/session';
import { cn } from '@/lib/cn';
import { flagLabel, type Flag } from '../types';

/**
 * Saved and baptised, as the design draws them: a filled pill for yes, a
 * dashed one to mark it. The label says where the answer came from, because
 * "said on the form" and "confirmed by Pastor Sarah" are not the same fact.
 */
export function SpiritualPills({
  personId,
  saved,
  baptised,
  savedBy,
  baptisedBy,
}: {
  personId: string;
  saved: Flag;
  baptised: Flag;
  savedBy?: string | null;
  baptisedBy?: string | null;
}) {
  const router = useRouter();
  const can = useCan();
  const [busy, setBusy] = useState<string | null>(null);
  const editable = can('membership.people.update');

  async function set(flag: 'saved' | 'baptised', value: boolean | null) {
    setBusy(flag);
    try {
      await clientApi(`/membership/people/${personId}/${flag}`, {
        method: 'POST',
        body: { value },
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const pill = (
    flag: 'saved' | 'baptised',
    state: Flag,
    by: string | null | undefined,
    word: string,
  ) => {
    const label = flagLabel(state, by ?? null, word);
    if (!editable) {
      return (
        <span
          className={cn(
            'rounded-full border px-2.5 py-1 text-[11.5px]',
            state.value ? 'border-pos-br bg-pos-bg text-pos' : 'border-border text-fg3',
          )}
        >
          {label}
        </span>
      );
    }
    return (
      <button
        type="button"
        disabled={busy === flag}
        title={state.value ? `Click to unmark ${word.toLowerCase()}` : `Mark ${word.toLowerCase()}`}
        onClick={() => set(flag, !state.value)}
        className={cn(
          'rounded-full border px-2.5 py-1 text-[11.5px] disabled:opacity-60',
          state.value
            ? 'border-pos-br bg-pos-bg text-pos'
            : 'border-dashed border-border text-fg2 hover:bg-hover',
        )}
      >
        {state.value ? label : `Mark ${word.toLowerCase()}`}
      </button>
    );
  };

  return (
    <div className="flex flex-wrap gap-2">
      {pill('saved', saved, savedBy, 'Saved')}
      {pill('baptised', baptised, baptisedBy, 'Baptised')}
    </div>
  );
}

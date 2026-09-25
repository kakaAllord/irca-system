'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { clientApi } from '@/lib/api/client';
import { cn } from '@/lib/cn';
import { RequiredMark } from '@/components/ui/RequiredMark';

/**
 * Finds someone in People by typing part of their name or phone number, and
 * lets one be chosen. Who can be found is the API's business: confirmed
 * members for a leader, anyone not already in the department for a member.
 */
export function PersonSearch<T extends { personId: string; name: string }>({
  label,
  endpoint,
  describe,
  chosen,
  onChoose,
  emptyHint,
}: {
  label: string;
  /** Called with `?q=`. */
  endpoint: string;
  /** The line under a name, so two people with one name can be told apart. */
  describe: (candidate: T) => ReactNode;
  chosen: T | null;
  onChoose: (candidate: T | null) => void;
  /** Said when a search finds nobody. */
  emptyHint: string;
}) {
  const id = useId();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<T[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults(null);
      return;
    }
    // A slow early answer must not overwrite a later one.
    const controller = new AbortController();
    const timer = setTimeout(() => {
      clientApi<T[]>(`${endpoint}?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        .then((found) => {
          setResults(found);
          setError(false);
        })
        .catch((err: unknown) => {
          if ((err as Error).name !== 'AbortError') setError(true);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, endpoint]);

  if (chosen) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium text-fg2">
          {label}
          <RequiredMark />
        </span>
        <div className="flex items-center justify-between gap-3 rounded-[7px] border border-accent-br bg-chip px-3 py-2">
          <span className="flex min-w-0 flex-col">
            <span className="text-[13px] font-medium text-fg">{chosen.name}</span>
            <span className="text-[11.5px] text-fg3">{describe(chosen)}</span>
          </span>
          <button
            type="button"
            onClick={() => onChoose(null)}
            className="text-[12px] text-accent underline"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[12px] font-medium text-fg2">
        {label}
        <RequiredMark />
      </label>
      <input
        id={id}
        type="search"
        autoFocus
        autoComplete="off"
        placeholder="Type part of a name or phone number"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className={cn(
          'h-9 w-full rounded-[7px] border border-border bg-input px-3 text-[13px] text-fg placeholder:text-fg3',
          'focus:border-accent focus:ring-2 focus:ring-accent-br focus:outline-none',
        )}
      />
      {error && <p className="text-[11.5px] text-danger">The search did not work. Try again.</p>}
      {results && results.length === 0 && <p className="text-[11.5px] text-fg3">{emptyHint}</p>}
      {results && results.length > 0 && (
        <ul className="flex max-h-72 flex-col overflow-y-auto rounded-[7px] border border-border">
          {results.map((candidate) => (
            <li key={candidate.personId} className="border-b border-border last:border-b-0">
              <button
                type="button"
                onClick={() => onChoose(candidate)}
                className="flex w-full flex-col px-3 py-2 text-left hover:bg-hover"
              >
                <span className="text-[12.5px] font-medium text-fg">{candidate.name}</span>
                <span className="text-[11.5px] text-fg3">{describe(candidate)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

'use client';

import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from '@headlessui/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CatalogSuggestResponse, CatalogSuggestion } from '@irca/shared';
import { clientApi } from '@/lib/api/client';
import { useCan } from '@/lib/session';
import { RequiredMark } from '@/components/ui/RequiredMark';
import { Spinner } from '@/components/ui/Spinner';
import { NewItemDrawer } from './NewItemDrawer';

export type CatalogValue = { id: string; name: string } | null;

const NOUN = { income: 'income source', expense: 'expense item' } as const;

/**
 * The field the finance team uses most: type a few letters, pick from what
 * the church already records against, and create the item right here when it
 * is genuinely new.
 *
 * Free text is never a value. What the form submits is always an id that came
 * back from the server, which is what stops a typo becoming a new item and a
 * year of split reports.
 */
export function CatalogCombobox({
  kind,
  value,
  onChange,
  error,
  label,
}: {
  kind: 'income' | 'expense';
  value: CatalogValue;
  onChange: (value: CatalogValue) => void;
  error?: string;
  label?: string;
}) {
  const can = useCan();
  const path = kind === 'income' ? 'income-sources' : 'expense-items';
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<CatalogSuggestion[]>([]);
  const [exact, setExact] = useState<CatalogSuggestResponse['exact']>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  // Typing asks the server, but not on every keystroke, and a slow early
  // answer must never overwrite a later one.
  useEffect(() => {
    const timer = setTimeout(async () => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      setLoading(true);
      try {
        const res = await clientApi<CatalogSuggestResponse>(
          `/finance/${path}/suggest?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );
        setItems(res.items);
        setExact(res.exact);
      } catch {
        // An aborted or failed suggestion is not worth an error message: the
        // list simply stays as it was.
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [query, path]);

  const showCreate = useMemo(
    () => query.trim().length >= 2 && !exact && can('finance.catalog.create'),
    [query, exact, can],
  );
  const inactive = exact && !exact.isActive ? exact : null;

  return (
    <div className="flex flex-col gap-1.5">
      <Combobox
        value={value}
        onChange={(next: CatalogValue) => {
          onChange(next);
          setNote(null);
        }}
        by={(a, b) => a?.id === b?.id}
        nullable
      >
        <label className="text-[12px] font-medium text-fg2" htmlFor={`catalog-${kind}`}>
          {label ?? (kind === 'income' ? 'Income source' : 'Expense item')}
          <RequiredMark />
        </label>
        <div className="relative">
          <ComboboxInput
            id={`catalog-${kind}`}
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            className={`h-9 w-full rounded-[7px] border bg-input px-3 pr-16 text-[13px] text-fg placeholder:text-fg3 focus:border-accent focus:ring-2 focus:ring-accent-br focus:outline-none ${
              error ? 'border-danger' : 'border-border'
            }`}
            placeholder={`Start typing an ${NOUN[kind]}…`}
            displayValue={(item: CatalogValue) => item?.name ?? ''}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="absolute inset-y-0 right-1.5 flex items-center gap-1.5">
            {loading && <Spinner />}
            <ComboboxButton className="text-fg3" aria-label="Show suggestions">
              ▾
            </ComboboxButton>
          </div>

          <ComboboxOptions className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-[10px] border border-border bg-surface py-1 shadow-xl">
            {items.map((item) => (
              <ComboboxOption
                key={item.id}
                value={{ id: item.id, name: item.name }}
                className="flex cursor-pointer items-start gap-3 px-3 py-1.5 text-[12.5px] data-focus:bg-hover"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-fg">{item.name}</span>
                  {item.description && (
                    <span className="truncate text-[11.5px] text-fg3">{item.description}</span>
                  )}
                </span>
                {item.uses > 0 && (
                  <span className="ml-auto whitespace-nowrap text-[11.5px] text-fg3">
                    used {item.uses} time{item.uses === 1 ? '' : 's'}
                  </span>
                )}
              </ComboboxOption>
            ))}

            {inactive && (
              <p className="border-t border-border2 px-3 py-2 text-[12px] text-fg3">
                “{inactive.name}” is turned off. A finance manager can turn it back on.
              </p>
            )}

            {showCreate && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setCreating(query.trim())}
                className="w-full border-t border-border2 px-3 py-2 text-left text-[12.5px] text-accent hover:bg-hover"
              >
                ＋ Create {NOUN[kind]} “{query.trim()}”
              </button>
            )}

            {!showCreate && !inactive && items.length === 0 && query.trim().length >= 2 && (
              <p className="px-3 py-2 text-[12px] text-fg3">
                No {NOUN[kind]} called “{query.trim()}”. Ask a finance manager to add it.
              </p>
            )}

            <span className="sr-only" role="status">
              {items.length} suggestion{items.length === 1 ? '' : 's'}
            </span>
          </ComboboxOptions>
        </div>
      </Combobox>

      {note && <p className="text-[11.5px] text-fg3">{note}</p>}
      {error && <p className="text-[11.5px] text-danger">{error}</p>}

      <NewItemDrawer
        kind={kind}
        name={creating}
        onClose={() => setCreating(null)}
        onCreated={(item, message) => {
          onChange(item);
          setCreating(null);
          setQuery(item.name);
          setNote(message ?? null);
        }}
      />
    </div>
  );
}

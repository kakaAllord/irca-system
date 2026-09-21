'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/**
 * A search box that filters a server-rendered list as you type.
 *
 * The text goes into the URL a moment after typing stops, so the list is not
 * re-fetched on every key. One thing makes that delay dangerous: someone who
 * types and then clicks a row straight away has started a navigation, and a
 * search that fires a moment later would pull them back to the list they
 * just left. So a click on any link outside the search box cancels the
 * search that was still waiting — they have chosen where to go.
 */
export function useLiveSearch(path: string, delay = 250) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = params.toString();

  useEffect(() => {
    timer.current = setTimeout(() => {
      timer.current = null;
      const next = new URLSearchParams(current);
      if ((next.get('q') ?? '') === q) return;
      if (q) next.set('q', q);
      else next.delete('q');
      next.delete('page');
      router.replace(`${path}${next.size ? `?${next}` : ''}`, { scroll: false });
    }, delay);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [q, current, router, path, delay]);

  useEffect(() => {
    const leaving = (event: PointerEvent) => {
      const link = (event.target as Element | null)?.closest?.('a[href]');
      if (link && timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
    document.addEventListener('pointerdown', leaving, true);
    return () => document.removeEventListener('pointerdown', leaving, true);
  }, []);

  return [q, setQ] as const;
}

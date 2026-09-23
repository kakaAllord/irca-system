'use client';

import { useState } from 'react';
import { Can } from '@/lib/session';
import { EntryDrawer } from './EntryDrawer';

/**
 * The two ways to add to the books, wherever they are offered.
 *
 * Both open the right-hand drawer rather than a page of their own, which is
 * how every other form in the portal behaves, and it keeps the list the clerk
 * is working against on screen behind it.
 */
export function RecordButtons({
  currency,
  timezone,
  /** Opened straight away, for the `/finance/transactions/new` link. */
  initial,
}: {
  currency: string;
  timezone: string;
  initial?: 'income' | 'expense';
}) {
  const [recording, setRecording] = useState<'income' | 'expense' | null>(initial ?? null);

  return (
    <Can permission="finance.transactions.create">
      <button
        type="button"
        onClick={() => setRecording('income')}
        className="inline-flex h-9 items-center rounded-[7px] border border-border px-3.5 text-[12.5px] font-medium text-fg hover:bg-hover"
      >
        + Record income
      </button>
      <button
        type="button"
        onClick={() => setRecording('expense')}
        className="inline-flex h-9 items-center rounded-[7px] bg-btn-bg px-3.5 text-[12.5px] font-medium text-btn-fg hover:opacity-90"
      >
        + Record expense
      </button>

      {/* Keyed so switching kind starts a clean form rather than reusing one. */}
      {recording && (
        <EntryDrawer
          key={recording}
          kind={recording}
          open
          onClose={() => setRecording(null)}
          currency={currency}
          timezone={timezone}
        />
      )}
    </Can>
  );
}

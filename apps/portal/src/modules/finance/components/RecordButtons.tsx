'use client';

import Link from 'next/link';
import { Can } from '@/lib/session';

/** The two ways to add to the books, wherever they are offered. */
export function RecordButtons() {
  return (
    <Can permission="finance.transactions.create">
      <Link
        href="/finance/transactions/new?kind=income"
        className="inline-flex h-9 items-center rounded-[7px] border border-border px-3.5 text-[12.5px] font-medium text-fg hover:bg-hover"
      >
        + Record income
      </Link>
      <Link
        href="/finance/transactions/new?kind=expense"
        className="inline-flex h-9 items-center rounded-[7px] bg-btn-bg px-3.5 text-[12.5px] font-medium text-btn-fg hover:opacity-90"
      >
        + Record expense
      </Link>
    </Can>
  );
}

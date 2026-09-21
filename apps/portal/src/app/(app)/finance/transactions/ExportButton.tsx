'use client';

import { Button } from '@/components/ui/Button';

/** The same filters as the list, downloaded rather than shown. */
export function ExportButton({ query }: { query: string }) {
  return (
    <Button
      variant="secondary"
      onClick={() => {
        window.location.href = `/api/finance/transactions/export.csv?${query}`;
      }}
    >
      Export CSV
    </Button>
  );
}

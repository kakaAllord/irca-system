'use client';

import { Button } from '@/components/ui/Button';

/** The browser's own print dialog, which also saves as PDF. */
export function PrintButton() {
  return (
    <Button variant="secondary" size="sm" onClick={() => window.print()}>
      Print or save as PDF
    </Button>
  );
}

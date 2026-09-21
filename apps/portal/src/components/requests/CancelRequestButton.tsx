'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clientApi } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';

/** Changing your mind before anyone has decided. Only the requester sees this. */
export function CancelRequestButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="ghost"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await clientApi(`/finance/change-requests/${id}/cancel`, { method: 'POST' });
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      Cancel request
    </Button>
  );
}

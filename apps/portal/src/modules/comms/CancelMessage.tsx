'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';

/** Stops what has not gone yet. What has gone cannot be taken back. */
export function CancelMessage({ id }: { id: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      await clientApi(`/comms/messages/${id}/cancel`, { method: 'POST' });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Stop it
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Stop this message?"
        description="Whoever has not been sent it yet will not be. Texts that have gone cannot be taken back."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Keep sending
            </Button>
            <Button variant="danger" loading={busy} onClick={cancel}>
              Stop it
            </Button>
          </>
        }
      >
        {error && <p className="text-[12px] text-danger">{error}</p>}
      </Dialog>
    </div>
  );
}

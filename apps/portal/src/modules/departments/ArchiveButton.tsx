'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';

/** Archive a department, or bring one back. Nothing in it is deleted either way. */
export function ArchiveButton({
  id,
  name,
  archived,
}: {
  id: string;
  name: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function set(value: boolean) {
    setBusy(true);
    setError(null);
    try {
      await clientApi(`/admin/departments/${id}/archived`, {
        method: 'PUT',
        body: { archived: value },
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
      setOpen(true);
    } finally {
      setBusy(false);
    }
  }

  if (archived) {
    return (
      <Button size="sm" variant="secondary" loading={busy} onClick={() => set(false)}>
        Restore
      </Button>
    );
  }
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Archive
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Archive ${name}?`}
        description="Its leaders stop seeing it and sending its messages. Its leaders, members and history are all kept, and come back if you restore it."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} onClick={() => set(true)}>
              Archive it
            </Button>
          </>
        }
      >
        {error && <p className="text-[12px] text-danger">{error}</p>}
      </Dialog>
    </>
  );
}

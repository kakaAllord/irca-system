'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';

/**
 * Ending a membership or a leadership: a yes-or-no question, so the centred
 * dialog. Nothing is deleted; the row is ended and kept.
 */
export function EndButton({
  label,
  question,
  explanation,
  confirm,
  path,
}: {
  label: string;
  question: string;
  explanation: string;
  confirm: string;
  path: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function end() {
    setBusy(true);
    setError(null);
    try {
      await clientApi(path, { method: 'POST' });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={question}
        description={explanation}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} onClick={end}>
              {confirm}
            </Button>
          </>
        }
      >
        {error && <p className="text-[12px] text-danger">{error}</p>}
      </Dialog>
    </>
  );
}

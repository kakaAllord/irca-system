'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { SubmitButton } from '@/components/ui/SubmitButton';

/**
 * A promise that will not be kept. A yes-or-no question, so a dialog: the
 * pledge stays in the records with whatever was paid, and stops being owed.
 */
export function CancelPledge({ pledgeId, name }: { pledgeId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      await clientApi(`/finance/pledges/${pledgeId}/cancel`, {
        method: 'POST',
        body: { reason },
      });
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
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Cancel pledge
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Cancel ${name}'s pledge?`}
        description="It stays in the records with what was already paid, and is no longer owed or reminded about. It cannot be reopened."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Keep it
            </Button>
            <SubmitButton
              variant="danger"
              loading={busy}
              missing={reason.trim().length < 5 ? ['Why?'] : []}
              onClick={cancel}
            >
              Cancel pledge
            </SubmitButton>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Input
            label="Why?"
            required
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Moved away; asked to be released from it"
          />
          {error && <Alert tone="error">{error}</Alert>}
        </div>
      </Dialog>
    </>
  );
}

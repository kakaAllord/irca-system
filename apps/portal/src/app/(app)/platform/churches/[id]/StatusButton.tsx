'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Input } from '@/components/ui/Input';
import { SubmitButton } from '@/components/ui/SubmitButton';

/**
 * Pausing a church, or letting it back in.
 *
 * Both ask why, because both are written to the platform's log and to the
 * church's own, and "Paused IRCA" with no reason helps nobody six months on.
 */
export function StatusButton({
  id,
  name,
  status,
}: {
  id: string;
  name: string;
  status: 'ACTIVE' | 'SUSPENDED';
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pausing = status === 'ACTIVE';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await clientApi(`/platform/churches/${id}/${pausing ? 'suspend' : 'reactivate'}`, {
        method: 'POST',
        body: { reason },
      });
      setOpen(false);
      setReason('');
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : 'Something went wrong. Try again in a moment.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant={pausing ? 'secondary' : 'primary'} onClick={() => setOpen(true)}>
        {pausing ? 'Pause this church' : 'Let it back in'}
      </Button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={pausing ? `Pause ${name}?` : `Reactivate ${name}?`}
        description={
          pausing
            ? 'Its staff lose the portal at once and its registration form stops taking answers. Nothing is deleted, and you can let it back in whenever you like.'
            : 'Its staff get the portal back and its registration form starts taking answers again.'
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton
              type="submit"
              form="church-status"
              variant={pausing ? 'danger' : 'primary'}
              loading={busy}
              missing={reason.trim().length < 3 ? ['a reason'] : []}
            >
              {pausing ? 'Pause it' : 'Reactivate it'}
            </SubmitButton>
          </>
        }
      >
        <form id="church-status" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Input
            label="Why"
            required
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            hint="Goes into the log, and the church sees it in theirs."
          />
        </form>
      </Drawer>
    </>
  );
}

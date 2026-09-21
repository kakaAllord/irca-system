'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ChangeRequestView } from '@irca/shared';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Input } from '@/components/ui/Input';

/**
 * Approve and reject, with the four-eyes rule made plain: the person who
 * asked sees why they cannot decide it rather than a button that fails.
 */
export function DecideButtons({ request }: { request: ChangeRequestView }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'approve' | 'reject' | null>(null);
  const [note, setNote] = useState('');

  if (request.isMine) {
    return (
      <p className="text-[12px] text-fg3">You asked for this. Another administrator must decide.</p>
    );
  }

  async function decide(what: 'approve' | 'reject') {
    setBusy(what);
    setError(null);
    try {
      await clientApi(`/admin/requests/${request.id}/${what}`, {
        method: 'POST',
        body: what === 'reject' ? { note } : note ? { note } : {},
      });
      setConfirm(null);
      setNote('');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  }

  const summary =
    request.action === 'VOID'
      ? `Void ${request.entityLabel}?`
      : `Change ${request.entityLabel}: ${request.changes.map((c) => `${c.label} to ${c.to}`).join(', ')}?`;

  return (
    <>
      {error && <Alert tone="error">{error}</Alert>}
      <Button variant="ghost" onClick={() => setConfirm('reject')}>
        Reject…
      </Button>
      <Button onClick={() => setConfirm('approve')}>Approve</Button>

      <Drawer
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === 'reject' ? `Reject this change?` : summary}
        description={
          confirm === 'reject'
            ? 'Nothing changes. Say why, so the person who asked knows.'
            : (request.warning ?? 'This is applied as soon as you approve it.')
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant={confirm === 'reject' ? 'danger' : 'primary'}
              loading={busy !== null}
              disabled={confirm === 'reject' && note.trim().length < 3}
              onClick={() => decide(confirm!)}
            >
              {confirm === 'reject' ? 'Reject' : 'Approve'}
            </Button>
          </>
        }
      >
        <Input
          label={confirm === 'reject' ? 'Why not?' : 'Note (optional)'}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={confirm === 'reject' ? 'The receipt says otherwise' : ''}
        />
      </Drawer>
    </>
  );
}

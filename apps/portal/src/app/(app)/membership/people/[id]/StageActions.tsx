'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Input } from '@/components/ui/Input';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Can } from '@/lib/session';
import { STAGE_LABEL, STAGE_ORDER, type Stage } from '@/modules/membership/types';

/** The last two stages are the pastors' decision, through Applications. */
const BY_APPLICATION = new Set<Stage>(['MEMBERSHIP_REVIEW', 'CONFIRMED_MEMBER']);

/**
 * One step on, or one step back with a reason — the only moves the API
 * allows, offered here and nothing else, so no button leads to a refusal.
 */
export function StageActions({ personId, stage }: { personId: string; stage: Stage }) {
  const router = useRouter();
  const [back, setBack] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const i = STAGE_ORDER.indexOf(stage);
  const next = STAGE_ORDER[i + 1];
  const previous = STAGE_ORDER[i - 1];
  const canForward = next && !BY_APPLICATION.has(next);
  const canBack = previous && !BY_APPLICATION.has(stage);

  async function move(to: Stage, reason?: string) {
    setBusy(true);
    setError(null);
    try {
      await clientApi(`/membership/people/${personId}/stage`, {
        method: 'POST',
        body: { to, ...(reason ? { note: reason } : {}) },
      });
      setBack(false);
      setNote('');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  if (!canForward && !canBack) return null;

  return (
    <Can permission="membership.people.update">
      <div className="flex flex-wrap gap-2">
        {canForward && (
          <Button size="sm" loading={busy && !back} onClick={() => move(next)}>
            Move on to {STAGE_LABEL[next].toLowerCase()}
          </Button>
        )}
        {canBack && (
          <Button size="sm" variant="ghost" onClick={() => setBack(true)}>
            Back to {STAGE_LABEL[previous].toLowerCase()}…
          </Button>
        )}
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {canBack && (
        <Drawer
          open={back}
          onClose={() => setBack(false)}
          title={`Move back to ${STAGE_LABEL[previous].toLowerCase()}?`}
          description="Going back a step is written down with the reason."
          footer={
            <>
              <Button variant="ghost" onClick={() => setBack(false)}>
                Cancel
              </Button>
              <SubmitButton
                loading={busy}
                missing={note.trim() ? [] : ['Why']}
                onClick={() => move(previous, note)}
              >
                Move back
              </SubmitButton>
            </>
          }
        >
          <Input
            label="Why"
            required
            value={note}
            onChange={(e) => setNote(e.target.value)}
            autoFocus
          />
        </Drawer>
      )}
    </Can>
  );
}

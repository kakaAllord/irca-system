'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { RequiredMark } from '@/components/ui/RequiredMark';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Can } from '@/lib/session';
import { cn } from '@/lib/cn';

const KINDS = { VISIT: 'A visit', CALL: 'A call', NOTE: 'A note' } as const;
type Kind = keyof typeof KINDS;

/**
 * Writing down what the follow-up team did. Notes are as private as a prayer
 * request, so only pastors and the office read them back — but the team that
 * makes the visits is the one that writes them.
 */
export function NoteDrawer({
  personId,
  name,
  kind: initial = 'VISIT',
  label = 'Log visit',
  size = 'sm',
}: {
  personId: string;
  name: string;
  kind?: Kind;
  label?: string;
  size?: 'sm' | 'md';
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>(initial);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await clientApi(`/membership/people/${personId}/notes`, {
        method: 'POST',
        body: { kind, body },
      });
      setOpen(false);
      setBody('');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Can permission="membership.notes.write">
      <Button size={size} variant="secondary" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={`Write down a visit, call or note for ${name || 'them'}`}
        description="Only pastors and the office can read these back."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton
              loading={busy}
              missing={body.trim().length < 2 ? ['What happened'] : []}
              onClick={save}
            >
              Save
            </SubmitButton>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {error && <Alert tone="error">{error}</Alert>}
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-[12px] font-medium text-fg2">What was it?</legend>
            <div className="flex gap-1.5">
              {(Object.keys(KINDS) as Kind[]).map((k) => (
                <label
                  key={k}
                  className={cn(
                    'cursor-pointer rounded-full border px-3 py-1 text-[12px]',
                    kind === k ? 'border-accent-br bg-chip text-fg' : 'border-border text-fg2',
                  )}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    checked={kind === k}
                    onChange={() => setKind(k)}
                  />
                  {KINDS[k]}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="note-body" className="text-[12px] font-medium text-fg2">
              What happened
              <RequiredMark />
            </label>
            <textarea
              id="note-body"
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="rounded-[7px] border border-border bg-input px-3 py-2 text-[13px] text-fg focus:border-accent focus:ring-2 focus:ring-accent-br focus:outline-none"
              placeholder="Visited at home. Coming on Thursday."
            />
          </div>
        </div>
      </Drawer>
    </Can>
  );
}

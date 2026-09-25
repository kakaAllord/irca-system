'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { cn } from '@/lib/cn';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const KINDS = [
  { value: 'CALL', label: 'Called' },
  { value: 'VISIT', label: 'Visited' },
  { value: 'INVITED', label: 'Invited' },
  { value: 'ATTENDED_SERVICE', label: 'Came on Sunday' },
] as const;
type Kind = (typeof KINDS)[number]['value'];

/**
 * One follow-up: what happened, a short note, and when. As many as it takes,
 * in any order: nothing here moves anyone along a pipeline. "Came on Sunday"
 * stands in until Membership marks Sunday attendance itself.
 */
export function FollowUpForm({ personId, today }: { personId: string; today: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>('CALL');
  const [note, setNote] = useState('');
  const [on, setOn] = useState(today);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      await clientApi(`/outreach/people/${personId}/followups`, {
        method: 'POST',
        body: { kind, note, on, done },
      });
      setSaved(KINDS.find((k) => k.value === kind)!.label);
      setNote('');
      setDone(false);
      setOn(today);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {saved && <Alert>Saved “{saved}”. It is on their timeline.</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      <div role="radiogroup" aria-label="What happened" className="flex flex-wrap gap-1.5">
        {KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            role="radio"
            aria-checked={kind === k.value}
            onClick={() => setKind(k.value)}
            className={cn(
              'h-9 rounded-full border px-3.5 text-[12.5px]',
              kind === k.value
                ? 'border-accent-br bg-chip font-medium text-fg'
                : 'border-border text-fg2 hover:bg-hover',
            )}
          >
            {k.label}
          </button>
        ))}
      </div>
      <Input
        label="Note"
        maxLength={160}
        placeholder={
          kind === 'CALL' ? 'Will come on Sunday' : kind === 'VISIT' ? 'Met her husband' : ''
        }
        hint="A line, read by everyone who can see them, in Outreach and in Membership."
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44">
          <Input
            label="When"
            type="date"
            max={today}
            value={on}
            onChange={(e) => setOn(e.target.value)}
          />
        </div>
        <label className="flex h-9 items-center gap-2 text-[12.5px]">
          <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} />
          Nothing more to do for now
        </label>
      </div>
      <div>
        <Button loading={busy} onClick={save}>
          Save
        </Button>
      </div>
    </div>
  );
}

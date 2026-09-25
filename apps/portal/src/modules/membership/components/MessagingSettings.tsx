'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { useCan } from '@/lib/session';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Select } from '@/components/ui/Select';

type Lang = 'en' | 'sw' | 'fr';
const LANGS: { value: Lang; label: string }[] = [
  { value: 'sw', label: 'Kiswahili' },
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
];
const SOURCE: Record<string, string> = {
  reply: 'They replied STOP to a message.',
  office: 'The office turned messages off.',
  form: 'They asked on the form.',
};

/**
 * How the church writes to them (D22): the language, taken from the one they
 * answered the form in, and whether they want messages at all. Turning
 * messages back on after someone replied STOP undoes their own request, so it
 * says so first.
 */
export function MessagingSettings({
  personId,
  lang,
  optOut,
  optOutSource,
}: {
  personId: string;
  lang: Lang;
  optOut: boolean;
  optOutSource: string | null;
}) {
  const router = useRouter();
  const can = useCan();
  const editable = can('membership.people.update');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [undoingStop, setUndoingStop] = useState(false);
  // What the office just chose shows at once, rather than snapping back
  // until the page has fetched it again; a failed save puts it back.
  const [shown, setShown] = useState({ lang, optOut });

  async function save(next: { lang: Lang; optOut: boolean }, confirmed = false) {
    if (!confirmed && !next.optOut && optOut && optOutSource === 'reply') {
      setUndoingStop(true);
      return;
    }
    setUndoingStop(false);
    const before = shown;
    setShown(next);
    setBusy(true);
    setError(null);
    try {
      await clientApi(`/membership/people/${personId}/messaging`, { method: 'PUT', body: next });
      router.refresh();
    } catch (err) {
      setShown(before);
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border2 pt-3">
      <p className="text-[12px] font-medium text-fg2">Messages</p>
      <div className="flex flex-wrap items-end gap-3">
        <Select
          label="Written to in"
          value={shown.lang}
          disabled={!editable || busy}
          onChange={(e) => save({ lang: e.target.value as Lang, optOut: shown.optOut })}
          options={LANGS}
        />
        <label className="flex h-9 items-center gap-2 text-[12.5px] text-fg2">
          <input
            type="checkbox"
            checked={shown.optOut}
            disabled={!editable || busy}
            onChange={(e) => save({ lang: shown.lang, optOut: e.target.checked })}
          />
          No messages
        </label>
      </div>
      {optOut && optOutSource && (
        <p className="text-[11.5px] text-fg3">{SOURCE[optOutSource] ?? ''}</p>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      <Dialog
        open={undoingStop}
        onClose={() => setUndoingStop(false)}
        title="Turn messages back on?"
        description="They asked to stop by replying STOP. Turn messages back on only if they have asked for that too."
        footer={
          <>
            <Button variant="ghost" onClick={() => setUndoingStop(false)}>
              Leave them off
            </Button>
            <Button onClick={() => save({ lang: shown.lang, optOut: false }, true)}>
              They asked for it
            </Button>
          </>
        }
      />
    </div>
  );
}

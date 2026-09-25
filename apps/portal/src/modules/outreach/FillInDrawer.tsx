'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Input } from '@/components/ui/Input';
import type { ReachedRow } from './types';

/**
 * Filling in a reach afterwards, when the team meets and talks about the
 * people they spoke to: the area, a note, and whether they still need
 * following up. Their name and number are corrected in Membership, by the
 * office, where the rest of their record is.
 */
export function FillInDrawer({ row }: { row: ReachedRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [area, setArea] = useState(row.area);
  const [note, setNote] = useState(row.note);
  const [needsFollowUp, setNeedsFollowUp] = useState(row.needsFollowUp);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await clientApi(`/outreach/reached/${row.id}`, {
        method: 'PATCH',
        body: { area, note, needsFollowUp },
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
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Fill in
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={row.name}
        description="Their name and number are corrected by the office, in Membership."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button loading={busy} onClick={save}>
              Save
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Input
            label="Area"
            maxLength={80}
            value={area}
            onChange={(e) => setArea(e.target.value)}
          />
          <Input
            label="Note"
            maxLength={1000}
            hint="Read by everyone who can see them, in Outreach and in Membership."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <label className="flex items-center gap-2 text-[12.5px]">
            <input
              type="checkbox"
              checked={needsFollowUp}
              onChange={(e) => setNeedsFollowUp(e.target.checked)}
            />
            Still needs following up
          </label>
        </div>
      </Drawer>
    </>
  );
}

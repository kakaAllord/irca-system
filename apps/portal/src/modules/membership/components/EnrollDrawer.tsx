'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Can } from '@/lib/session';
import type { Group } from '../types';

/** Putting someone in a foundation class group. */
export function EnrollDrawer({ personId, name }: { personId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    clientApi<Group[]>('/membership/discipleship/groups')
      .then((all) => setGroups(all.filter((g) => g.isActive)))
      .catch(() => setGroups([]));
  }, [open]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await clientApi('/membership/discipleship/enrollments', {
        method: 'POST',
        body: { personId, groupId },
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
    <Can permission="membership.discipleship.manage">
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Add to foundation class
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={`Add ${name || 'them'} to a foundation class`}
        description="They move to the Foundation class stage straight away."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton loading={busy} missing={groupId ? [] : ['Group']} onClick={save}>
              Add them
            </SubmitButton>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {error && <Alert tone="error">{error}</Alert>}
          {groups.length === 0 ? (
            <p className="text-[12.5px] text-fg2">
              There are no groups yet. Start one under Discipleship first.
            </p>
          ) : (
            <Select
              label="Group"
              required
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              options={[
                { value: '', label: 'Choose a group' },
                ...groups.map((g) => ({ value: g.id, label: g.name })),
              ]}
            />
          )}
        </div>
      </Drawer>
    </Can>
  );
}

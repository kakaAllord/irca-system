'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { STAGE_LABEL } from '../membership/types';
import { PersonSearch } from './PersonSearch';
import type { MemberCandidate } from './types';

/** A leader (or an administrator) adding someone from People to a department. */
export function AddMemberDrawer({ departmentId, name }: { departmentId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<MemberCandidate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setChosen(null);
    setError(null);
  }

  async function save() {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    try {
      await clientApi(`/departments/${departmentId}/members`, {
        method: 'POST',
        body: { personId: chosen.personId },
      });
      close();
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        + Add a member
      </Button>
      <Drawer
        open={open}
        onClose={close}
        title={`Add someone to ${name}`}
        description="Anyone who has filled in the registration form. Someone who has not, fills it in first."
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <SubmitButton loading={busy} missing={chosen ? [] : ['Person']} onClick={save}>
              Add them
            </SubmitButton>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <PersonSearch<MemberCandidate>
            label="Person"
            endpoint={`/departments/${departmentId}/member-candidates`}
            describe={(c) =>
              [STAGE_LABEL[c.stage], c.phoneTail && `phone ${c.phoneTail}`]
                .filter(Boolean)
                .join(' · ')
            }
            chosen={chosen}
            onChoose={setChosen}
            emptyHint={`Nobody by that name who has registered on the form and is not already in ${name}.`}
          />
          {error && <Alert tone="error">{error}</Alert>}
        </div>
      </Drawer>
    </>
  );
}

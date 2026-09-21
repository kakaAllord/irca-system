'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { clientApi } from '@/lib/api/client';
import { Alert } from '@/components/ui/Alert';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Input } from '@/components/ui/Input';

export function ProfileForm({ fullName, readOnly }: { fullName: string; readOnly: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(fullName);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSaved(false);
    await clientApi('/me', { method: 'PATCH', body: { fullName: name } });
    setBusy(false);
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Input
        label="Your name"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={readOnly}
      />
      {saved && <Alert>Saved.</Alert>}
      {!readOnly && (
        <div>
          <SubmitButton
            type="submit"
            loading={busy}
            missing={
              !name.trim() ? ['Full name'] : name.trim() === fullName ? ['a change to make'] : []
            }
          >
            Save
          </SubmitButton>
        </div>
      )}
    </form>
  );
}

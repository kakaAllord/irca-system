'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Can } from '@/lib/session';

/** Downloading the list, and adding someone who never filled the form in. */
export function MembersActions({ query }: { query: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ fullName: '', gender: '', ageGroup: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const { id } = await clientApi<{ id: string }>('/membership/people', {
        method: 'POST',
        body: form,
      });
      setOpen(false);
      router.push(`/membership/people/${id}`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Can permission="membership.people.export">
        <Button
          variant="secondary"
          onClick={() => {
            window.location.href = `/api/membership/people/export.csv?${query}`;
          }}
        >
          Export CSV
        </Button>
      </Can>
      <Can permission="membership.people.update">
        <Button onClick={() => setOpen(true)}>+ Add person</Button>
        <Drawer
          open={open}
          onClose={() => setOpen(false)}
          title="Add someone by hand"
          description="For someone who never filled in the form. Their details can be edited later."
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <SubmitButton
                loading={busy}
                missing={form.fullName.trim().length < 2 ? ['Full name'] : []}
                onClick={add}
              >
                Add them
              </SubmitButton>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            {error && <Alert tone="error">{error}</Alert>}
            <Input
              label="Full name"
              required
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              autoFocus
            />
            <Select
              label="Gender"
              value={form.gender}
              onChange={(e) => setForm({ ...form, gender: e.target.value })}
              options={[
                { value: '', label: 'Not given' },
                { value: 'Female', label: 'Female' },
                { value: 'Male', label: 'Male' },
              ]}
            />
            <Select
              label="Age group"
              value={form.ageGroup}
              onChange={(e) => setForm({ ...form, ageGroup: e.target.value })}
              options={[
                { value: '', label: 'Not given' },
                { value: 'Under 18', label: 'Under 18' },
                { value: '19–35', label: '19 – 35' },
                { value: '36–44', label: '36 – 44' },
                { value: '45+', label: '45 & above' },
              ]}
            />
            <Input
              label="Phone"
              hint="Without the +255."
              inputMode="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
        </Drawer>
      </Can>
    </>
  );
}

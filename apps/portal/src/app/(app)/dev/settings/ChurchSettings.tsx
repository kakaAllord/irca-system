'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Input } from '@/components/ui/Input';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { ChurchSettings as Settings } from '@/modules/dev/types';

type Field = 'name' | 'code' | 'timezone' | 'currency';

/**
 * The church's name, the code on every entry number, its clock and its
 * currency. Set once by church:setup; changed here, rarely.
 */
export function ChurchSettings({ church }: { church: Settings }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<Field, string>>({
    name: church.name,
    code: church.code,
    timezone: church.timezone,
    currency: church.currency,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const set = (field: Field) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));
  const missing = (['name', 'code', 'timezone', 'currency'] as const)
    .filter((f) => !form[f].trim())
    .map((f) => ({ name: 'Name', code: 'Code', timezone: 'Timezone', currency: 'Currency' })[f]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const { code, ...rest } = form;
      await clientApi('/dev/church', {
        method: 'PATCH',
        body: church.codeLocked ? rest : { ...rest, code },
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setFieldErrors(err.fieldErrors);
        setError(err.message);
      } else setError('It did not save.');
    } finally {
      setBusy(false);
    }
  }

  const rows: [string, string][] = [
    ['Name', church.name],
    ['Code', church.code],
    ['Timezone', church.timezone],
    ['Currency', church.currency],
  ];

  return (
    <section className="rounded-[10px] border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-semibold text-fg">The church</h2>
          <p className="mt-0.5 text-[11.5px] text-fg3">
            {church.codeLocked
              ? `The code is on finance entry numbers now (${church.code}-EXP-…), so it cannot change.`
              : 'There are no finance entries yet, so the code can still change.'}
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          Edit
        </Button>
      </div>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-[12.5px] sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex gap-3">
            <dt className="w-20 flex-none text-fg3">{label}</dt>
            <dd className="font-medium text-fg">{value}</dd>
          </div>
        ))}
      </dl>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="The church's settings"
        description="Every change is written to the activity log."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton type="submit" form="church-settings" loading={busy} missing={missing}>
              Save
            </SubmitButton>
          </>
        }
      >
        <form id="church-settings" onSubmit={save} noValidate className="flex flex-col gap-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Input
            label="Name"
            required
            value={form.name}
            onChange={set('name')}
            error={fieldErrors.name?.[0]}
          />
          <Input
            label="Code"
            required
            value={form.code}
            onChange={set('code')}
            disabled={church.codeLocked}
            error={fieldErrors.code?.[0]}
            hint={
              church.codeLocked
                ? 'Locked: it is part of every finance entry number.'
                : '2 to 10 letters. It starts every finance entry number, and locks with the first one.'
            }
          />
          <Input
            label="Timezone"
            required
            value={form.timezone}
            onChange={set('timezone')}
            error={fieldErrors.timezone?.[0]}
            hint="Decides what counts as today, and which month an entry falls in. Africa/Dar_es_Salaam for Tanzania."
          />
          <Input
            label="Currency"
            required
            value={form.currency}
            onChange={set('currency')}
            error={fieldErrors.currency?.[0]}
            hint="Three letters, like TZS."
          />
        </form>
      </Drawer>
    </section>
  );
}

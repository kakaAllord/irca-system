'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';

const TIMEZONES = ['Africa/Dar_es_Salaam', 'Africa/Nairobi', 'Africa/Kampala', 'UTC'];
const CURRENCIES = ['TZS', 'KES', 'UGX', 'USD'];

/** A code with no spaces, out of the name: "Arusha Kaskazini" → "ARUSHAKAS". */
const codeFrom = (name: string) =>
  name
    .replace(/[^A-Za-z0-9 ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word, i) => (i === 0 ? word.slice(0, 5) : word.slice(0, 3)))
    .join('')
    .slice(0, 10)
    .toUpperCase();

const slugFrom = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

/**
 * Setting up a church: its name, what to call it in a reference, and who runs
 * it. The administration portal is switched on for it and its first
 * administrator is invited by email, so there is nothing else to do afterwards.
 */
export function NewChurchButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [slug, setSlug] = useState('');
  const [timezone, setTimezone] = useState(TIMEZONES[0]!);
  const [currency, setCurrency] = useState(CURRENCIES[0]!);
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setName('');
    setCode('');
    setSlug('');
    setAdminName('');
    setAdminEmail('');
    setFieldErrors({});
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setBusy(true);
    try {
      const created = await clientApi<{ id: string; code: string }>('/platform/churches', {
        method: 'POST',
        body: { code, slug, name, timezone, currency, adminName, adminEmail },
      });
      setDone(`${name} is set up. ${adminEmail} has been invited to run it.`);
      close();
      router.push(`/platform/churches/${created.id}`);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        // "That code is already a church" belongs beside the code.
        const field = (err.details as { field?: string } | null)?.field;
        if (field) setFieldErrors({ [field]: err.message });
        else setError(err.message);
      } else {
        setError('Something went wrong. Try again in a moment.');
      }
    } finally {
      setBusy(false);
    }
  }

  const missing = [
    !name.trim() && 'Church name',
    !code.trim() && 'Code',
    !slug.trim() && 'Web address',
    !adminName.trim() && "Administrator's name",
    !adminEmail.trim() && "Administrator's email",
  ].filter(Boolean) as string[];

  return (
    <>
      {done && <Alert>{done}</Alert>}
      <Button onClick={() => setOpen(true)}>+ New church</Button>

      <Drawer
        open={open}
        onClose={close}
        title="Set up a church"
        description="The administration portal is switched on, and the person you name is invited by email."
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <SubmitButton type="submit" form="new-church" loading={busy} missing={missing}>
              Set up church
            </SubmitButton>
          </>
        }
      >
        <form id="new-church" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Input
            label="Church name"
            required
            autoFocus
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              // Suggested until touched, so nobody types the same thing thrice.
              if (!code || code === codeFrom(name)) setCode(codeFrom(e.target.value));
              if (!slug || slug === slugFrom(name)) setSlug(slugFrom(e.target.value));
            }}
          />
          <Input
            label="Code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            error={fieldErrors.code}
            hint="Printed on every finance reference, so it cannot change once there are any. Letters and digits, no spaces."
          />
          <Input
            label="Web address"
            required
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            error={fieldErrors.slug}
            hint="Lowercase letters, digits and dashes."
          />
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Time zone"
              required
              value={timezone}
              options={TIMEZONES.map((t) => ({ value: t, label: t.replace(/_/g, ' ') }))}
              onChange={(e) => setTimezone(e.target.value)}
            />
            <Select
              label="Currency"
              required
              value={currency}
              options={CURRENCIES.map((c) => ({ value: c, label: c }))}
              onChange={(e) => setCurrency(e.target.value)}
            />
          </div>

          <fieldset className="flex flex-col gap-3 border-t border-border pt-4">
            <legend className="sr-only">Its first administrator</legend>
            <p className="text-[12px] font-medium text-fg2">Its first administrator</p>
            <Input
              label="Full name"
              required
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
            />
            <Input
              label="Email"
              type="email"
              required
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              error={fieldErrors.adminEmail}
              hint="They get a link to set their password and can then invite everyone else."
            />
          </fieldset>
        </form>
      </Drawer>
    </>
  );
}

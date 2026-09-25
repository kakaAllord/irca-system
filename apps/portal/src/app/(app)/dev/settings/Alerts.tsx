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
import type { AlertRecipient, AlertsSettings } from '@/modules/dev/types';

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

function People({ people }: { people: AlertRecipient[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {people.map((p) => (
        <li key={p.email} className="flex flex-wrap gap-x-3 text-[12.5px]">
          <span className="font-medium text-fg">{p.name}</span>
          <span className="text-fg2">{p.email}</span>
          <span className="text-fg3">{p.phone ?? 'no phone on their person: email only'}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Who hears when something is wrong, what is wrong now, the database's
 * storage size, and a test alert to prove the whole path (docs/plan/10,
 * step 10.4).
 */
export function Alerts({ alerts }: { alerts: AlertsSettings }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [size, setSize] = useState(alerts.dbStorageGb === null ? '' : String(alerts.dbStorageGb));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      await clientApi('/dev/alerts', {
        method: 'PUT',
        body: { dbStorageGb: size.trim() ? Number(size) : null },
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

  async function test() {
    setTesting(true);
    setTested(null);
    setTestError(null);
    try {
      const sent = await clientApi<{ emails: number; texts: number }>('/dev/alerts/test', {
        method: 'POST',
      });
      setTested(
        `Sent: ${sent.emails} ${sent.emails === 1 ? 'email' : 'emails'} and ${sent.texts} ${
          sent.texts === 1 ? 'text' : 'texts'
        }. Check they arrived.`,
      );
    } catch (err) {
      setTestError(err instanceof ApiRequestError ? err.message : 'It was not sent.');
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className="rounded-[10px] border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-semibold text-fg">Alerts</h2>
          <p className="mt-0.5 max-w-xl text-[11.5px] text-fg3">
            Checked every ten minutes: requests failing, emails given up on, jobs failing twice,
            storage filling, text credit low and texts failing. Each is sent once when it starts,
            again twice a day while it lasts, and once when it clears.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={test} disabled={testing}>
          {testing ? 'Sending…' : 'Send a test alert'}
        </Button>
      </div>

      <div className="mt-3 flex flex-col gap-3">
        {tested && <Alert>{tested}</Alert>}
        {testError && <Alert tone="error">{testError}</Alert>}

        {alerts.active.length > 0 && (
          <Alert tone="warn">
            <span className="font-semibold">Open now:</span>{' '}
            {alerts.active.map((a) => `${a.summary} (since ${when(a.raisedAt)})`).join('; ')}
          </Alert>
        )}

        <div>
          <h3 className="mb-1.5 text-[12px] font-semibold text-fg2">Who hears</h3>
          {alerts.recipients.length ? (
            <People people={alerts.recipients} />
          ) : (
            <Alert tone="error">
              Nobody: no active account may read the Health page, so alerts go nowhere. Give someone
              the Developer or Watcher role.
            </Alert>
          )}
        </div>

        {alerts.commsOnly.length > 0 && (
          <div>
            <h3 className="mb-1.5 text-[12px] font-semibold text-fg2">
              Also told about text credit and failing texts
            </h3>
            <People people={alerts.commsOnly} />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <p className="text-[12.5px]">
            <span className="text-fg3">Database storage </span>
            <span className="font-medium text-fg">
              {alerts.dbStorageGb === null
                ? 'not set, so not watched'
                : `${alerts.dbStorageGb} GB, alert past 80%`}
            </span>
          </p>
          {/* Not "Edit": the church's card above has that, and two buttons with
              one name cannot be told apart by someone using a screen reader. */}
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
            Set the size
          </Button>
        </div>
      </div>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Database storage"
        description="The storage the database's plan allows, from the host's dashboard. The change is written to the activity log."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton type="submit" form="alert-settings" loading={busy}>
              Save
            </SubmitButton>
          </>
        }
      >
        <form id="alert-settings" onSubmit={save} noValidate className="flex flex-col gap-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Input
            label="Storage (GB)"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={size}
            onChange={(e) => setSize(e.target.value)}
            error={fieldErrors.dbStorageGb?.[0]}
            hint="Empty: storage is not watched."
          />
        </form>
      </Drawer>
    </section>
  );
}

'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Can } from '@/lib/session';
import type { PersonRow } from '@/modules/membership/types';
import type { Application } from './page';

/**
 * The one action each step has: approve, confirm once the probation is over,
 * or open the record. Not approving is kept one step away in a menu, and asks
 * for a reason, because it is written down and the person may ask why.
 */
export function ApplicationActions({ application: a }: { application: Application }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function run(path: string, body: object = {}) {
    setBusy(true);
    setError(null);
    try {
      await clientApi(`/membership/applications/${a.id}/${path}`, { method: 'POST', body });
      setRejecting(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  if (a.status === 'CONFIRMED') {
    return (
      <Link
        href={`/membership/people/${a.person.id}`}
        className="inline-flex h-7 items-center rounded-[7px] border border-border px-2.5 text-[11.5px] font-medium text-fg hover:bg-hover"
      >
        Record
      </Link>
    );
  }

  return (
    <Can permission="membership.applications.decide">
      {error && <Alert tone="error">{error}</Alert>}
      {a.status === 'UNDER_REVIEW' && (
        <span className="flex items-center gap-1">
          <Button size="sm" loading={busy} onClick={() => run('approve')}>
            Approve
          </Button>
          <Menu>
            <MenuButton
              aria-label="More"
              className="h-7 rounded-[7px] px-2 text-fg3 hover:bg-hover"
            >
              ⋯
            </MenuButton>
            <MenuItems
              anchor="bottom end"
              className="z-30 mt-1 w-44 rounded-[10px] border border-border bg-surface py-1 shadow-xl"
            >
              <MenuItem>
                <button
                  type="button"
                  onClick={() => setRejecting(true)}
                  className="w-full px-3 py-2 text-left text-[12.5px] text-fg data-focus:bg-hover"
                >
                  Do not approve…
                </button>
              </MenuItem>
            </MenuItems>
          </Menu>
        </span>
      )}
      {a.status === 'APPROVED' && (
        <span title={a.canConfirm ? undefined : `The probation month ends on ${a.availableOn}`}>
          <Button size="sm" loading={busy} disabled={!a.canConfirm} onClick={() => run('confirm')}>
            {a.canConfirm
              ? 'Confirm'
              : `From ${new Date(`${a.availableOn}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`}
          </Button>
        </span>
      )}

      <Drawer
        open={rejecting}
        onClose={() => setRejecting(false)}
        title={`Do not approve ${a.person.fullName}?`}
        description="They go back to where they were before they applied. The reason is written down."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
            <SubmitButton
              variant="danger"
              loading={busy}
              missing={reason.trim().length < 3 ? ['Reason'] : []}
              onClick={() => run('reject', { reason })}
            >
              Do not approve
            </SubmitButton>
          </>
        }
      >
        <Input
          label="Reason"
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          autoFocus
        />
      </Drawer>
    </Can>
  );
}

/** The office entering an application for someone. */
export function NewApplication() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [personId, setPersonId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      clientApi<{ rows: PersonRow[] }>(`/membership/people?pageSize=20&q=${encodeURIComponent(q)}`)
        .then((res) => setPeople(res.rows))
        .catch(() => setPeople([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [open, q]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await clientApi('/membership/applications', { method: 'POST', body: { personId } });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Can permission="membership.applications.submit">
      <Button onClick={() => setOpen(true)}>+ New application</Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Enter a membership application"
        description="They move to Membership review, and a pastor decides."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton loading={busy} missing={personId ? [] : ['Person']} onClick={save}>
              Enter application
            </SubmitButton>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Input
            label="Find them"
            placeholder="Name or phone…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Select
            label="Person"
            required
            value={personId}
            onChange={(e) => setPersonId(e.target.value)}
            options={[
              { value: '', label: people.length ? 'Choose someone' : 'Nobody matches yet' },
              ...people.map((p) => ({
                value: p.id,
                label: `${p.fullName || 'Unknown'} · ${p.phone || 'no phone'}`,
              })),
            ]}
          />
        </div>
      </Drawer>
    </Can>
  );
}

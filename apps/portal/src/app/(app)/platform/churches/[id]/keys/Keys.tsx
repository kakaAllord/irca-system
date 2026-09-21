'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Drawer } from '@/components/ui/Drawer';
import { Input } from '@/components/ui/Input';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Table, Row, Cell } from '@/components/ui/Table';
import { ago, type ApiClient } from '@/modules/platform/types';

/**
 * The keys a church's registration form signs in with.
 *
 * A new key is shown once, here, and never again: only its hash is kept. So
 * the panel that shows it stays open until it is dismissed, and says plainly
 * that this is the only time.
 */
export function Keys({ churchId, clients }: { churchId: string; clients: ApiClient[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<ApiClient | null>(null);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const key = await clientApi<{ id: string; key: string }>(
        `/platform/churches/${churchId}/api-clients`,
        { method: 'POST', body: { name } },
      );
      setMade(key.key);
      setOpen(false);
      setName('');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'It did not work.');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(client: ApiClient) {
    setBusy(true);
    try {
      await clientApi(`/platform/churches/${churchId}/api-clients/${client.id}`, {
        method: 'DELETE',
      });
      setRevoking(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {made && (
        <div className="rounded-[10px] border border-warn-br bg-warn-bg p-4">
          <p className="text-[12.5px] font-semibold text-warn-fg">
            Copy this key now. It is not shown again.
          </p>
          <code className="mt-2 block overflow-x-auto rounded-[7px] border border-border bg-surface px-3 py-2 font-mono text-[12px] text-fg">
            {made}
          </code>
          <p className="mt-2 text-[11.5px] text-warn-fg">
            Put it in the registration form&apos;s REGISTRATION_API_KEY. Only its fingerprint is
            kept here, so a lost key is replaced rather than recovered.
          </p>
          <Button size="sm" variant="secondary" className="mt-2.5" onClick={() => setMade(null)}>
            I have copied it
          </Button>
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}>+ New key</Button>
      </div>

      <Table head={['Key', 'Starts with', 'Made', 'Last used', '']}>
        {clients.map((client) => (
          <Row key={client.id}>
            <Cell>
              <span className="font-medium text-fg">{client.name}</span>
              {client.revokedAt && (
                <span className="ml-2">
                  <Badge tone="muted">Revoked</Badge>
                </span>
              )}
            </Cell>
            <Cell nowrap>
              <code className="font-mono text-[11.5px] text-fg2">{client.keyPrefix}…</code>
            </Cell>
            <Cell nowrap>
              <span className="text-fg2">{ago(client.createdAt)}</span>
            </Cell>
            <Cell nowrap>
              <span className={client.lastUsedAt ? 'text-fg2' : 'text-fg3'}>
                {ago(client.lastUsedAt)}
              </span>
            </Cell>
            <Cell nowrap>
              {!client.revokedAt && (
                <Button size="sm" variant="ghost" onClick={() => setRevoking(client)}>
                  Revoke
                </Button>
              )}
            </Cell>
          </Row>
        ))}
      </Table>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="New registration key"
        description="The form signs in with this key. Name it after where it runs, so you know which to revoke."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton
              type="submit"
              form="new-key"
              loading={busy}
              missing={name.trim().length < 2 ? ['a name'] : []}
            >
              Make the key
            </SubmitButton>
          </>
        }
      >
        <form id="new-key" onSubmit={create} noValidate className="flex flex-col gap-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Input
            label="Name"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            hint='Something like "Registration form on Vercel".'
          />
        </form>
      </Drawer>

      <Dialog
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        title={`Revoke "${revoking?.name}"?`}
        description="Whatever is using it stops working immediately. This cannot be undone — make a new key instead."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRevoking(null)}>
              Keep it
            </Button>
            <Button variant="danger" loading={busy} onClick={() => revoking && revoke(revoking)}>
              Revoke it
            </Button>
          </>
        }
      />
    </div>
  );
}

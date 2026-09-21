'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CatalogItem } from '@irca/shared';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Drawer } from '@/components/ui/Drawer';
import { Input } from '@/components/ui/Input';
import { Can } from '@/lib/session';
import { NewItemDrawer } from '@/modules/finance/components/NewItemDrawer';

type Kind = 'income' | 'expense';
const NOUN = { income: 'income source', expense: 'expense item' } as const;

/** Renaming and turning off, for the people allowed to tidy the lists. */
export function ItemActions({ kind, item }: { kind: Kind; item: CatalogItem }) {
  const router = useRouter();
  const path = kind === 'income' ? 'income-sources' : 'expense-items';
  const [open, setOpen] = useState<'rename' | 'off' | null>(null);
  const [name, setName] = useState(item.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(run: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await run();
      setOpen(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Can permission="finance.catalog.manage">
      <span className="flex justify-end gap-1.5">
        <Button size="sm" variant="secondary" onClick={() => setOpen('rename')}>
          Rename
        </Button>
        {item.isActive ? (
          <Button size="sm" variant="ghost" onClick={() => setOpen('off')}>
            Turn off
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            loading={busy}
            onClick={() =>
              call(() => clientApi(`/finance/${path}/${item.id}/activate`, { method: 'POST' }))
            }
          >
            Turn on
          </Button>
        )}
      </span>

      <Drawer
        open={open === 'rename'}
        onClose={() => setOpen(null)}
        title={`Rename "${item.name}"`}
        description="Past entries will show the new name."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(null)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              disabled={name.trim().length < 2}
              onClick={() =>
                call(() =>
                  clientApi(`/finance/${path}/${item.id}`, { method: 'PATCH', body: { name } }),
                )
              }
            >
              Rename
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
      </Drawer>

      <Dialog
        open={open === 'off'}
        onClose={() => setOpen(null)}
        title={`Turn off "${item.name}"?`}
        description={`It won't be suggested and can't be used for new entries. Its ${item.uses} past ${item.uses === 1 ? 'entry keeps' : 'entries keep'} it.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={() =>
                call(() => clientApi(`/finance/${path}/${item.id}/deactivate`, { method: 'POST' }))
              }
            >
              Turn it off
            </Button>
          </>
        }
      >
        {error && <Alert tone="error">{error}</Alert>}
      </Dialog>
    </Can>
  );
}

/** Adding an item from the page rather than from an entry being recorded. */
export function NewItemButton({ kind }: { kind: Kind }) {
  const router = useRouter();
  const [name, setName] = useState<string | null>(null);
  return (
    <Can permission="finance.catalog.create">
      <Button onClick={() => setName('')}>+ New {NOUN[kind]}</Button>
      <NewItemDrawer
        kind={kind}
        name={name}
        onClose={() => setName(null)}
        onCreated={() => {
          setName(null);
          router.refresh();
        }}
      />
    </Can>
  );
}

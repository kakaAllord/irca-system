'use client';

import { useEffect, useState } from 'react';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Input } from '@/components/ui/Input';

type Item = { id: string; name: string };

const NOUN = { income: 'income source', expense: 'expense item' } as const;

/**
 * Creating an item without leaving the entry being recorded.
 *
 * The server refuses a name close to one that exists, once. That refusal is
 * the useful part of this dialog: it is where "Electricity", "Electricity
 * bill" and "Umeme" stop becoming three items.
 */
export function NewItemDrawer({
  kind,
  name,
  onClose,
  onCreated,
}: {
  kind: 'income' | 'expense';
  /** The name typed in the field, or null when the dialog is closed. */
  name: string | null;
  onClose: () => void;
  onCreated: (item: Item, message?: string) => void;
}) {
  const path = kind === 'income' ? 'income-sources' : 'expense-items';
  const [value, setValue] = useState(name ?? '');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [similar, setSimilar] = useState<Item[] | null>(null);

  useEffect(() => {
    setValue(name ?? '');
    setDescription('');
    setError(null);
    setSimilar(null);
  }, [name]);

  async function create(confirmDistinct: boolean) {
    setBusy(true);
    setError(null);
    try {
      const item = await clientApi<Item>(`/finance/${path}`, {
        method: 'POST',
        body: { name: value, description, confirmDistinct },
      });
      onCreated(item);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        const details = err.details as
          { existing?: Item; inactive?: boolean; candidates?: Item[] } | undefined;
        if (err.code === 'ALREADY_EXISTS' && details?.existing && !details.inactive) {
          // Someone else just created it: use theirs rather than complaining.
          return onCreated(
            details.existing,
            `“${details.existing.name}” already existed. Selected it.`,
          );
        }
        if (err.code === 'SIMILAR_EXISTS' && details?.candidates)
          return setSimilar(details.candidates);
        return setError(err.message);
      }
      setError('Something went wrong. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  }

  if (similar) {
    return (
      <Drawer
        open
        onClose={onClose}
        title="Did you mean one of these?"
        description="Keeping one name for one thing is what makes the reports worth reading."
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="secondary" loading={busy} onClick={() => create(true)}>
              No, “{value}” is different
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap gap-2">
          {similar.map((candidate) => (
            <Button key={candidate.id} variant="secondary" onClick={() => onCreated(candidate)}>
              Use “{candidate.name}”
            </Button>
          ))}
        </div>
      </Drawer>
    );
  }

  return (
    <Drawer
      open={name !== null}
      onClose={onClose}
      title={`New ${NOUN[kind]}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={value.trim().length < 2} onClick={() => create(false)}>
            Create and use
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Input label="Name" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
        <Input
          label="Description"
          hint="Optional. What it covers, for whoever reads this next year."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
    </Drawer>
  );
}

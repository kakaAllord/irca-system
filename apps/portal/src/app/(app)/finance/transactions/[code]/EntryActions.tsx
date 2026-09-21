'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import type { ChangeRequestView, FinanceTransaction, PaymentMethod } from '@irca/shared';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Input } from '@/components/ui/Input';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { useCan } from '@/lib/session';
import { EntryFields, type EntryValues } from '@/modules/finance/components/EntryFields';

type Entry = FinanceTransaction & { openRequest: ChangeRequestView | null };

/**
 * Correcting and voiding, which here means asking.
 *
 * There is no way to change the entry from this page, because there is no
 * endpoint that would: both buttons write a request for an administrator.
 */
export function EntryActions({ entry, currency }: { entry: Entry; currency: string }) {
  const router = useRouter();
  const can = useCan();
  const [open, setOpen] = useState<'edit' | 'void' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [values, setValues] = useState<EntryValues>({
    txnDate: entry.txnDate,
    item: entry.item,
    amount: entry.amount,
    method: entry.method as PaymentMethod,
    reference: entry.reference ?? '',
    counterparty: entry.counterparty ?? '',
    notes: entry.notes ?? '',
  });

  if (!can('finance.transactions.request_change') || entry.status === 'VOIDED') return null;

  if (entry.openRequest) {
    return <span className="text-[12px] text-fg3">A change is already waiting for approval.</span>;
  }

  const kind = entry.kind === 'INCOME' ? 'income' : 'expense';
  const changed = {
    ...(values.txnDate !== entry.txnDate ? { txnDate: values.txnDate } : {}),
    ...(values.item && values.item.id !== entry.item?.id
      ? kind === 'income'
        ? { incomeSourceId: values.item.id }
        : { expenseItemId: values.item.id }
      : {}),
    ...(plain(values.amount) !== entry.amount ? { amount: plain(values.amount) } : {}),
    ...(values.method !== entry.method ? { method: values.method } : {}),
    ...(values.reference !== (entry.reference ?? '') ? { reference: values.reference } : {}),
    ...(values.counterparty !== (entry.counterparty ?? '')
      ? { counterparty: values.counterparty }
      : {}),
    ...(values.notes !== (entry.notes ?? '') ? { notes: values.notes } : {}),
  };
  const movesMonth = values.txnDate.slice(0, 7) !== entry.txnDate.slice(0, 7);

  async function send(action: 'EDIT' | 'VOID') {
    setBusy(true);
    setError(null);
    try {
      await clientApi(`/finance/transactions/${entry.code}/change-requests`, {
        method: 'POST',
        body: { action, proposed: action === 'EDIT' ? changed : {}, reason },
      });
      setOpen(null);
      setReason('');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Menu>
        <MenuButton className="inline-flex h-9 items-center rounded-[7px] border border-border px-3.5 text-[12.5px] font-medium text-fg hover:bg-hover">
          Request a change ▾
        </MenuButton>
        <MenuItems
          anchor="bottom end"
          className="z-20 mt-1 w-56 rounded-[10px] border border-border bg-surface py-1 shadow-xl"
        >
          <MenuItem>
            <button
              type="button"
              onClick={() => setOpen('edit')}
              className="w-full px-3 py-2 text-left text-[12.5px] text-fg data-focus:bg-hover"
            >
              Correct this entry
            </button>
          </MenuItem>
          <MenuItem>
            <button
              type="button"
              onClick={() => setOpen('void')}
              className="w-full px-3 py-2 text-left text-[12.5px] text-fg data-focus:bg-hover"
            >
              Void this entry
            </button>
          </MenuItem>
        </MenuItems>
      </Menu>

      <Drawer
        open={open === 'edit'}
        onClose={() => setOpen(null)}
        title={`Ask to correct ${entry.code}`}
        description="An administrator sees exactly what you propose, and decides."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(null)}>
              Cancel
            </Button>
            <SubmitButton
              loading={busy}
              missing={
                [
                  Object.keys(changed).length === 0 && 'a change to something',
                  reason.trim().length < 5 && 'What was wrong?',
                ].filter(Boolean) as string[]
              }
              onClick={() => void send('EDIT')}
            >
              Send request
            </SubmitButton>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {error && <Alert tone="error">{error}</Alert>}
          <EntryFields
            kind={kind}
            values={values}
            onChange={setValues}
            errors={{}}
            currency={currency}
          />
          {movesMonth && (
            <p className="text-[12px] text-warn-fg">
              This moves the entry to another month. When approved it gets a new number, and this
              one is voided and points to it.
            </p>
          )}
          <Input
            label="What was wrong?"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Typed an extra zero"
          />
        </div>
      </Drawer>

      <Drawer
        open={open === 'void'}
        onClose={() => setOpen(null)}
        title={`Ask to void ${entry.code}?`}
        description="If approved, it keeps its number, stays in the records, and stops counting in the totals. This cannot be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(null)}>
              Cancel
            </Button>
            <SubmitButton
              variant="danger"
              loading={busy}
              missing={reason.trim().length < 5 ? ['Why?'] : []}
              onClick={() => void send('VOID')}
            >
              Send request
            </SubmitButton>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Input
            label="Why?"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Entered twice — duplicate of 000013"
          />
        </div>
      </Drawer>
    </>
  );
}

const plain = (amount: string) => {
  const value = Number(amount.replace(/,/g, ''));
  return Number.isFinite(value) ? value.toFixed(2) : amount;
};

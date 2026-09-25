'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { PAYMENT_METHODS, type PaymentMethod, type PledgePaymentView } from '@irca/shared';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { useCan } from '@/lib/session';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';

/**
 * Correcting or voiding a payment, which here means asking. There is no way
 * to change one from the portal, because there is no endpoint that would:
 * both write a request an administrator decides in Admin → Requests (D17).
 */
export function PaymentActions({ payment }: { payment: PledgePaymentView }) {
  const router = useRouter();
  const can = useCan();
  const [open, setOpen] = useState<'edit' | 'void' | null>(null);
  const [amount, setAmount] = useState(payment.amount);
  const [paidOn, setPaidOn] = useState(payment.paidOn);
  const [method, setMethod] = useState<PaymentMethod>(payment.method);
  const [note, setNote] = useState(payment.note);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!can('finance.pledges.record_payment') || payment.status === 'VOIDED') return null;
  if (payment.openRequest) {
    return (
      <span className="text-[11.5px] text-fg3">
        {payment.openRequest.isMine ? 'You asked' : `${payment.openRequest.requestedBy} asked`} for
        a change
      </span>
    );
  }

  const plain = (v: string) => Number(v.replace(/,/g, '')).toFixed(2);
  const changed = {
    ...(amount.trim() && plain(amount) !== payment.amount ? { amount } : {}),
    ...(paidOn !== payment.paidOn ? { paidOn } : {}),
    ...(method !== payment.method ? { method } : {}),
    ...(note !== payment.note ? { note } : {}),
  };

  async function send(action: 'EDIT' | 'VOID') {
    setBusy(true);
    setError(null);
    try {
      await clientApi(`/finance/pledge-payments/${payment.id}/change-requests`, {
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
        <MenuButton className="text-[12px] text-accent underline">Ask to change</MenuButton>
        <MenuItems
          anchor="bottom end"
          className="z-20 mt-1 w-52 rounded-[10px] border border-border bg-surface py-1 shadow-xl"
        >
          <MenuItem>
            <button
              type="button"
              onClick={() => setOpen('edit')}
              className="w-full px-3 py-2 text-left text-[12.5px] text-fg data-focus:bg-hover"
            >
              Correct this payment
            </button>
          </MenuItem>
          <MenuItem>
            <button
              type="button"
              onClick={() => setOpen('void')}
              className="w-full px-3 py-2 text-left text-[12.5px] text-fg data-focus:bg-hover"
            >
              Void this payment
            </button>
          </MenuItem>
        </MenuItems>
      </Menu>

      <Drawer
        open={open === 'edit'}
        onClose={() => setOpen(null)}
        title="Ask to correct a payment"
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
          <Input
            label="Amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Paid on"
              type="date"
              value={paidOn}
              onChange={(e) => setPaidOn(e.target.value)}
            />
            <Select
              label="Paid by"
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              options={Object.entries(PAYMENT_METHODS).map(([value, label]) => ({ value, label }))}
            />
          </div>
          <Input
            label="Note"
            maxLength={200}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
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
        title="Ask to void this payment?"
        description="If approved, it stays in the records and stops counting towards the pledge. This cannot be undone."
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
            placeholder="Recorded against the wrong person"
          />
        </div>
      </Drawer>
    </>
  );
}

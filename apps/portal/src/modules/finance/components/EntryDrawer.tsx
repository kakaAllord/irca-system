'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { formatMoney, type FinanceTransaction, type PaymentMethod } from '@irca/shared';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Drawer } from '@/components/ui/Drawer';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { EntryFields, type EntryValues } from '@/modules/finance/components/EntryFields';

/** Older than this and the form asks whether the date is really right. */
const OLD_DAYS = 60;

/**
 * Recording an entry, in the panel every other form in the portal uses.
 *
 * It slides in over the page the clerk was reading, which is the point: a
 * stack of receipts is entered against a list of what is already recorded,
 * and sending them to a separate page took that list away.
 *
 * The id that makes a submit idempotent is made once when the drawer opens and
 * again only after a save, so a double-click, or a retry after the connection
 * drops, cannot put the same expense in the books twice.
 */
export function EntryDrawer({
  kind,
  open,
  onClose,
  currency,
  timezone,
}: {
  kind: 'income' | 'expense';
  open: boolean;
  onClose: () => void;
  currency: string;
  timezone: string;
}) {
  const router = useRouter();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
  const blank = (keep?: Partial<EntryValues>): EntryValues => ({
    txnDate: keep?.txnDate ?? today,
    item: null,
    amount: '',
    method: keep?.method ?? 'CASH',
    reference: '',
    counterparty: '',
    notes: '',
  });

  const [values, setValues] = useState<EntryValues>(blank());
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<FinanceTransaction | null>(null);
  const [confirmOld, setConfirmOld] = useState(false);
  const requestId = useRef(crypto.randomUUID());

  const dirty = Boolean(values.item ?? values.amount ?? values.reference ?? values.counterparty);

  // A fresh drawer every time it is opened, and a fresh idempotency key with it.
  useEffect(() => {
    if (!open) return;
    requestId.current = crypto.randomUUID();
    setValues(blank());
    setErrors({});
    setError(null);
    setSaved(null);
    setConfirmOld(false);
    // Deliberately keyed on `open` alone: the blank row depends only on today
    // and the church's clock, neither of which moves while the drawer is open.
  }, [open]);

  // Leaving with something typed asks first. The browser decides the wording.
  useEffect(() => {
    if (!open || !dirty || saved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [open, dirty, saved]);

  async function save() {
    setBusy(true);
    setError(null);
    setErrors({});
    try {
      const entry = await clientApi<FinanceTransaction>('/finance/transactions', {
        method: 'POST',
        body: {
          kind: kind === 'income' ? 'INCOME' : 'EXPENSE',
          ...(kind === 'income'
            ? { incomeSourceId: values.item?.id }
            : { expenseItemId: values.item?.id }),
          txnDate: values.txnDate,
          amount: values.amount,
          method: values.method,
          reference: values.reference || undefined,
          counterparty: values.counterparty || undefined,
          notes: values.notes || undefined,
          clientRequestId: requestId.current,
        },
      });
      setSaved(entry);
      // The page behind the drawer is a list this entry now belongs in.
      router.refresh();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setErrors(err.fieldErrors);
        if (err.code === 'ITEM_NOT_AVAILABLE') setErrors({ item: [err.message] });
        else if (Object.keys(err.fieldErrors).length === 0) setError(err.message);
      } else {
        setError('Something went wrong. Try again in a moment.');
      }
    } finally {
      setBusy(false);
      setConfirmOld(false);
    }
  }

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!values.item) {
      return setErrors({
        item: [
          `Choose ${kind === 'income' ? 'an income source' : 'an expense item'} from the list, or create it.`,
        ],
      });
    }
    if (daysAgo(values.txnDate) > OLD_DAYS) return setConfirmOld(true);
    void save();
  }

  /** Asking before throwing away something half typed. */
  function close() {
    if (!saved && dirty && !window.confirm('Leave without saving this entry?')) return;
    onClose();
  }

  const title = kind === 'income' ? 'Record income' : 'Record an expense';

  if (saved) {
    return (
      <Drawer
        open={open}
        onClose={onClose}
        title={title}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Done
            </Button>
            <Button
              onClick={() => {
                // Clerks enter a stack of receipts from one day, so the date and
                // the method stay and the rest is cleared.
                requestId.current = crypto.randomUUID();
                setValues(blank({ txnDate: saved.txnDate, method: saved.method as PaymentMethod }));
                setSaved(null);
              }}
            >
              Record another {kind === 'income' ? 'income' : 'expense'}
            </Button>
          </>
        }
      >
        <div className="rounded-[12px] border border-pos-br bg-pos-bg p-5">
          <p className="text-[14px] font-semibold text-pos">✓ Saved as {saved.code}</p>
          <p className="mt-1 text-[12.5px] text-fg2">
            {saved.item?.name} · {formatMoney(saved.amount, currency)} ·{' '}
            {new Date(`${saved.txnDate}T00:00:00Z`).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              timeZone: 'UTC',
            })}
          </p>
          <Link
            href={`/finance/transactions/${saved.code}`}
            className="mt-4 inline-flex h-9 items-center rounded-[7px] border border-border px-3.5 text-[12.5px] font-medium text-fg hover:bg-hover"
          >
            View entry
          </Link>
        </div>
      </Drawer>
    );
  }

  return (
    <>
      <Drawer
        open={open}
        onClose={close}
        title={title}
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <SubmitButton
              loading={busy}
              missing={
                [
                  !values.txnDate && 'Date',
                  !values.item && (kind === 'income' ? 'Income source' : 'Expense item'),
                  !values.amount.trim() && 'Amount',
                ].filter(Boolean) as string[]
              }
              onClick={() => submit()}
            >
              Save {kind === 'income' ? 'income' : 'expense'}
            </SubmitButton>
          </>
        }
      >
        <form onSubmit={submit} noValidate className="flex flex-col gap-5">
          {error && <Alert tone="error">{error}</Alert>}
          <EntryFields
            kind={kind}
            values={values}
            onChange={setValues}
            errors={errors}
            currency={currency}
          />
          {/* Enter in any field saves, the same as pressing the button. */}
          <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
        </form>
      </Drawer>

      <Dialog
        open={confirmOld}
        onClose={() => setConfirmOld(false)}
        title="Is this date right?"
        description={`This entry is dated ${longDate(values.txnDate)}, more than ${OLD_DAYS} days ago. It will be numbered as a ${monthName(values.txnDate)} entry.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOld(false)}>
              Change the date
            </Button>
            <Button loading={busy} onClick={() => void save()}>
              Save it
            </Button>
          </>
        }
      />
    </>
  );
}

const daysAgo = (date: string) =>
  Math.floor((Date.now() - new Date(`${date}T00:00:00Z`).getTime()) / 86_400_000);

const longDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

const monthName = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });

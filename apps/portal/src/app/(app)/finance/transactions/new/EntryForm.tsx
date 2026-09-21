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
import { EntryFields, type EntryValues } from '@/modules/finance/components/EntryFields';

/** Older than this and the form asks whether the date is really right. */
const OLD_DAYS = 60;

/**
 * Recording an entry.
 *
 * The id that makes a submit idempotent is made once when the form opens and
 * again only after a save, so a double-click, or a retry after the connection
 * drops, cannot put the same expense in the books twice.
 */
export function EntryForm({
  kind,
  currency,
  timezone,
}: {
  kind: 'income' | 'expense';
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

  // Leaving with something typed asks first. The browser decides the wording.
  useEffect(() => {
    if (!dirty || saved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, saved]);

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

  function onSubmit(e: FormEvent) {
    e.preventDefault();
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

  if (saved) {
    return (
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
        <div className="mt-4 flex flex-wrap gap-2">
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
          <Link
            href={`/finance/transactions/${saved.code}`}
            className="inline-flex h-9 items-center rounded-[7px] border border-border px-3.5 text-[12.5px] font-medium text-fg hover:bg-hover"
          >
            View entry
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {error && <Alert tone="error">{error}</Alert>}

      <EntryFields
        kind={kind}
        values={values}
        onChange={setValues}
        errors={errors}
        currency={currency}
      />

      <div className="flex justify-end gap-2">
        <Link
          href="/finance/transactions"
          className="inline-flex h-9 items-center rounded-[7px] px-3.5 text-[12.5px] font-medium text-fg2 hover:bg-hover"
        >
          Cancel
        </Link>
        <Button type="submit" loading={busy}>
          Save {kind === 'income' ? 'income' : 'expense'}
        </Button>
      </div>

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
    </form>
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

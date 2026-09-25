'use client';

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  PAYMENT_METHODS,
  formatMoney,
  type FinanceTransaction,
  type PaymentMethod,
  type PledgeView,
} from '@irca/shared';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { useCan } from '@/lib/session';
import { cn } from '@/lib/cn';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Input } from '@/components/ui/Input';
import { RequiredMark } from '@/components/ui/RequiredMark';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';

/**
 * Recording money brought in against a pledge.
 *
 * Opened from a pledge, it records against that one. Opened without one —
 * how a clerk works — it first finds the person paying by name or number and
 * shows only their open pledges, never the list of everyone who owes.
 *
 * It offers the income entries of the last two months, so the payment can
 * point at the entry that recorded the same money and the books and the
 * pledge agree.
 */
export function PaymentDrawer({
  pledge,
  currency,
  timezone,
  label = '+ Record a payment',
  variant = 'primary',
}: {
  pledge?: PledgeView;
  currency: string;
  timezone: string;
  label?: string;
  variant?: 'primary' | 'secondary';
}) {
  const router = useRouter();
  const can = useCan();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<PledgeView | null>(pledge ?? null);
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState(today);
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [transactionId, setTransactionId] = useState('');
  const [note, setNote] = useState('');
  const [entries, setEntries] = useState<FinanceTransaction[] | null>(null);
  const [clientRequestId, setClientRequestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [round, setRound] = useState(0);

  const mayLink = can('finance.transactions.read');
  useEffect(() => {
    if (!open || !mayLink || entries) return;
    const from = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
    clientApi<{ rows: FinanceTransaction[] }>(
      `/finance/transactions?kind=INCOME&status=POSTED&from=${from}&pageSize=100`,
    )
      .then((r) => setEntries(r.rows))
      .catch(() => setEntries([]));
  }, [open, mayLink, entries]);

  function start() {
    setChosen(pledge ?? null);
    setAmount('');
    setPaidOn(today);
    setMethod('CASH');
    setTransactionId('');
    setNote('');
    setError(null);
    setDone(null);
    setClientRequestId(crypto.randomUUID());
    setOpen(true);
  }

  async function save() {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    try {
      const result = await clientApi<{ status: string; balance: string }>(
        `/finance/pledges/${chosen.id}/payments`,
        {
          method: 'POST',
          body: {
            amount,
            paidOn,
            method,
            transactionId: transactionId || null,
            note,
            clientRequestId,
          },
        },
      );
      router.refresh();
      if (pledge) {
        setOpen(false);
      } else {
        // The clerk usually has the next person waiting: say it worked, and
        // leave the drawer ready for them.
        setDone(
          result.status === 'COMPLETED'
            ? `Recorded. ${whose(chosen, 'Their')} pledge towards ${chosen.campaign.name} is paid in full.`
            : `Recorded. ${formatMoney(result.balance, currency)} is left on ${whose(chosen, 'their')} pledge towards ${chosen.campaign.name}.`,
        );
        setChosen(null);
        // A fresh search: the balances in the last one are out of date now.
        setRound((n) => n + 1);
        setAmount('');
        setTransactionId('');
        setNote('');
        setClientRequestId(crypto.randomUUID());
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const missing = [
    !chosen && 'Whose pledge',
    !amount.trim() && 'Amount',
    !paidOn && 'Paid on',
  ].filter(Boolean) as string[];

  return (
    <>
      <Button variant={variant} onClick={start}>
        {label}
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={
          pledge
            ? `A payment from ${pledge.person?.name ?? 'someone'}`
            : 'A payment towards a pledge'
        }
        description="Money brought in against what they promised. It cannot be changed afterwards except by asking an administrator."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {done ? 'Done' : 'Cancel'}
            </Button>
            <SubmitButton loading={busy} missing={missing} onClick={save}>
              Record payment
            </SubmitButton>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {done && <Alert tone="info">{done}</Alert>}
          {pledge ? (
            <Owed pledge={pledge} currency={currency} />
          ) : (
            <PledgeLookup key={round} chosen={chosen} onChoose={setChosen} currency={currency} />
          )}
          <Input
            label="Amount"
            required
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="50,000"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Paid on"
              type="date"
              required
              max={today}
              value={paidOn}
              onChange={(e) => setPaidOn(e.target.value)}
            />
            <Select
              label="Paid by"
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              options={Object.entries(PAYMENT_METHODS).map(([value, l]) => ({ value, label: l }))}
            />
          </div>
          {mayLink && (
            <Select
              label="The income entry it was recorded in (optional)"
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value)}
              options={[
                { value: '', label: entries ? 'Not linked' : 'Loading entries…' },
                ...(entries ?? []).map((t) => ({
                  value: t.id,
                  label: `${t.code} · ${shortDay(t.txnDate)} · ${t.item?.name ?? ''} · ${formatMoney(t.amount, '')}`,
                })),
              ]}
            />
          )}
          <Input
            label="Note (optional)"
            maxLength={200}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {error && <Alert tone="error">{error}</Alert>}
        </div>
      </Drawer>
    </>
  );
}

function Owed({ pledge, currency }: { pledge: PledgeView; currency: string }) {
  return (
    <p className="rounded-[7px] border border-border bg-surface2 px-3 py-2 text-[12.5px] text-fg2">
      Promised {formatMoney(pledge.amount, currency)} towards {pledge.campaign.name}; paid{' '}
      {formatMoney(pledge.paid, currency)}.{' '}
      <span className="font-medium text-fg">{formatMoney(pledge.balance, currency)} left.</span>
    </p>
  );
}

/**
 * The person paying, found by name or number, and their open pledges. What
 * comes back is theirs alone: the API answers a search, never a list.
 */
function PledgeLookup({
  chosen,
  onChoose,
  currency,
}: {
  chosen: PledgeView | null;
  onChoose: (p: PledgeView | null) => void;
  currency: string;
}) {
  const id = useId();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PledgeView[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      clientApi<PledgeView[]>(`/finance/pledges/lookup?q=${encodeURIComponent(term)}`, {
        signal: controller.signal,
      })
        .then((found) => {
          setResults(found);
          setFailed(false);
        })
        .catch((err: unknown) => {
          if ((err as Error).name !== 'AbortError') setFailed(true);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  if (chosen) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium text-fg2">
          Whose pledge
          <RequiredMark />
        </span>
        <div className="flex items-center justify-between gap-3 rounded-[7px] border border-accent-br bg-chip px-3 py-2">
          <span className="flex min-w-0 flex-col">
            <span className="text-[13px] font-medium text-fg">
              {chosen.person?.name} · {chosen.campaign.name}
            </span>
            <span className="text-[11.5px] text-fg3">
              {formatMoney(chosen.balance, currency)} left of {formatMoney(chosen.amount, currency)}{' '}
              ·{' '}
              <Link
                href={`/finance/pledges/${chosen.campaign.id}/${chosen.id}`}
                className="text-accent underline"
              >
                its payments
              </Link>
            </span>
          </span>
          <button
            type="button"
            onClick={() => onChoose(null)}
            className="text-[12px] text-accent underline"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[12px] font-medium text-fg2">
        Whose pledge
        <RequiredMark />
      </label>
      <input
        id={id}
        type="search"
        autoFocus
        autoComplete="off"
        placeholder="Type the name or phone number of the person paying"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className={cn(
          'h-9 w-full rounded-[7px] border border-border bg-input px-3 text-[13px] text-fg placeholder:text-fg3',
          'focus:border-accent focus:ring-2 focus:ring-accent-br focus:outline-none',
        )}
      />
      {failed && <p className="text-[11.5px] text-danger">The search did not work. Try again.</p>}
      {results && results.length === 0 && (
        <p className="text-[11.5px] text-fg3">Nobody by that name or number has an open pledge.</p>
      )}
      {results && results.length > 0 && (
        <ul className="flex max-h-72 flex-col overflow-y-auto rounded-[7px] border border-border">
          {results.map((p) => (
            <li key={p.id} className="border-b border-border last:border-b-0">
              <button
                type="button"
                onClick={() => onChoose(p)}
                className="flex w-full flex-col px-3 py-2 text-left hover:bg-hover"
              >
                <span className="text-[12.5px] font-medium text-fg">
                  {p.person?.name} · {p.campaign.name}
                </span>
                <span className="text-[11.5px] text-fg3">
                  {[
                    p.person?.phoneTail && `phone ${p.person.phoneTail}`,
                    `${formatMoney(p.balance, currency)} left`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "Neema Mollel's", or the word given for someone erased. */
const whose = (p: PledgeView, otherwise: string) => (p.person ? `${p.person.name}'s` : otherwise);

const shortDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

import type { Metadata } from 'next';
import Link from 'next/link';
import {
  PAYMENT_METHODS,
  formatMoney,
  type ChangeRequestView,
  type FinanceTransaction,
  type MeResponse,
} from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { ForbiddenState } from '@/components/shell/States';
import { Badge } from '@/components/ui/Badge';
import { EntryActions } from './EntryActions';

export const metadata: Metadata = { title: 'Entry' };

type Detail = FinanceTransaction & { openRequest: ChangeRequestView | null };
type HistoryLine = { id: string; at: string; who: string; action: string; summary: string | null };

/**
 * One entry, in full, and the only way to change it: asking.
 *
 * Nothing on this page is editable, for anyone, including administrators.
 * The menu sends a request; an administrator decides it in Admin → Requests.
 */
export default async function EntryPage({ params }: { params: Promise<{ code: string }> }) {
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'finance.transactions.read')) return <ForbiddenState what="finance entries" />;

  const { code } = await params;
  const [entry, history] = await Promise.all([
    serverApi<Detail>(`/finance/transactions/${code}`),
    serverApi<HistoryLine[]>(`/finance/transactions/${code}/history`),
  ]);
  const currency = me.church?.currency ?? 'TZS';

  return (
    <div className="max-w-3xl">
      <Link href="/finance/transactions" className="text-[12px] text-fg3 hover:text-fg">
        ← Transactions
      </Link>

      <PageHeader
        title={entry.code}
        subtitle={`${entry.kind === 'INCOME' ? 'Income' : 'Expense'} · ${entry.item?.name ?? ''} · ${formatMoney(entry.amount, currency)}`}
        actions={
          <>
            {entry.status === 'VOIDED' ? (
              <Badge tone="muted">Voided</Badge>
            ) : (
              <Badge tone="positive">Posted</Badge>
            )}
            <EntryActions entry={entry} currency={currency} />
          </>
        }
      />

      {entry.openRequest && (
        <div className="mb-4 rounded-[10px] border border-warn-br bg-warn-bg px-4 py-3">
          <p className="text-[12.5px] text-warn-fg">
            {entry.openRequest.isMine
              ? 'You asked'
              : `${entry.openRequest.requestedBy.fullName} asked`}{' '}
            for a change — waiting for an administrator.
            {entry.openRequest.changes.map((c) => ` ${c.label} ${c.from} → ${c.to}.`)}
          </p>
        </div>
      )}

      {entry.status === 'VOIDED' && (
        <div className="mb-4 rounded-[10px] border border-border bg-surface2 px-4 py-3 text-[12.5px] text-fg2">
          Voided{entry.voidedBy && ` by ${entry.voidedBy.fullName}`}
          {entry.voidReason && `: ${entry.voidReason}`}
          {entry.replacedByCode && (
            <>
              {' '}
              <Link
                href={`/finance/transactions/${entry.replacedByCode}`}
                className="font-mono text-accent underline"
              >
                {entry.replacedByCode}
              </Link>
            </>
          )}
        </div>
      )}

      {entry.replacesCode && (
        <p className="mb-4 text-[12.5px] text-fg2">
          Replaces{' '}
          <Link
            href={`/finance/transactions/${entry.replacesCode}`}
            className="font-mono text-accent underline"
          >
            {entry.replacesCode}
          </Link>
        </p>
      )}

      <dl className="grid grid-cols-[130px_1fr] gap-y-2 rounded-[10px] border border-border bg-surface p-4 text-[12.5px]">
        <Line label="Date" value={longDate(entry.txnDate)} />
        <Line
          label={entry.kind === 'INCOME' ? 'Received by' : 'Paid by'}
          value={PAYMENT_METHODS[entry.method]}
        />
        <Line label="Reference" value={entry.reference ?? '—'} />
        <Line
          label={entry.kind === 'INCOME' ? 'Received from' : 'Paid to'}
          value={entry.counterparty ?? '—'}
        />
        <Line label="Notes" value={entry.notes ?? '—'} />
        <Line
          label="Recorded by"
          value={`${entry.recordedBy?.fullName ?? 'Someone'} · ${longDate(entry.recordedAt.slice(0, 10))}`}
        />
        <Line label="Revision" value={String(entry.revision)} />
      </dl>

      <section className="mt-5">
        <h2 className="mb-2 text-[13px] font-semibold text-fg">History</h2>
        <ol className="flex flex-col gap-1.5 rounded-[10px] border border-border bg-surface p-4 text-[12.5px]">
          {history.map((line) => (
            <li key={line.id} className="flex flex-wrap gap-2">
              <span className="text-fg3">{when(line.at)}</span>
              <span className="text-fg2">{line.summary ?? line.action}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-fg3">{label}</dt>
      <dd className="text-fg">{value}</dd>
    </>
  );
}

const longDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

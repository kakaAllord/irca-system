import type { Metadata } from 'next';
import Link from 'next/link';
import {
  PAYMENT_METHODS,
  PLEDGE_RHYTHMS,
  PLEDGE_STATUS_LABEL,
  formatMoney,
  type MeResponse,
  type PledgeDetail,
} from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { ForbiddenState } from '@/components/shell/States';
import { Badge } from '@/components/ui/Badge';
import { Cell, Row, Table } from '@/components/ui/Table';
import { CancelPledge } from '@/modules/finance/pledges/CancelPledge';
import { PaymentActions } from '@/modules/finance/pledges/PaymentActions';
import { PaymentDrawer } from '@/modules/finance/pledges/PaymentDrawer';

export const metadata: Metadata = { title: 'Pledge' };

/**
 * One pledge: what was promised, every payment against it, and what is
 * left. Nothing on it is edited in place; a payment is corrected by asking.
 */
export default async function PledgePage({
  params,
}: {
  params: Promise<{ campaignId: string; pledgeId: string }>;
}) {
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'finance.pledges.read_sensitive') && !can(me, 'finance.pledges.record_payment')) {
    return <ForbiddenState what="this pledge" />;
  }

  const { pledgeId } = await params;
  const pledge = await serverApi<PledgeDetail>(`/finance/pledges/${pledgeId}`);
  const currency = me.church?.currency ?? 'TZS';
  const timezone = me.church?.timezone ?? 'UTC';
  const name = pledge.person?.name ?? 'Someone erased';

  return (
    <div className="max-w-3xl">
      <Link
        href={
          can(me, 'finance.pledges.read')
            ? `/finance/pledges/${pledge.campaign.id}`
            : '/finance/pledges'
        }
        className="text-[12px] text-fg3 hover:text-fg"
      >
        ← {pledge.campaign.name}
      </Link>
      <PageHeader
        title={name}
        subtitle={`Pledged ${formatMoney(pledge.amount, currency)} towards ${pledge.campaign.name}`}
        actions={
          <>
            {pledge.overdue ? (
              <Badge tone="danger">Overdue</Badge>
            ) : (
              <Badge
                tone={
                  pledge.status === 'COMPLETED'
                    ? 'positive'
                    : pledge.status === 'CANCELLED'
                      ? 'muted'
                      : 'accent'
                }
              >
                {PLEDGE_STATUS_LABEL[pledge.status]}
              </Badge>
            )}
            {pledge.status === 'OPEN' && can(me, 'finance.pledges.manage') && (
              <CancelPledge pledgeId={pledge.id} name={name} />
            )}
            {pledge.status === 'OPEN' && can(me, 'finance.pledges.record_payment') && (
              <PaymentDrawer pledge={pledge} currency={currency} timezone={timezone} />
            )}
          </>
        }
      />

      {pledge.status === 'CANCELLED' && (
        <p className="mb-4 rounded-[10px] border border-border bg-surface2 px-4 py-3 text-[12.5px] text-fg2">
          Cancelled{pledge.cancelReason && `: ${pledge.cancelReason}`}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Figure label="Promised" value={formatMoney(pledge.amount, currency)} />
        <Figure label="Paid" value={formatMoney(pledge.paid, currency)} />
        <Figure
          label={
            pledge.status === 'CANCELLED'
              ? 'Released from'
              : Number(pledge.balance) < 0
                ? 'Given beyond it'
                : 'Left'
          }
          value={formatMoney(pledge.balance.replace('-', ''), currency)}
        />
      </div>

      <dl className="mt-4 grid grid-cols-[130px_1fr] gap-y-2 rounded-[10px] border border-border bg-surface p-4 text-[12.5px]">
        <dt className="text-fg3">Promised on</dt>
        <dd className="text-fg">{day(pledge.promisedOn)}</dd>
        <dt className="text-fg3">How</dt>
        <dd className="text-fg">{PLEDGE_RHYTHMS[pledge.rhythm]}</dd>
        <dt className="text-fg3">To be paid by</dt>
        <dd className={pledge.overdue ? 'text-warn-fg' : 'text-fg'}>
          {pledge.dueOn ? day(pledge.dueOn) : '—'}
        </dd>
        <dt className="text-fg3">Phone</dt>
        <dd className="text-fg">{pledge.person?.phoneTail || '—'}</dd>
        <dt className="text-fg3">Note</dt>
        <dd className="text-fg">{pledge.note || '—'}</dd>
        <dt className="text-fg3">Recorded by</dt>
        <dd className="text-fg">{pledge.recordedBy ?? '—'}</dd>
      </dl>

      <section className="mt-5">
        <h2 className="mb-2 text-[13px] font-semibold text-fg">Payments</h2>
        {pledge.payments.length === 0 ? (
          <p className="text-[12.5px] text-fg3">Nothing paid yet.</p>
        ) : (
          <Table head={['Paid on', 'Amount', 'By', 'Income entry', 'Recorded by', '']}>
            {pledge.payments.map((p) => (
              <Row key={p.id}>
                <Cell nowrap>{day(p.paidOn)}</Cell>
                <Cell nowrap>
                  <span
                    className={`tabular-nums ${p.status === 'VOIDED' ? 'text-fg3 line-through' : ''}`}
                  >
                    {formatMoney(p.amount, '')}
                  </span>
                  {p.status === 'VOIDED' && (
                    <span className="ml-2" title={p.voidReason ?? undefined}>
                      <Badge tone="muted">Voided</Badge>
                    </span>
                  )}
                </Cell>
                <Cell nowrap>{PAYMENT_METHODS[p.method]}</Cell>
                <Cell nowrap>
                  {p.transaction ? (
                    can(me, 'finance.transactions.read') ? (
                      <Link
                        href={`/finance/transactions/${p.transaction.code}`}
                        className="font-mono text-[12px] text-accent"
                      >
                        {p.transaction.code}
                      </Link>
                    ) : (
                      <span className="font-mono text-[12px]">{p.transaction.code}</span>
                    )
                  ) : (
                    '—'
                  )}
                </Cell>
                <Cell>{p.recordedBy ?? '—'}</Cell>
                <Cell nowrap>
                  <PaymentActions payment={p} />
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </section>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-border bg-surface p-3.5">
      <p className="text-[11px] font-semibold tracking-wide text-fg3 uppercase">{label}</p>
      <p className="mt-1 text-[17px] font-semibold tabular-nums text-fg">{value}</p>
    </div>
  );
}

const day = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

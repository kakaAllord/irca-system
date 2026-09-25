import type { Metadata } from 'next';
import Link from 'next/link';
import {
  PLEDGE_FILTERS,
  PLEDGE_RHYTHMS,
  PLEDGE_STATUS_LABEL,
  formatMoney,
  type MeResponse,
  type PledgeCampaignView,
  type PledgeFilter,
  type PledgeView,
} from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { EmptyState, ForbiddenState } from '@/components/shell/States';
import { Badge } from '@/components/ui/Badge';
import { Cell, Row, Table } from '@/components/ui/Table';
import { CampaignDrawer } from '@/modules/finance/pledges/CampaignDrawer';
import { PaymentDrawer } from '@/modules/finance/pledges/PaymentDrawer';
import { PledgeDrawer } from '@/modules/finance/pledges/PledgeDrawer';
import { PledgeFilters } from '@/modules/finance/pledges/PledgeFilters';
import { Progress } from '@/modules/finance/pledges/Progress';

export const metadata: Metadata = { title: 'Campaign' };

/**
 * One campaign: its totals for everyone in Pledges, and — only for those
 * holding the sensitive permission — its pledges, largest owed first.
 */
export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'finance.pledges.read')) return <ForbiddenState what="pledges" />;

  const { campaignId } = await params;
  const query = await searchParams;
  const filter: PledgeFilter = (PLEDGE_FILTERS as readonly string[]).includes(query.filter ?? '')
    ? (query.filter as PledgeFilter)
    : 'open';
  const seesNames = can(me, 'finance.pledges.read_sensitive');

  const list = new URLSearchParams({ filter });
  if (query.q) list.set('q', query.q);
  const [campaign, pledges] = await Promise.all([
    serverApi<PledgeCampaignView>(`/finance/pledge-campaigns/${campaignId}`),
    seesNames
      ? serverApi<PledgeView[]>(`/finance/pledge-campaigns/${campaignId}/pledges?${list}`)
      : Promise.resolve(null),
  ]);
  const currency = me.church?.currency ?? 'TZS';
  const timezone = me.church?.timezone ?? 'UTC';
  const counts = campaign.counts;

  return (
    <>
      <Link href="/finance/pledges" className="text-[12px] text-fg3 hover:text-fg">
        ← Pledges
      </Link>
      <PageHeader
        title={campaign.name}
        subtitle={
          campaign.isActive
            ? 'Taking pledges.'
            : 'Closed to new pledges. What was promised can still be paid.'
        }
        actions={
          <>
            {can(me, 'finance.pledges.manage') && (
              <CampaignDrawer campaign={campaign} timezone={timezone} />
            )}
            {can(me, 'finance.pledges.record_payment') && (
              <PaymentDrawer currency={currency} timezone={timezone} variant="secondary" />
            )}
            {can(me, 'finance.pledges.manage') && campaign.isActive && (
              <PledgeDrawer campaign={campaign} timezone={timezone} />
            )}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Promised" value={formatMoney(campaign.promised, currency)} />
        <Tile label="Received" value={formatMoney(campaign.received, currency)} />
        <Tile label="Still owed" value={formatMoney(campaign.outstanding, currency)} />
        <Tile
          label="Target"
          value={campaign.targetAmount ? formatMoney(campaign.targetAmount, currency) : 'None set'}
        />
      </div>
      <div className="mt-4 rounded-[10px] border border-border bg-surface p-4">
        <Progress campaign={campaign} currency={currency} />
      </div>

      {pledges === null ? (
        <p className="mt-5 rounded-[10px] border border-border bg-surface2 px-4 py-3 text-[12.5px] text-fg2">
          {counts.open} open, {counts.overdue} overdue, {counts.completed} paid in full,{' '}
          {counts.cancelled} cancelled. Who pledged, and what each person owes, is kept for the
          finance manager and the pastors.
          {can(me, 'finance.pledges.record_payment') &&
            ' To record a payment, find the person paying with "Record a payment".'}
        </p>
      ) : (
        <section className="mt-5 flex flex-col gap-3">
          <PledgeFilters
            path={`/finance/pledges/${campaignId}`}
            counts={{
              open: counts.open,
              overdue: counts.overdue,
              completed: counts.completed,
              cancelled: counts.cancelled,
            }}
          />
          {pledges.length === 0 ? (
            <EmptyState title="No pledges here">
              {query.q ? 'Nobody by that name.' : 'None in this list yet.'}
            </EmptyState>
          ) : (
            <Table head={['Who', 'Promised', 'Paid', 'Left', 'How', 'Due', '']}>
              {pledges.map((p) => (
                <Row key={p.id}>
                  <Cell>
                    <Link
                      href={`/finance/pledges/${campaignId}/${p.id}`}
                      className="font-medium text-accent"
                    >
                      {p.person?.name ?? 'Erased'}
                    </Link>
                  </Cell>
                  <Cell nowrap>
                    <span className="tabular-nums">{formatMoney(p.amount, '')}</span>
                  </Cell>
                  <Cell nowrap>
                    <span className="tabular-nums">{formatMoney(p.paid, '')}</span>
                  </Cell>
                  <Cell nowrap>
                    <span className="font-medium tabular-nums">
                      {Number(p.balance) > 0 ? formatMoney(p.balance, '') : '—'}
                    </span>
                  </Cell>
                  <Cell nowrap>{PLEDGE_RHYTHMS[p.rhythm]}</Cell>
                  <Cell nowrap>
                    <span className={p.overdue ? 'text-warn-fg' : ''}>
                      {p.dueOn ? day(p.dueOn) : '—'}
                    </span>
                  </Cell>
                  <Cell nowrap>
                    {p.overdue ? (
                      <Badge tone="danger">Overdue</Badge>
                    ) : p.status === 'OPEN' ? null : (
                      <Badge tone={p.status === 'COMPLETED' ? 'positive' : 'muted'}>
                        {PLEDGE_STATUS_LABEL[p.status]}
                      </Badge>
                    )}
                  </Cell>
                </Row>
              ))}
            </Table>
          )}
        </section>
      )}
    </>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-border bg-surface p-3.5">
      <p className="text-[11px] font-semibold tracking-wide text-fg3 uppercase">{label}</p>
      <p className="mt-1 text-[19px] font-semibold tabular-nums text-fg">{value}</p>
    </div>
  );
}

const day = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

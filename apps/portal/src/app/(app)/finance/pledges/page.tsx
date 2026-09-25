import type { Metadata } from 'next';
import Link from 'next/link';
import { formatMoney, type MeResponse, type PledgeCampaignView } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { EmptyState, ForbiddenState } from '@/components/shell/States';
import { Badge } from '@/components/ui/Badge';
import { CampaignDrawer } from '@/modules/finance/pledges/CampaignDrawer';
import { PaymentDrawer } from '@/modules/finance/pledges/PaymentDrawer';
import { Progress } from '@/modules/finance/pledges/Progress';

export const metadata: Metadata = { title: 'Pledges' };

/**
 * Every campaign, and how it is going: what was promised and what came in.
 * Totals only; who owes what is one level down, for those allowed to see it.
 */
export default async function PledgesPage() {
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'finance.pledges.read')) return <ForbiddenState what="pledges" />;

  const campaigns = await serverApi<PledgeCampaignView[]>('/finance/pledge-campaigns');
  const currency = me.church?.currency ?? 'TZS';
  const timezone = me.church?.timezone ?? 'UTC';

  return (
    <>
      <PageHeader
        title="Pledges"
        subtitle="What people promised towards each campaign, and what has come in."
        actions={
          <>
            {can(me, 'finance.pledges.record_payment') && campaigns.length > 0 && (
              <PaymentDrawer
                currency={currency}
                timezone={timezone}
                variant={can(me, 'finance.pledges.manage') ? 'secondary' : 'primary'}
              />
            )}
            {can(me, 'finance.pledges.manage') && <CampaignDrawer timezone={timezone} />}
          </>
        }
      />

      {campaigns.length === 0 ? (
        <EmptyState title="No campaigns yet">
          {can(me, 'finance.pledges.manage')
            ? 'Open one for whatever the church is raising for, then record the pledges made towards it.'
            : 'The finance manager opens a campaign before pledges can be recorded.'}
        </EmptyState>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {campaigns.map((c) => (
            <li key={c.id}>
              <Link
                href={`/finance/pledges/${c.id}`}
                className="flex h-full flex-col gap-3 rounded-[10px] border border-border bg-surface p-4 hover:border-accent-br"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="flex flex-col">
                    <span className="text-[14px] font-semibold text-fg">{c.name}</span>
                    <span className="text-[11.5px] text-fg3">{span(c.startsOn, c.endsOn)}</span>
                  </span>
                  {!c.isActive && <Badge tone="muted">Closed</Badge>}
                </span>
                <Progress campaign={c} currency={currency} />
                <span className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-fg2">
                  <span>
                    <span className="font-medium text-fg tabular-nums">
                      {formatMoney(c.outstanding, currency)}
                    </span>{' '}
                    still owed
                  </span>
                  <span>{c.counts.open} open</span>
                  {c.counts.overdue > 0 && (
                    <span className="text-warn-fg">{c.counts.overdue} overdue</span>
                  )}
                  <span>{c.counts.completed} paid in full</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

const month = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
const span = (from: string, to: string | null) =>
  to ? `${month(from)} – ${month(to)}` : `From ${month(from)}`;

import { formatMoney, type PledgeCampaignView } from '@irca/shared';

/**
 * A campaign's progress as one bar: what came in, against the target when
 * there is one, otherwise against what was promised. CSS, like the finance
 * overview's bars: two numbers and a rectangle do not need a chart library.
 */
export function Progress({
  campaign,
  currency,
}: {
  campaign: PledgeCampaignView;
  currency: string;
}) {
  const goal = campaign.targetAmount ?? campaign.promised;
  const share = (part: string) =>
    Number(goal) > 0 ? Math.min(100, Math.round((Number(part) / Number(goal)) * 100)) : 0;
  const received = share(campaign.received);
  const promised = share(campaign.promised);

  return (
    <div className="flex flex-col gap-1.5">
      <span
        className="relative h-2.5 overflow-hidden rounded-full bg-chip"
        role="img"
        aria-label={`${received}% received${campaign.targetAmount ? ' of the target' : ' of what was promised'}`}
      >
        {campaign.targetAmount && (
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-neutral-bar opacity-40"
            style={{ width: `${promised}%` }}
          />
        )}
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-pos"
          style={{ width: `${Math.max(received, received > 0 ? 2 : 0)}%` }}
        />
      </span>
      <span className="flex flex-wrap justify-between gap-x-3 text-[11.5px] text-fg3">
        <span>
          <span className="font-medium text-fg tabular-nums">
            {formatMoney(campaign.received, currency)}
          </span>{' '}
          received · {formatMoney(campaign.promised, currency)} promised
        </span>
        <span>
          {campaign.targetAmount
            ? `${received}% of ${formatMoney(campaign.targetAmount, currency)}`
            : 'No target'}
        </span>
      </span>
    </div>
  );
}

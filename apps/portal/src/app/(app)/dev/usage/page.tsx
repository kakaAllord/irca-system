import type { Metadata } from 'next';
import { serverApi } from '@/lib/api/server';
import { LineChart } from '@/modules/dev/components/Charts';
import { Figure, Panel } from '@/modules/dev/components/Figure';
import { bytes, daysAgo, latest, number, total, type Series } from '@/modules/dev/types';

export const metadata: Metadata = { title: 'Usage' };

/** The portals whose requests are worth a line each; the rest is sign-in and plumbing. */
const MODULES: Record<string, string> = {
  'api.requests.membership': 'Membership',
  'api.requests.finance': 'Finance',
  'api.requests.admin': 'Admin',
  'api.requests.public': 'Registration form',
};

/** The figures a developer looks at first, and ninety days of the three that move. */
export default async function UsageOverviewPage() {
  const [week, month, quarter] = await Promise.all([
    serverApi<Series[]>(
      `/dev/usage?metrics=api.requests,api.errors.5xx,users.active&from=${daysAgo(6)}`,
    ),
    serverApi<Series[]>(
      `/dev/usage?metrics=email.sent,entities.people,db.bytes.total&from=${daysAgo(29)}`,
    ),
    serverApi<Series[]>(
      `/dev/usage?metrics=${[
        ...Object.keys(MODULES),
        'users.active',
        'api.errors.4xx',
        'api.errors.5xx',
      ].join(',')}&from=${daysAgo(89)}`,
    ),
  ]);

  const requests = total(week, 'api.requests');
  const failed = total(week, 'api.errors.5xx');
  const rate = requests ? (failed / requests) * 100 : 0;
  const pick = (metrics: string[]) => quarter.filter((s) => metrics.includes(s.metric));

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Figure label="Staff active today" value={number(latest(week, 'users.active'))} />
        <Figure label="Requests, 7 days" value={number(requests)} />
        <Figure
          label="Failed requests, 7 days"
          value={`${rate.toFixed(2)}%`}
          note={
            rate > 1 ? `${number(failed)} failed — more than 1 in 100` : `${number(failed)} failed`
          }
          tone={rate > 1 ? 'bad' : 'fine'}
        />
        <Figure label="People on record" value={number(latest(month, 'entities.people'))} />
        <Figure label="Data stored" value={bytes(latest(month, 'db.bytes.total'))} />
        <Figure label="Emails sent, 30 days" value={number(total(month, 'email.sent'))} />
      </div>

      <Panel title="Requests by portal" note="The last 90 days.">
        <LineChart series={pick(Object.keys(MODULES))} labels={MODULES} height={180} />
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Staff active each day" note="Anyone who used the portal that day.">
          <LineChart series={pick(['users.active'])} labels={{ 'users.active': 'Active' }} />
        </Panel>
        <Panel
          title="Refused and failed"
          note="Refused is usually a wrong link or a lapsed sign-in; failed is ours."
        >
          <LineChart
            series={pick(['api.errors.4xx', 'api.errors.5xx'])}
            labels={{ 'api.errors.4xx': 'Refused (4xx)', 'api.errors.5xx': 'Failed (5xx)' }}
          />
        </Panel>
      </div>
    </div>
  );
}

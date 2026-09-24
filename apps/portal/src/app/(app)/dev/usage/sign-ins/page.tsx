import type { Metadata } from 'next';
import { serverApi } from '@/lib/api/server';
import { LineChart } from '@/modules/dev/components/Charts';
import { Figure, Panel } from '@/modules/dev/components/Figure';
import { daysAgo, latest, number, total, type Series } from '@/modules/dev/types';

export const metadata: Metadata = { title: 'Sign-ins' };

const METRICS = [
  'auth.logins',
  'auth.login_failures',
  'auth.lockouts',
  'auth.password_resets',
  'auth.sessions.active',
  'impersonation.started',
  'admin.invitations.sent',
  'admin.invitations.accepted',
];

/**
 * Who got in, who could not, and who was let in. How many times someone
 * viewed as someone else is here; who and whom is only ever in the view-as
 * log.
 */
export default async function SignInsPage() {
  const series = await serverApi<Series[]>(
    `/dev/usage?metrics=${METRICS.join(',')}&from=${daysAgo(29)}`,
  );
  const sum = (metric: string) => total(series, metric);
  const logins = sum('auth.logins');
  const failures = sum('auth.login_failures');
  const sent = sum('admin.invitations.sent');
  const accepted = sum('admin.invitations.accepted');

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[12px] text-fg3">The last 30 days.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="Sign-ins" value={number(logins)} />
        <Figure
          label="Wrong passwords"
          value={number(failures)}
          note={
            logins
              ? `${Math.round((failures / (logins + failures)) * 100)}% of attempts`
              : undefined
          }
        />
        <Figure
          label="Accounts locked"
          value={number(sum('auth.lockouts'))}
          tone={sum('auth.lockouts') > 0 ? 'bad' : 'fine'}
          note={sum('auth.lockouts') > 0 ? 'after too many wrong passwords' : undefined}
        />
        <Figure label="Passwords reset" value={number(sum('auth.password_resets'))} />
        <Figure
          label="Signed in right now"
          value={number(latest(series, 'auth.sessions.active'))}
          note="as of last night"
        />
        <Figure
          label="Viewed as someone"
          value={number(sum('impersonation.started'))}
          note="times; who is in the view-as log"
        />
        <Figure label="Invitations sent" value={number(sent)} />
        <Figure
          label="Invitations accepted"
          value={number(accepted)}
          note={sent ? `${Math.round((accepted / sent) * 100)}% of those sent` : undefined}
        />
      </div>

      <Panel title="Sign-ins and wrong passwords, by day">
        <LineChart
          series={series.filter((s) => ['auth.logins', 'auth.login_failures'].includes(s.metric))}
          labels={{ 'auth.logins': 'Sign-ins', 'auth.login_failures': 'Wrong passwords' }}
        />
      </Panel>
    </div>
  );
}

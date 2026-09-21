import type { Metadata } from 'next';
import Link from 'next/link';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { ForbiddenState } from '@/components/shell/States';
import { NoteDrawer } from '@/modules/membership/components/NoteDrawer';
import { RemindMenu } from '@/modules/membership/components/RemindMenu';
import { when } from '@/modules/membership/types';
import { DashboardExport } from './DashboardExport';

export const metadata: Metadata = { title: 'Membership' };

type Stat = { total: number; last30: number; delta: number };
type Dashboard = {
  stats: { registrations: Stat; joining: Stat; salvation: Stat; baptism: Stat; thisMonth: number };
  applications: {
    total: number;
    rows: {
      id: string;
      personId: string;
      fullName: string;
      initials: string;
      submittedAt: string;
      source: string;
    }[];
  } | null;
  followUp:
    | {
        personId: string;
        fullName: string;
        initials: string;
        savedAt: string | null;
        group: string | null;
        progress: { attended: number; of: number } | null;
      }[]
    | null;
  heard: { label: string; count: number; share: number }[];
  heardOtherCount: number;
  incomplete: {
    total: number;
    rows: {
      personId: string | null;
      name: string | null;
      phone: string | null;
      missing: string[];
      updatedAt: string;
    }[];
  };
};

/** How the church is doing with the people who walk in, this month. */
export default async function MembershipDashboard() {
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'membership.dashboard.read'))
    return <ForbiddenState what="the membership dashboard" />;
  const data = await serverApi<Dashboard>('/membership/dashboard');
  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const heardMax = Math.max(1, ...data.heard.map((h) => h.count));

  const tile = (label: string, stat: Stat | number) => {
    const s = typeof stat === 'number' ? null : stat;
    return (
      <div className="rounded-[10px] border border-border bg-surface p-3.5">
        <p className="text-[11px] font-semibold tracking-wide text-fg3 uppercase">{label}</p>
        <p className="mt-1 text-[20px] font-semibold tabular-nums text-fg">
          {(s ? s.total : (stat as number)).toLocaleString('en-GB')}
        </p>
        {s && (
          <p className={`mt-0.5 text-[11.5px] ${s.delta > 0 ? 'text-pos' : 'text-fg3'}`}>
            {s.delta > 0 ? '+' : ''}
            {s.delta} vs the 30 days before
          </p>
        )}
      </div>
    );
  };

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`${today} · live from the registration form`}
        actions={<DashboardExport />}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {tile('Total registrations', data.stats.registrations)}
        {tile('Joining church', data.stats.joining)}
        {tile('Salvation', data.stats.salvation)}
        {tile('Baptism', data.stats.baptism)}
        {tile('This month', data.stats.thisMonth)}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {data.applications && (
          <section className="rounded-[10px] border border-border bg-surface p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[13px] font-semibold text-fg">
                Applications under review{' '}
                <span className="text-fg3">{data.applications.total}</span>
              </h2>
              <Link href="/membership/applications" className="text-[12px] text-accent underline">
                See all
              </Link>
            </div>
            {data.applications.rows.length === 0 && (
              <p className="text-[12.5px] text-fg3">Nothing waiting.</p>
            )}
            <ul className="flex flex-col gap-2">
              {data.applications.rows.map((a) => (
                <li key={a.id} className="flex items-center gap-2.5 text-[12.5px]">
                  <span
                    aria-hidden="true"
                    className="flex size-7 items-center justify-center rounded-full bg-chip text-[11px] font-semibold text-fg2"
                  >
                    {a.initials}
                  </span>
                  <span className="flex-1">
                    <Link
                      href={`/membership/people/${a.personId}`}
                      className="font-medium text-fg hover:underline"
                    >
                      {a.fullName}
                    </Link>
                    <span className="block text-[11.5px] text-fg3">
                      Applied {when(a.submittedAt).toLowerCase()}
                      {a.source === 'FORM' && ' on the form'}
                    </span>
                  </span>
                  <Link href="/membership/applications" className="text-[12px] text-accent">
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {data.followUp && (
          <section className="rounded-[10px] border border-border bg-surface p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[13px] font-semibold text-fg">New converts in follow-up</h2>
              <Link href="/membership/discipleship" className="text-[12px] text-accent underline">
                Open pipeline
              </Link>
            </div>
            {data.followUp.length === 0 && (
              <p className="text-[12.5px] text-fg3">Nobody at the moment.</p>
            )}
            <ul className="flex flex-col gap-2.5">
              {data.followUp.map((c) => (
                <li key={c.personId} className="flex items-center gap-2.5 text-[12.5px]">
                  <span
                    aria-hidden="true"
                    className="flex size-7 items-center justify-center rounded-full bg-chip text-[11px] font-semibold text-fg2"
                  >
                    {c.initials}
                  </span>
                  <span className="min-w-0 flex-1">
                    <Link
                      href={`/membership/people/${c.personId}`}
                      className="font-medium text-fg hover:underline"
                    >
                      {c.fullName}
                    </Link>
                    <span className="block text-[11.5px] text-fg3">
                      {[
                        c.savedAt &&
                          `Saved ${new Date(c.savedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
                        c.group,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'Not in a class yet'}
                    </span>
                    {c.progress && (
                      <span
                        className="mt-1 block h-1.5 overflow-hidden rounded-full bg-chip"
                        aria-hidden="true"
                      >
                        <span
                          className="block h-full rounded-full bg-accent"
                          style={{ width: `${(c.progress.attended / c.progress.of) * 100}%` }}
                        />
                      </span>
                    )}
                  </span>
                  <NoteDrawer personId={c.personId} name={c.fullName} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-[10px] border border-border bg-surface p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-fg">How they heard about IRCA</h2>
            {can(me, 'membership.insights.read') && (
              <Link href="/membership/insights" className="text-[12px] text-accent underline">
                Insights
              </Link>
            )}
          </div>
          <div className="flex h-32 items-end gap-3">
            {data.heard.map((h) => (
              <div key={h.label} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[11px] tabular-nums text-fg2">{h.count}</span>
                <span
                  className="block w-full rounded-t-[3px] bg-neutral-bar"
                  style={{ height: `${Math.max((h.count / heardMax) * 80, 3)}px` }}
                />
                <span className="truncate text-[10.5px] text-fg3">{h.label}</span>
              </div>
            ))}
            {data.heard.length === 0 && <p className="text-[12.5px] text-fg3">No answers yet.</p>}
          </div>
          {data.heardOtherCount > 0 && can(me, 'membership.insights.read') && (
            <Link href="/membership/insights" className="mt-3 block text-[12px] text-accent">
              {data.heardOtherCount} people typed their own answer — read them →
            </Link>
          )}
        </section>

        <section className="rounded-[10px] border border-border bg-surface p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-fg">
              Incomplete registrations{' '}
              <span className="text-fg3">{data.incomplete.total} people</span>
            </h2>
            <Link
              href="/membership/people?tab=incomplete"
              className="text-[12px] text-accent underline"
            >
              See all
            </Link>
          </div>
          <ul className="flex flex-col gap-2">
            {data.incomplete.rows.map((i, n) => (
              <li key={i.personId ?? n} className="flex items-center gap-2.5 text-[12.5px]">
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-fg">
                    {i.name ?? `Unknown${i.phone ? ` — ${i.phone}` : ''}`}
                  </span>
                  <span className="block text-[11.5px] text-fg3">
                    {i.missing.length
                      ? `Missing ${i.missing.join(', ').toLowerCase()}`
                      : 'Nearly there'}{' '}
                    · {when(i.updatedAt)}
                  </span>
                </span>
                {i.personId && <RemindMenu personId={i.personId} />}
              </li>
            ))}
            {data.incomplete.rows.length === 0 && (
              <p className="text-[12.5px] text-fg3">Everyone finished.</p>
            )}
          </ul>
          {data.incomplete.total > 0 && (
            <p
              className="mt-3 text-[11.5px] text-fg3"
              title="Sending to everyone at once needs the Comms portal (SMS)"
            >
              Sending to everyone at once needs SMS, which arrives with the Comms portal.
            </p>
          )}
        </section>
      </div>
    </>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { ForbiddenState } from '@/components/shell/States';
import { cn } from '@/lib/cn';

export const metadata: Metadata = { title: 'Insights' };

type Tally = { label: string; count: number; share: number }[];
type StepInsight = {
  id: string;
  label: string;
  optional: boolean;
  reached: number;
  answered: number;
  blank: number;
  stopped: number;
  answeredPct: number;
  blankPct: number;
  stoppedPct: number;
};
type Insights = {
  period: string;
  total: number;
  report: { started: number; submitted: number; steps: StepInsight[] };
  heard: Tally;
  heardOther: { label: string; count: number }[];
  ages: Tally;
  livesIn: Tally;
  cameFor: Tally;
  interestedIn: Tally;
};

const PERIODS = [
  ['90d', 'Last 90 days'],
  ['year', 'This year'],
  ['all', 'All time'],
] as const;

/**
 * What the registration form tells the church. Every figure is a count beside
 * its share, never a bare percentage: at a couple of dozen visitors a Sunday,
 * a percentage on its own lies.
 */
export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'membership.insights.read')) return <ForbiddenState what="insights" />;
  const { period: raw } = await searchParams;
  const period = PERIODS.some(([k]) => k === raw) ? raw! : '90d';
  const data = await serverApi<Insights>(`/membership/insights?period=${period}`);
  const { started, submitted } = data.report;

  const card = (title: string, rows: Tally) => (
    <section className="rounded-[10px] border border-border bg-surface p-4">
      <h2 className="mb-2 text-[13px] font-semibold text-fg">{title}</h2>
      {rows.length === 0 && <p className="text-[12.5px] text-fg3">No answers yet.</p>}
      <ul className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2 text-[12.5px]">
            <span className="w-36 truncate text-fg2">{r.label}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-chip" aria-hidden="true">
              <span
                className="block h-full rounded-full bg-neutral-bar"
                style={{ width: `${Math.max(r.share, 2)}%` }}
              />
            </span>
            <span className="w-20 text-right tabular-nums text-fg">
              {r.count} · {r.share}%
            </span>
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <>
      <PageHeader
        title="Insights"
        subtitle={`${data.total.toLocaleString('en-GB')} registrations. What the church should keep doing, and where people stop.`}
        actions={
          <nav className="flex gap-1.5" aria-label="Period">
            {PERIODS.map(([key, label]) => (
              <Link
                key={key}
                href={`/membership/insights?period=${key}`}
                aria-current={period === key ? 'page' : undefined}
                className={cn(
                  'rounded-full border px-3 py-1 text-[12px]',
                  period === key
                    ? 'border-accent-br bg-chip text-fg'
                    : 'border-border text-fg2 hover:bg-hover',
                )}
              >
                {label}
              </Link>
            ))}
          </nav>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['Started', started],
          ['Finished the form', submitted],
          ['Did not finish', started - submitted],
        ].map(([label, count]) => (
          <div
            key={label as string}
            className="rounded-[10px] border border-border bg-surface p-3.5"
          >
            <p className="text-[11px] font-semibold tracking-wide text-fg3 uppercase">{label}</p>
            <p className="mt-1 text-[20px] font-semibold tabular-nums text-fg">
              {count}
              {started > 0 && label !== 'Started' && (
                <span className="ml-1.5 text-[12px] font-normal text-fg3">
                  {Math.round(((count as number) / started) * 100)}%
                </span>
              )}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {card('How they heard about IRCA', data.heard)}
        <section className="rounded-[10px] border border-border bg-surface p-4">
          <h2 className="text-[13px] font-semibold text-fg">Typed &ldquo;Other&rdquo; answers</h2>
          <p className="mb-2 text-[12px] text-fg3">Grouped by what they said.</p>
          {data.heardOther.length === 0 && <p className="text-[12.5px] text-fg3">None yet.</p>}
          <ul className="flex flex-col gap-1">
            {data.heardOther.map((t) => (
              <li key={t.label} className="flex justify-between text-[12.5px]">
                <span className="text-fg2">{t.label}</span>
                <span className="tabular-nums text-fg">{t.count}</span>
              </li>
            ))}
          </ul>
        </section>
        {card('Age groups', data.ages)}
        {card('Where they live', data.livesIn)}
        {card('What they came for', data.cameFor)}
        {card('What they would like from us', data.interestedIn)}
      </div>

      <section className="mt-4 rounded-[10px] border border-border bg-surface p-4">
        <h2 className="text-[13px] font-semibold text-fg">Where people stop on the form</h2>
        <p className="mb-3 text-[12px] text-fg3">
          Each question is counted only against the people who were shown it: someone not joining
          the church was never asked where they would serve, and does not count as skipping it.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[11px] text-fg3">
                <th className="py-1.5 font-semibold">Question</th>
                <th className="py-1.5 text-right font-semibold">Reached</th>
                <th className="py-1.5 text-right font-semibold">Answered</th>
                <th className="py-1.5 text-right font-semibold">Left blank</th>
                <th className="py-1.5 text-right font-semibold">Stopped here</th>
                <th className="w-40 py-1.5 pl-3 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {data.report.steps
                .filter((s) => s.reached > 0)
                .map((s) => (
                  <tr key={s.id} className="border-t border-border2">
                    <td className="py-1.5">
                      {s.label}
                      {s.optional && <span className="ml-1 text-[11px] text-fg3">(optional)</span>}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{s.reached}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {s.answered} <span className="text-fg3">{s.answeredPct}%</span>
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {s.blank} <span className="text-fg3">{s.blankPct}%</span>
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {s.stopped} <span className="text-fg3">{s.stoppedPct}%</span>
                    </td>
                    <td className="py-1.5 pl-3">
                      <span
                        className="block h-2 overflow-hidden rounded-full bg-chip"
                        aria-hidden="true"
                      >
                        <span
                          className="block h-full rounded-full bg-accent"
                          style={{ width: `${s.answeredPct}%` }}
                        />
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

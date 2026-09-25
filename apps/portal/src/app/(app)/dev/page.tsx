import type { Metadata } from 'next';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { ForbiddenState } from '@/components/shell/States';
import { Badge } from '@/components/ui/Badge';
import { Table, Row, Cell } from '@/components/ui/Table';
import { BarList, LineChart } from '@/modules/dev/components/Charts';
import { ago, bytes, number, type Health } from '@/modules/dev/types';

export const metadata: Metadata = { title: 'Health' };

export default async function HealthPage() {
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'dev.health.read')) return <ForbiddenState what="the health page" />;

  const health = await serverApi<Health>('/dev/health');
  const requests = health.errors.reduce((sum, d) => sum + d.requests, 0);
  const failures = health.errors.reduce((sum, d) => sum + d.errors, 0);
  const rate = requests ? (failures / requests) * 100 : 0;
  const waiting = (health.outbox.PENDING ?? 0) + (health.outbox.RETRY ?? 0);

  return (
    <>
      <PageHeader
        title="Health"
        subtitle="The database, the jobs and the email queue, as they are right now."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="Database" value={bytes(health.database.bytes)} />
        <Figure label="Connections open" value={number(health.database.connections)} />
        <Figure
          label="Failed requests (14 days)"
          value={`${rate.toFixed(2)}%`}
          tone={rate > 1 ? 'bad' : 'fine'}
        />
        <Figure
          label="Emails waiting"
          value={number(waiting)}
          tone={(health.outbox.FAILED ?? 0) > 0 ? 'bad' : 'fine'}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-[10px] border border-border bg-surface p-4">
          <h2 className="mb-3 text-[13px] font-semibold text-fg">Requests and failures</h2>
          <LineChart
            series={[
              {
                metric: 'requests',
                points: health.errors.map((e) => ({ day: e.day, value: e.requests })),
              },
              {
                metric: 'errors',
                points: health.errors.map((e) => ({ day: e.day, value: e.errors })),
              },
            ]}
            labels={{ requests: 'Requests', errors: 'Failures' }}
          />
        </section>

        <section className="rounded-[10px] border border-border bg-surface p-4">
          <h2 className="mb-3 text-[13px] font-semibold text-fg">Biggest tables</h2>
          <BarList
            rows={health.database.tables.slice(0, 10).map((t) => ({
              label: t.table.replace(/_/g, ' '),
              value: t.bytes,
              hint: bytes(t.bytes),
            }))}
          />
        </section>
      </div>

      <section className="mt-5">
        <h2 className="mb-2 text-[13px] font-semibold text-fg">Jobs</h2>
        <Table head={['Job', 'Last run', 'Took', '']}>
          {health.jobs.map((job) => (
            <Row key={job.job}>
              <Cell>
                <span className="font-medium text-fg">{job.job}</span>
                {job.error && <p className="mt-0.5 text-[11.5px] text-danger">{job.error}</p>}
              </Cell>
              <Cell nowrap>
                <span className="text-fg2">{ago(job.lastRunAt)}</span>
              </Cell>
              <Cell nowrap>
                <span className="text-fg2 tabular-nums">
                  {job.durationMs === null ? 'still running' : `${number(job.durationMs)} ms`}
                </span>
              </Cell>
              <Cell nowrap>
                {job.ok === false && <Badge tone="danger">Failed</Badge>}
                {job.ok === true && <Badge tone="positive">Fine</Badge>}
              </Cell>
            </Row>
          ))}
        </Table>
      </section>

      <section className="mt-5">
        <h2 className="mb-2 text-[13px] font-semibold text-fg">Email queue</h2>
        <div className="flex flex-wrap gap-2">
          {Object.entries(health.outbox).map(([status, count]) => (
            <span
              key={status}
              className="rounded-[8px] border border-border bg-surface px-3 py-2 text-[12.5px] text-fg2"
            >
              {status.toLowerCase()}: <span className="font-semibold text-fg">{number(count)}</span>
            </span>
          ))}
          {!Object.keys(health.outbox).length && (
            <p className="text-[12.5px] text-fg3">Nothing in the queue.</p>
          )}
        </div>
      </section>

      <section className="mt-5">
        <h2 className="mb-2 text-[13px] font-semibold text-fg">Slowest queries</h2>
        {health.slowQueries === null ? (
          <p className="text-[12.5px] text-fg3">
            Postgres is not keeping query statistics here. Turn on pg_stat_statements to see them.
          </p>
        ) : (
          <Table head={['Query', 'Calls', 'Average', 'Total']}>
            {health.slowQueries.map((q) => (
              <Row key={q.query}>
                <Cell>
                  <code
                    className="block max-w-[520px] truncate font-mono text-[11.5px] text-fg2"
                    title={q.query}
                  >
                    {q.query}
                  </code>
                </Cell>
                <Cell nowrap>
                  <span className="tabular-nums text-fg2">{number(q.calls)}</span>
                </Cell>
                <Cell nowrap>
                  <span className="tabular-nums text-fg2">{q.meanMs.toFixed(1)} ms</span>
                </Cell>
                <Cell nowrap>
                  <span className="tabular-nums text-fg3">{number(Math.round(q.totalMs))} ms</span>
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </section>
    </>
  );
}

function Figure({
  label,
  value,
  tone = 'fine',
}: {
  label: string;
  value: string;
  tone?: 'fine' | 'bad';
}) {
  return (
    <div className="rounded-[10px] border border-border bg-surface p-3.5">
      <p className="text-[11px] font-semibold tracking-wide text-fg3 uppercase">{label}</p>
      <p
        className={`mt-1 text-[19px] font-semibold tabular-nums ${tone === 'bad' ? 'text-danger' : 'text-fg'}`}
      >
        {value}
      </p>
    </div>
  );
}

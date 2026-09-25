import type { Metadata } from 'next';
import Link from 'next/link';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { EmptyState, ForbiddenState } from '@/components/shell/States';
import { Table, Row, Cell } from '@/components/ui/Table';
import { money, when } from '@/modules/comms/types';

export const metadata: Metadata = { title: 'Communications' };

type Overview = {
  byDepartment: {
    department: { id: string; name: string } | null;
    messages: number;
    people: number;
    segments: number;
    cost: string;
    delivered: number;
    failed: number;
  }[];
  credit: { amount: number; day: string } | null;
  pendingTemplates: number;
  replies: { id: string; from: string; text: string; stopped: boolean; at: string }[];
};

/** This month: what was sent, by whom, what it cost; what waits; what people replied. */
export default async function CommsOverviewPage() {
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'comms.messages.read')) return <ForbiddenState what="Communications" />;
  const o = await serverApi<Overview>('/comms/messages/overview');
  const total = o.byDepartment.reduce(
    (t, d) => ({
      messages: t.messages + d.messages,
      people: t.people + d.people,
      cost: t.cost + Number(d.cost),
      failed: t.failed + d.failed,
    }),
    { messages: 0, people: 0, cost: 0, failed: 0 },
  );

  return (
    <>
      <PageHeader
        title="Communications"
        subtitle="This month's messages, what they cost, and what people said back."
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="Messages this month" value={String(total.messages)} />
        <Figure label="People written to" value={String(total.people)} />
        <Figure label="Cost this month" value={`${money(total.cost)} TZS`} />
        <Figure
          label="Credit left"
          value={o.credit ? `${money(o.credit.amount)} TZS` : 'Not read yet'}
        />
      </div>

      {o.pendingTemplates > 0 && can(me, 'comms.templates.read') && (
        <p className="mb-5 text-[12.5px] text-fg2">
          <Link href="/comms/templates" className="text-accent underline">
            {o.pendingTemplates} {o.pendingTemplates === 1 ? 'template is' : 'templates are'}{' '}
            waiting for approval
          </Link>
          .
        </p>
      )}

      <section className="mb-6">
        <h2 className="mb-2 text-[13px] font-semibold text-fg">By department</h2>
        {o.byDepartment.length === 0 ? (
          <EmptyState title="Nothing sent this month" />
        ) : (
          <Table
            head={['Department', 'Messages', 'People', 'Segments', 'Delivered', 'Failed', 'Cost']}
          >
            {o.byDepartment.map((d) => (
              <Row key={d.department?.id ?? 'comms'}>
                <Cell>
                  <span className="font-medium text-fg">
                    {d.department?.name ?? 'Communications'}
                  </span>
                </Cell>
                <Cell nowrap>{d.messages}</Cell>
                <Cell nowrap>{d.people}</Cell>
                <Cell nowrap>{d.segments}</Cell>
                <Cell nowrap>{d.delivered}</Cell>
                <Cell nowrap>
                  <span className={d.failed ? 'text-danger' : ''}>{d.failed}</span>
                </Cell>
                <Cell nowrap>
                  <span className="tabular-nums">{money(d.cost)} TZS</span>
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-[13px] font-semibold text-fg">Replies</h2>
        {o.replies.length === 0 ? (
          <EmptyState title="No replies yet" />
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-[10px] border border-border bg-surface">
            {o.replies.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5"
              >
                <span className="text-[12.5px] text-fg">
                  {r.stopped ? <span className="text-fg3">Asked to stop: </span> : null}
                  {r.text}
                </span>
                <span className="text-[11.5px] text-fg3">
                  {r.from} · {when(r.at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-border bg-surface p-3.5">
      <p className="text-[11px] font-semibold tracking-wide text-fg3 uppercase">{label}</p>
      <p className="mt-1 text-[19px] font-semibold text-fg tabular-nums">{value}</p>
    </div>
  );
}

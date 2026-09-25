import type { Metadata } from 'next';
import Link from 'next/link';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { cn } from '@/lib/cn';
import { PageHeader } from '@/components/shell/PageHeader';
import { EmptyState, ForbiddenState } from '@/components/shell/States';
import { Badge } from '@/components/ui/Badge';
import { FillInDrawer } from '@/modules/outreach/FillInDrawer';
import { longDay, shortDay, type ReachedPage } from '@/modules/outreach/types';

export const metadata: Metadata = { title: 'Reached' };

type Params = {
  q?: string;
  thin?: string;
  session?: string;
  from?: string;
  to?: string;
  page?: string;
};

/**
 * Everyone Outreach reached, newest first, with their numbers — following up
 * by phone is the team's job — and marked where a record is still thin.
 */
export default async function ReachedListPage({ searchParams }: { searchParams: Promise<Params> }) {
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'outreach.reached.read')) return <ForbiddenState what="the people reached" />;
  const params = await searchParams;
  const query = new URLSearchParams(
    Object.entries(params).filter((e): e is [string, string] => typeof e[1] === 'string' && !!e[1]),
  );
  const data = await serverApi<ReachedPage>(`/outreach/reached?${query}`);
  const page = Number(params.page) || 1;
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const link = (next: Partial<Params>) => {
    const q = new URLSearchParams(query);
    for (const [k, v] of Object.entries(next)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    if (!('page' in next)) q.delete('page');
    return `/outreach/reached${q.size ? `?${q}` : ''}`;
  };
  const record = can(me, 'outreach.reached.record');

  return (
    <>
      <PageHeader
        title="Reached"
        subtitle="Everyone the team has spoken to and recorded, newest first."
        actions={
          record ? (
            <Link
              href="/outreach/reached/new"
              className="inline-flex h-9 items-center rounded-[7px] bg-btn-bg px-3.5 text-[12.5px] font-medium text-btn-fg hover:opacity-90"
            >
              Record someone
            </Link>
          ) : undefined
        }
      />

      <form action="/outreach/reached" className="mb-3 flex flex-wrap items-center gap-2">
        {Object.entries(params)
          .filter(([k, v]) => v && !['q', 'page'].includes(k))
          .map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
        <input
          type="search"
          name="q"
          defaultValue={params.q ?? ''}
          placeholder="Name or number"
          aria-label="Search by name or number"
          className="h-9 w-56 rounded-[7px] border border-border bg-input px-3 text-[13px] text-fg placeholder:text-fg3"
        />
        <Link
          href={link({ thin: params.thin ? undefined : '1' })}
          aria-current={params.thin ? 'page' : undefined}
          className={cn(
            'rounded-full border px-3 py-1 text-[12px]',
            params.thin
              ? 'border-accent-br bg-chip text-fg'
              : 'border-border text-fg2 hover:bg-hover',
          )}
        >
          Still missing a phone or an area
        </Link>
        {(params.session || params.from || params.to || params.q) && (
          <Link href="/outreach/reached" className="text-[12px] text-accent underline">
            Show everyone
          </Link>
        )}
      </form>
      {(params.from || params.to) && (
        <p className="mb-3 text-[12.5px] text-fg2">
          Reached {params.from && `from ${longDay(params.from)}`}{' '}
          {params.to && `to ${longDay(params.to)}`}
        </p>
      )}

      {data.rows.length === 0 ? (
        <EmptyState title="Nobody in this list">
          {record ? 'Record someone from a Saturday, or from the button above.' : null}
        </EmptyState>
      ) : (
        <ul className="flex flex-col divide-y divide-border2 rounded-[10px] border border-border bg-surface">
          {data.rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 p-3">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/outreach/people/${r.personId}`}
                    className="text-[13px] font-medium text-fg hover:underline"
                  >
                    {r.name}
                  </Link>
                  {r.saved && <Badge tone="positive">Saved</Badge>}
                  {r.needsFollowUp && <Badge tone="accent">Follow up</Badge>}
                  {r.thin.phone && <Badge tone="muted">No phone</Badge>}
                  {r.thin.area && <Badge tone="muted">No area</Badge>}
                </span>
                {r.phone && (
                  <a
                    href={`tel:${r.phone.replace(/[^\d+]/g, '')}`}
                    className="text-[12.5px] text-accent"
                  >
                    {r.phone}
                  </a>
                )}
                <span className="text-[12px] text-fg2">
                  {[
                    shortDay(r.reachedOn),
                    r.area,
                    r.reachedBy.length ? `by ${r.reachedBy.join(', ')}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {r.note && <span className="text-[12px] text-fg3">{r.note}</span>}
              </span>
              {record && <FillInDrawer row={r} />}
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav className="mt-3 flex items-center justify-between text-[12.5px]" aria-label="Pages">
          {page > 1 ? (
            <Link href={link({ page: String(page - 1) })} className="text-accent underline">
              ← Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="text-fg3">
            Page {page} of {pages} · {data.total} in all
          </span>
          {page < pages ? (
            <Link href={link({ page: String(page + 1) })} className="text-accent underline">
              Older →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { ApiRequestError } from '@/lib/api/errors';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { EmptyState, ForbiddenState } from '@/components/shell/States';
import { longDay, shortDay, type FigureList } from '@/modules/outreach/types';

export const metadata: Metadata = { title: 'Outreach' };

/**
 * The list behind one dashboard number: the same rows the number was added
 * up from, so anyone can check it by counting.
 */
export default async function FigurePage({
  params,
  searchParams,
}: {
  params: Promise<{ figure: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'outreach.dashboard.read')) return <ForbiddenState what="the Outreach dashboard" />;
  const { figure } = await params;
  const query = new URLSearchParams(
    Object.entries(await searchParams).filter(
      (e): e is [string, string] => typeof e[1] === 'string',
    ),
  );
  let list: FigureList;
  try {
    list = await serverApi<FigureList>(
      `/outreach/dashboard/${encodeURIComponent(figure)}?${query}`,
    );
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 404) notFound();
    throw err;
  }
  const total = list.rows.reduce((n, r) => n + r.n, 0);
  const of = list.rows.reduce((n, r) => n + r.d, 0);
  const counted = list.rows.some((r) => r.n !== 1) || list.key === 'training';

  return (
    <>
      <Link
        href={`/outreach?from=${list.from}&to=${list.to}`}
        className="text-[12px] text-fg2 hover:text-fg"
      >
        ← Dashboard
      </Link>
      <div className="mt-2">
        <PageHeader
          title={list.label}
          subtitle={`${list.hint}${list.now ? '.' : `, ${longDay(list.from)} to ${longDay(list.to)}.`}`}
        />
      </div>
      <p className="mb-3 text-[12.5px] text-fg2">
        {list.key === 'training'
          ? `${total} of ${of} marked came`
          : `${total.toLocaleString('en-GB')} in all`}
        {counted && list.key !== 'training' && `, from ${list.rows.length} rows`}.
      </p>
      {list.rows.length === 0 ? (
        <EmptyState title="Nothing in this period" />
      ) : (
        <ul className="flex flex-col divide-y divide-border2 rounded-[10px] border border-border bg-surface">
          {list.rows.map((r) => (
            <li key={r.id}>
              <Link
                href={r.href}
                className="flex items-center justify-between gap-3 p-3 hover:bg-hover"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[13px] text-fg">{r.title}</span>
                  {r.detail && <span className="truncate text-[12px] text-fg2">{r.detail}</span>}
                </span>
                <span className="flex flex-none items-center gap-3 text-[12px] text-fg3 tabular-nums">
                  {counted && list.key !== 'training' && <span className="text-fg">{r.n}</span>}
                  {r.day && shortDay(r.day)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

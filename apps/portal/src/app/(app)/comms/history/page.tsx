import type { Metadata } from 'next';
import Link from 'next/link';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { ForbiddenState } from '@/components/shell/States';
import { HistoryFilters } from '@/modules/comms/HistoryFilters';
import { HistoryTable } from '@/modules/comms/HistoryTable';
import type { MessageRow } from '@/modules/comms/types';

export const metadata: Metadata = { title: 'History' };

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'comms.messages.read')) return <ForbiddenState what="what was sent" />;
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.department) query.set('departmentId', params.department);
  if (params.status) query.set('status', params.status);
  const page = Math.max(1, Number(params.page) || 1);
  query.set('page', String(page));
  const [history, departments] = await Promise.all([
    serverApi<{ rows: MessageRow[]; total: number; pageSize: number }>(`/comms/messages?${query}`),
    serverApi<{ departments: { id: string; name: string }[] }>('/comms/audience-options').catch(
      () => ({ departments: [] }),
    ),
  ]);
  const pages = Math.max(1, Math.ceil(history.total / history.pageSize));
  const link = (p: number) => {
    const q = new URLSearchParams(query);
    q.delete('departmentId');
    if (params.department) q.set('department', params.department);
    q.set('page', String(p));
    return `/comms/history?${q}`;
  };
  return (
    <>
      <PageHeader title="History" subtitle="Every message the church sent, newest first." />
      <HistoryFilters departments={departments.departments} />
      <div className="mt-4">
        <HistoryTable rows={history.rows} base="/comms/history" showDepartment />
      </div>
      {pages > 1 && (
        <p className="mt-3 flex gap-3 text-[12.5px]">
          {page > 1 && (
            <Link className="text-accent underline" href={link(page - 1)}>
              Newer
            </Link>
          )}
          <span className="text-fg3">
            Page {page} of {pages}
          </span>
          {page < pages && (
            <Link className="text-accent underline" href={link(page + 1)}>
              Older
            </Link>
          )}
        </p>
      )}
    </>
  );
}

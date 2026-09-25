import type { Metadata } from 'next';
import Link from 'next/link';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { EmptyState, ForbiddenState } from '@/components/shell/States';
import type { MyDepartment } from '@/modules/departments/types';

export const metadata: Metadata = { title: 'My departments' };

/** The departments this person leads (D28). */
export default async function MyDepartmentsPage() {
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'departments.own.read')) return <ForbiddenState what="departments" />;

  const mine = await serverApi<MyDepartment[]>('/departments/mine');

  return (
    <>
      <PageHeader
        title="My departments"
        subtitle="The departments you lead. You keep who is in them."
      />
      {mine.length === 0 ? (
        <EmptyState title="You do not lead a department" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {mine.map((d) => (
            <Link
              key={d.id}
              href={`/departments/${d.id}`}
              className="flex flex-col gap-1.5 rounded-[10px] border border-border bg-surface p-4 hover:bg-hover"
            >
              <span className="text-[13px] font-semibold text-fg">{d.name}</span>
              <span className="text-[12px] text-fg2">
                You are its {d.title.toLowerCase()} · {d.memberCount}{' '}
                {d.memberCount === 1 ? 'member' : 'members'}
              </span>
              {d.description && <span className="text-[11.5px] text-fg3">{d.description}</span>}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { ForbiddenState } from '@/components/shell/States';
import { ApiRequestError } from '@/lib/api/errors';
import { LeadersSection } from '@/modules/departments/LeadersSection';
import { MembersSection } from '@/modules/departments/MembersSection';
import type { DepartmentDetail } from '@/modules/departments/types';
import { DepartmentTabs } from '@/modules/departments/DepartmentTabs';

export const metadata: Metadata = { title: 'Department' };

/** One department, as its leaders see it: who leads it, and its members. */
export default async function MyDepartmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'departments.own.read')) return <ForbiddenState what="departments" />;

  let department: DepartmentDetail;
  try {
    department = await serverApi<DepartmentDetail>(`/departments/${id}`);
  } catch (err) {
    // Someone else's department is simply not theirs to open.
    if (err instanceof ApiRequestError && err.status === 403) {
      return <ForbiddenState what="this department" />;
    }
    throw err;
  }

  return (
    <>
      <Link href="/departments" className="text-[12px] text-fg2 hover:text-fg">
        ← My departments
      </Link>
      <div className="mt-2">
        <PageHeader title={department.name} subtitle={department.description || undefined} />
      </div>
      <DepartmentTabs id={department.id} />
      <div className="flex flex-col gap-7">
        <MembersSection department={department} permission="departments.own.members" />
        <LeadersSection department={department} />
      </div>
    </>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { ForbiddenState } from '@/components/shell/States';
import { Alert } from '@/components/ui/Alert';
import { ArchiveButton } from '@/modules/departments/ArchiveButton';
import { DepartmentDrawer } from '@/modules/departments/DepartmentDrawer';
import { LeadersSection } from '@/modules/departments/LeadersSection';
import { MembersSection } from '@/modules/departments/MembersSection';
import type { DepartmentDetail, DepartmentRow } from '@/modules/departments/types';
import { portalChoices } from '@/modules/departments/portals';

export const metadata: Metadata = { title: 'Department' };

export default async function DepartmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'admin.departments.read')) return <ForbiddenState what="departments" />;

  const [department, all] = await Promise.all([
    serverApi<DepartmentDetail>(`/departments/${id}`),
    serverApi<DepartmentRow[]>('/admin/departments'),
  ]);
  const manage = can(me, 'admin.departments.manage');

  return (
    <>
      <Link href="/admin/departments" className="text-[12px] text-fg2 hover:text-fg">
        ← Departments
      </Link>
      <div className="mt-2">
        <PageHeader
          title={department.name}
          subtitle={
            department.description ||
            (department.portal
              ? `Its portal is ${department.portal.name}.`
              : 'It has no portal of its own.')
          }
          actions={
            manage && (
              <>
                {!department.archived && (
                  <DepartmentDrawer
                    department={{
                      id: department.id,
                      name: department.name,
                      description: department.description,
                      portalKey: department.portal?.key ?? null,
                    }}
                    portals={portalChoices(all)}
                  />
                )}
                <ArchiveButton
                  id={department.id}
                  name={department.name}
                  archived={department.archived}
                />
              </>
            )
          }
        />
      </div>

      {department.archived && (
        <div className="mb-4">
          <Alert tone="warn">
            Archived. Its leaders cannot see it or send its messages until it is restored.
          </Alert>
        </div>
      )}

      <div className="flex flex-col gap-7">
        <LeadersSection department={department} />
        <MembersSection department={department} permission="admin.departments.manage" />
      </div>
    </>
  );
}

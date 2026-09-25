import type { Metadata } from 'next';
import Link from 'next/link';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { ForbiddenState } from '@/components/shell/States';
import { TemplatesPanel } from '@/modules/comms/TemplatesPanel';
import type { Template } from '@/modules/comms/types';
import { DepartmentTabs } from '@/modules/departments/DepartmentTabs';
import { leaderDepartment } from '@/modules/departments/leaderPage';

export const metadata: Metadata = { title: 'Templates' };

export default async function DepartmentTemplatesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const found = await leaderDepartment(id);
  if (!found || !can(found.me, 'comms.department.read'))
    return <ForbiddenState what="this department's templates" />;
  const templates = await serverApi<Template[]>(`/comms/templates?departmentId=${id}`);
  return (
    <>
      <Link href="/departments" className="text-[12px] text-fg2 hover:text-fg">
        ← My departments
      </Link>
      <div className="mt-2">
        <PageHeader
          title={found.department.name}
          subtitle="Write the words once and ask Communications to approve them. Then use them every week without asking."
        />
      </div>
      <DepartmentTabs id={id} />
      <TemplatesPanel
        templates={templates}
        departmentId={id}
        draftPermission="comms.department.draft"
      />
    </>
  );
}

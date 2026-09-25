import type { Metadata } from 'next';
import Link from 'next/link';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { ForbiddenState } from '@/components/shell/States';
import { SchedulesPanel } from '@/modules/comms/SchedulesPanel';
import type { AudienceOptions, Schedule, Template } from '@/modules/comms/types';
import { DepartmentTabs } from '@/modules/departments/DepartmentTabs';
import { leaderDepartment } from '@/modules/departments/leaderPage';

export const metadata: Metadata = { title: 'Recurring' };

export default async function DepartmentRecurringPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const found = await leaderDepartment(id);
  if (!found || !can(found.me, 'comms.department.read'))
    return <ForbiddenState what="this department's recurring messages" />;
  const send = can(found.me, 'comms.department.send');
  const [schedules, options, templates] = await Promise.all([
    serverApi<Schedule[]>(`/comms/schedules?departmentId=${id}`),
    send
      ? serverApi<AudienceOptions>(`/comms/audience-options?departmentId=${id}`)
      : Promise.resolve(null),
    serverApi<Template[]>(`/comms/templates?departmentId=${id}`),
  ]);
  return (
    <>
      <Link href="/departments" className="text-[12px] text-fg2 hover:text-fg">
        ← My departments
      </Link>
      <div className="mt-2">
        <PageHeader
          title={found.department.name}
          subtitle="Reminders that send themselves on a rhythm, never at night."
        />
      </div>
      <DepartmentTabs id={id} />
      <SchedulesPanel
        schedules={schedules}
        departmentId={id}
        options={options}
        templates={templates.filter((t) => t.status === 'ACTIVE')}
        managePermission="comms.department.send"
        historyBase={`/departments/${id}/messages`}
      />
    </>
  );
}

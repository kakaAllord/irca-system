import type { Metadata } from 'next';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { ForbiddenState } from '@/components/shell/States';
import { SchedulesPanel } from '@/modules/comms/SchedulesPanel';
import type { AudienceOptions, Schedule, Template } from '@/modules/comms/types';

export const metadata: Metadata = { title: 'Recurring' };

export default async function SchedulesPage() {
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'comms.schedules.read')) return <ForbiddenState what="recurring messages" />;
  const manage = can(me, 'comms.schedules.manage') && can(me, 'comms.messages.send');
  const [schedules, options, templates] = await Promise.all([
    serverApi<Schedule[]>('/comms/schedules'),
    manage ? serverApi<AudienceOptions>('/comms/audience-options') : Promise.resolve(null),
    can(me, 'comms.templates.read')
      ? serverApi<Template[]>('/comms/templates')
      : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeader
        title="Recurring"
        subtitle="Messages that send themselves on a rhythm, never at night."
      />
      <SchedulesPanel
        schedules={schedules}
        departmentId={null}
        options={options}
        templates={templates.filter((t) => t.status === 'ACTIVE')}
        managePermission="comms.schedules.manage"
        historyBase="/comms/history"
      />
    </>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { ForbiddenState } from '@/components/shell/States';
import { Composer } from '@/modules/comms/Composer';
import { HistoryTable } from '@/modules/comms/HistoryTable';
import type { AudienceOptions, MessageRow, Template } from '@/modules/comms/types';
import { DepartmentTabs } from '@/modules/departments/DepartmentTabs';
import { leaderDepartment } from '@/modules/departments/leaderPage';

export const metadata: Metadata = { title: 'Messages' };

/**
 * A department's own messages (07 step 7.14): the same composer and history
 * as Communications', with the department fixed and only its audiences on
 * offer.
 */
export default async function DepartmentMessagesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const found = await leaderDepartment(id);
  if (!found || !can(found.me, 'comms.department.read'))
    return <ForbiddenState what="this department's messages" />;
  const { me, department } = found;
  const send = can(me, 'comms.department.send');
  const [history, options, templates] = await Promise.all([
    serverApi<{ rows: MessageRow[] }>(`/comms/messages?departmentId=${id}`),
    send
      ? serverApi<AudienceOptions>(`/comms/audience-options?departmentId=${id}`)
      : Promise.resolve(null),
    serverApi<Template[]>(`/comms/templates?departmentId=${id}`),
  ]);
  const base = `/departments/${id}/messages`;
  return (
    <>
      <Link href="/departments" className="text-[12px] text-fg2 hover:text-fg">
        ← My departments
      </Link>
      <div className="mt-2">
        <PageHeader
          title={department.name}
          subtitle="Messages to the department, with words Communications approved."
        />
      </div>
      <DepartmentTabs id={id} />
      {options && (
        <section className="mb-8">
          <Composer
            departmentId={id}
            options={options}
            templates={templates.filter((t) => t.status === 'ACTIVE')}
            canAdhoc={false}
            historyBase={base}
          />
        </section>
      )}
      <section>
        <h2 className="mb-2 text-[13px] font-semibold text-fg">Sent</h2>
        <HistoryTable rows={history.rows} base={base} showDepartment={false} />
      </section>
    </>
  );
}

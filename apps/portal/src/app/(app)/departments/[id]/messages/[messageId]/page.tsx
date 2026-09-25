import type { Metadata } from 'next';
import Link from 'next/link';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { ForbiddenState } from '@/components/shell/States';
import { MessageView } from '@/modules/comms/MessageView';
import type { MessageDetail } from '@/modules/comms/types';
import { leaderDepartment } from '@/modules/departments/leaderPage';

export const metadata: Metadata = { title: 'Message' };

export default async function DepartmentMessagePage({
  params,
}: {
  params: Promise<{ id: string; messageId: string }>;
}) {
  const { id, messageId } = await params;
  const found = await leaderDepartment(id);
  if (!found || !can(found.me, 'comms.department.read'))
    return <ForbiddenState what="this message" />;
  const message = await serverApi<MessageDetail>(`/comms/messages/${messageId}`);
  if (message.department?.id !== id) return <ForbiddenState what="this message" />;
  return (
    <>
      <Link href={`/departments/${id}/messages`} className="text-[12px] text-fg2 hover:text-fg">
        ← {found.department.name}
      </Link>
      <div className="mt-2">
        <PageHeader title={message.audienceName} />
      </div>
      <MessageView message={message} canCancel={can(found.me, 'comms.department.send')} />
    </>
  );
}

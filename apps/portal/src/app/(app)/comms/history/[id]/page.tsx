import type { Metadata } from 'next';
import Link from 'next/link';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { ForbiddenState } from '@/components/shell/States';
import { MessageView } from '@/modules/comms/MessageView';
import type { MessageDetail } from '@/modules/comms/types';

export const metadata: Metadata = { title: 'Message' };

export default async function MessagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'comms.messages.read')) return <ForbiddenState what="what was sent" />;
  const message = await serverApi<MessageDetail>(`/comms/messages/${id}`);
  return (
    <>
      <Link href="/comms/history" className="text-[12px] text-fg2 hover:text-fg">
        ← History
      </Link>
      <div className="mt-2">
        <PageHeader title={message.audienceName} />
      </div>
      <MessageView message={message} canCancel={can(me, 'comms.messages.cancel')} />
    </>
  );
}

import type { Metadata } from 'next';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { ForbiddenState } from '@/components/shell/States';
import { LogsView } from './LogsView';

export const metadata: Metadata = { title: 'Logs' };

/**
 * What the server wrote, and what people did, without opening a terminal.
 *
 * A dev sees every church. A church administrator lent this page
 * (`ADMIN_DEV_CONSOLE`) sees their own church's lines and the system's own,
 * which the API decides — this page only says which it got.
 */
export default async function LogsPage() {
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'dev.logs.read')) return <ForbiddenState what="the logs" />;

  return (
    <>
      <PageHeader
        title="Logs"
        subtitle="What the server wrote, and what people did. Newest first."
      />
      <LogsView
        timezone={me.church?.timezone ?? 'UTC'}
        isDev={can(me, 'dev.impersonations.read')}
      />
    </>
  );
}

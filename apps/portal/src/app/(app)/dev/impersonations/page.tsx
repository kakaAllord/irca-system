import type { Metadata } from 'next';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { ForbiddenState } from '@/components/shell/States';
import { Terminal } from '@/modules/dev/terminal/Terminal';

export const metadata: Metadata = { title: 'View-as log' };

export default async function ImpersonationsPage() {
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'dev.impersonations.read')) return <ForbiddenState what="the view-as log" />;

  return (
    <>
      <PageHeader
        title="View-as log"
        subtitle="Who opened the portal as someone else, where, and every page they saw. Nothing here can be changed, and no church can see it."
      />
      <Terminal />
    </>
  );
}

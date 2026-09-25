import type { Metadata } from 'next';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { ForbiddenState } from '@/components/shell/States';
import type { ApiClient, ChurchSettings as Settings } from '@/modules/dev/types';
import { ChurchSettings } from './ChurchSettings';
import { Keys } from './Keys';

export const metadata: Metadata = { title: 'Settings' };

/** What is set once at launch and rarely after: the church itself, and the form's keys. */
export default async function SettingsPage() {
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'dev.church.manage')) return <ForbiddenState what="the settings" />;

  const [church, clients] = await Promise.all([
    serverApi<Settings>('/dev/church'),
    serverApi<ApiClient[]>('/dev/api-clients'),
  ]);

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="The church, and the keys its registration form uses."
      />
      <div className="flex flex-col gap-6">
        <ChurchSettings church={church} />
        <Keys clients={clients} />
      </div>
    </>
  );
}

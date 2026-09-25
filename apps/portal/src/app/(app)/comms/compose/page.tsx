import type { Metadata } from 'next';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { ForbiddenState } from '@/components/shell/States';
import { Composer } from '@/modules/comms/Composer';
import type { AudienceOptions, Template } from '@/modules/comms/types';

export const metadata: Metadata = { title: 'Compose' };

export default async function ComposePage() {
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'comms.messages.send')) return <ForbiddenState what="sending messages" />;
  const [options, templates] = await Promise.all([
    serverApi<AudienceOptions>('/comms/audience-options'),
    can(me, 'comms.templates.read')
      ? serverApi<Template[]>('/comms/templates')
      : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeader
        title="Compose"
        subtitle="To the whole church, to departments, or to their leaders."
      />
      <Composer
        departmentId={null}
        options={options}
        templates={templates.filter((t) => t.status === 'ACTIVE')}
        canAdhoc={can(me, 'comms.messages.send_adhoc')}
        historyBase="/comms/history"
      />
    </>
  );
}

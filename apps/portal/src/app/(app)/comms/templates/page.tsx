import type { Metadata } from 'next';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { ForbiddenState } from '@/components/shell/States';
import { TemplatesPanel } from '@/modules/comms/TemplatesPanel';
import type { Template } from '@/modules/comms/types';

export const metadata: Metadata = { title: 'Templates' };

export default async function TemplatesPage() {
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'comms.templates.read')) return <ForbiddenState what="templates" />;
  const templates = await serverApi<Template[]>('/comms/templates');
  return (
    <>
      <PageHeader
        title="Templates"
        subtitle="The words, approved once and then used without asking. Every department's, and Communications' own."
      />
      <TemplatesPanel
        templates={templates}
        departmentId={null}
        draftPermission="comms.templates.draft"
      />
    </>
  );
}

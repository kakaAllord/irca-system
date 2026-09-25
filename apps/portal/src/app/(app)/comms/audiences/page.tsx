import type { Metadata } from 'next';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { ForbiddenState } from '@/components/shell/States';
import { AudiencesPanel, type ChurchAudience } from '@/modules/comms/AudiencesPanel';
import type { DepartmentRow } from '@/modules/departments/types';

export const metadata: Metadata = { title: 'Audiences' };

export default async function AudiencesPage() {
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'comms.audiences.read')) return <ForbiddenState what="audiences" />;
  const [audiences, departments] = await Promise.all([
    serverApi<ChurchAudience[]>('/comms/audiences'),
    can(me, 'admin.departments.read')
      ? serverApi<DepartmentRow[]>('/admin/departments')
      : serverApi<{ departments: { id: string; name: string }[] }>('/comms/audience-options')
          .then((o) => o.departments)
          .catch(() => []),
  ]);
  return (
    <>
      <PageHeader
        title="Audiences"
        subtitle="A department always reaches its own people. Anything wider is given here, on purpose."
      />
      <AudiencesPanel
        audiences={audiences}
        departments={departments
          .filter((d) => !('archived' in d) || !d.archived)
          .map((d) => ({ id: d.id, name: d.name }))}
      />
    </>
  );
}

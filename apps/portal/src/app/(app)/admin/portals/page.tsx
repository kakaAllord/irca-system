import type { Metadata } from 'next';
import Link from 'next/link';
import { isAssignable, moduleByKey, type MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { ForbiddenState } from '@/components/shell/States';
import { Badge } from '@/components/ui/Badge';
import { PortalToggle } from './PortalToggle';

export const metadata: Metadata = { title: 'Portals' };

type Portal = {
  key: string;
  name: string;
  description: string;
  kind: 'core' | 'department';
  enabled: boolean;
  peopleWithRoles: number;
  /** The department this portal belongs to (D28); null for the system's own. */
  department: { id: string; name: string } | null;
};

export default async function PortalsPage() {
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'admin.modules.read')) return <ForbiddenState what="portals" />;

  const portals = await serverApi<Portal[]>('/admin/modules');

  return (
    <>
      <PageHeader
        title="Portals"
        subtitle="A department's part of the system. A portal belongs to a department, and is turned on once it has one. People can only be given roles in portals that are on."
      />

      <div className="grid gap-3 md:grid-cols-2">
        {portals.map((portal) => (
          <section
            key={portal.key}
            className="flex flex-col gap-2 rounded-[10px] border border-border bg-surface p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-[13px] font-semibold text-fg">{portal.name}</h2>
              {portal.kind === 'core' ? (
                <Badge tone="neutral">Always on</Badge>
              ) : portal.department || portal.enabled ? (
                <PortalToggle portal={portal} canManage={can(me, 'admin.modules.manage')} />
              ) : (
                <Badge tone="muted">No department</Badge>
              )}
            </div>
            <p className="text-[12.5px] text-fg2">{portal.description}</p>
            {portal.kind === 'department' && (
              <p className="text-[11.5px] text-fg2">
                {portal.department ? (
                  <>
                    Belongs to{' '}
                    {can(me, 'admin.departments.read') ? (
                      <Link
                        href={`/admin/departments/${portal.department.id}`}
                        className="text-accent underline"
                      >
                        {portal.department.name}
                      </Link>
                    ) : (
                      portal.department.name
                    )}
                  </>
                ) : (
                  <>
                    Belongs to no department yet. Give it one in{' '}
                    {can(me, 'admin.departments.read') ? (
                      <Link href="/admin/departments" className="text-accent underline">
                        Departments
                      </Link>
                    ) : (
                      'Departments'
                    )}{' '}
                    before turning it on.
                  </>
                )}
              </p>
            )}
            <p className="text-[11.5px] text-fg3">
              {!Object.keys(moduleByKey(portal.key)?.permissions ?? {}).some(isAssignable)
                ? 'Nobody is given it: leading a department opens it.'
                : portal.enabled
                  ? `${portal.peopleWithRoles} ${portal.peopleWithRoles === 1 ? 'person has' : 'people have'} roles here`
                  : 'Turn on to create its roles.'}
            </p>
          </section>
        ))}
      </div>
    </>
  );
}

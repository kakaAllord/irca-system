import type { Metadata } from 'next';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { ForbiddenState } from '@/components/shell/States';
import { Badge } from '@/components/ui/Badge';
import { RoleDialog } from './RoleDialog';

export const metadata: Metadata = { title: 'Roles' };

export type RoleGroup = {
  moduleKey: string;
  moduleName: string;
  enabled: boolean;
  roles: {
    id: string;
    name: string;
    description: string;
    isSystem: boolean;
    memberCount: number;
    permissions: string[];
  }[];
};

export type PermissionDef = {
  key: string;
  kind: 'read' | 'write';
  label: string;
  hint: string | null;
};

export default async function RolesPage() {
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'admin.roles.read')) return <ForbiddenState what="roles" />;

  const groups = await serverApi<RoleGroup[]>('/admin/roles');
  const catalogues = Object.fromEntries(
    await Promise.all(
      groups.map(
        async (g) =>
          [
            g.moduleKey,
            await serverApi<PermissionDef[]>(`/admin/roles/catalogue/${g.moduleKey}`),
          ] as const,
      ),
    ),
  ) as Record<string, PermissionDef[]>;
  const editable = can(me, 'admin.roles.manage');

  return (
    <>
      <PageHeader
        title="Roles"
        subtitle="What each role allows. Built-in roles change only when a portal is updated."
      />

      <div className="flex flex-col gap-5">
        {groups.map((group) => (
          <section
            key={group.moduleKey}
            className="rounded-[10px] border border-border bg-surface p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-[13px] font-semibold text-fg">
                {group.moduleName}
                {!group.enabled && <Badge tone="muted">Portal off</Badge>}
              </h2>
              {editable && group.enabled && (
                <RoleDialog
                  moduleKey={group.moduleKey}
                  moduleName={group.moduleName}
                  permissions={catalogues[group.moduleKey] ?? []}
                />
              )}
            </div>

            <ul className="mt-3 flex flex-col divide-y divide-border2">
              {group.roles.map((role) => (
                <li
                  key={role.id}
                  className="flex flex-wrap items-start justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-[12.5px] font-medium text-fg">
                      {role.name}
                      <Badge tone={role.isSystem ? 'neutral' : 'accent'}>
                        {role.isSystem ? 'Built in' : 'Custom'}
                      </Badge>
                    </p>
                    <p className="text-[11.5px] text-fg3">{role.description}</p>
                    <p className="mt-1 text-[11.5px] text-fg2">
                      Can: {describe(role.permissions, catalogues[group.moduleKey] ?? [])}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-[11.5px] text-fg3">
                    <span>
                      {role.memberCount} {role.memberCount === 1 ? 'person' : 'people'}
                    </span>
                    {editable && !role.isSystem && (
                      <RoleDialog
                        moduleKey={group.moduleKey}
                        moduleName={group.moduleName}
                        permissions={catalogues[group.moduleKey] ?? []}
                        role={role}
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

/** "See who has access, invite new people" rather than a list of keys. */
function describe(permissionKeys: string[], catalogue: PermissionDef[]): string {
  const labels = permissionKeys
    .map((key) => catalogue.find((p) => p.key === key)?.label)
    .filter(Boolean) as string[];
  if (!labels.length) return 'nothing yet';
  return (
    labels.slice(0, 3).join(', ').toLowerCase() +
    (labels.length > 3 ? `, and ${labels.length - 3} more` : '')
  );
}

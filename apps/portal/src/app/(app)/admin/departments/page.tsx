import type { Metadata } from 'next';
import Link from 'next/link';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { EmptyState, ForbiddenState } from '@/components/shell/States';
import { Badge } from '@/components/ui/Badge';
import { Table, Row, Cell } from '@/components/ui/Table';
import { DepartmentDrawer } from '@/modules/departments/DepartmentDrawer';
import { portalChoices } from '@/modules/departments/portals';
import type { DepartmentRow } from '@/modules/departments/types';

export const metadata: Metadata = { title: 'Departments' };

export default async function DepartmentsPage() {
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'admin.departments.read')) return <ForbiddenState what="departments" />;

  const departments = await serverApi<DepartmentRow[]>('/admin/departments');

  return (
    <>
      <PageHeader
        title="Departments"
        subtitle="The church's departments and who leads them. Leaders add their own members."
        actions={
          can(me, 'admin.departments.manage') && (
            <DepartmentDrawer portals={portalChoices(departments)} />
          )
        }
      />

      {departments.length === 0 ? (
        <EmptyState title="No departments yet">
          Start with one the church already has, such as the praise team.
        </EmptyState>
      ) : (
        <Table head={['Department', 'Leaders', 'Members', 'Portal']}>
          {departments.map((d) => (
            <Row key={d.id}>
              <Cell>
                <Link href={`/admin/departments/${d.id}`} className="flex flex-col">
                  <span className="flex items-center gap-2 font-medium text-fg">
                    {d.name}
                    {d.archived && <Badge tone="muted">Archived</Badge>}
                  </span>
                  {d.description && (
                    <span className="truncate text-[11.5px] text-fg3">{d.description}</span>
                  )}
                </Link>
              </Cell>
              <Cell>
                {d.leaders.length ? (
                  <span className="text-fg2">
                    {d.leaders.map((l) => `${l.name} (${l.title})`).join(' · ')}
                  </span>
                ) : (
                  <span className="text-fg3">No leader yet</span>
                )}
              </Cell>
              <Cell nowrap>
                <span className="text-fg2">{d.memberCount}</span>
              </Cell>
              <Cell nowrap>
                {d.portal ? (
                  <Badge tone={d.portal.enabled ? 'positive' : 'muted'}>
                    {d.portal.name}
                    {d.portal.enabled ? '' : ' · off'}
                  </Badge>
                ) : (
                  <span className="text-fg3">—</span>
                )}
              </Cell>
            </Row>
          ))}
        </Table>
      )}
    </>
  );
}

'use client';

import { Can } from '@/lib/session';
import { EmptyState } from '@/components/shell/States';
import { Badge } from '@/components/ui/Badge';
import { Table, Row, Cell } from '@/components/ui/Table';
import { EndButton } from './EndButton';
import { NameLeaderDrawer } from './NameLeaderDrawer';
import { since, type DepartmentDetail } from './types';

/**
 * A department's leaders. Only an administrator names or ends one (D28); a
 * leader sees the same list with nothing to press.
 */
export function LeadersSection({ department }: { department: DepartmentDetail }) {
  const editable = !department.archived;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[14px] font-semibold text-fg">
          Leaders <span className="font-normal text-fg3">· {department.leaders.length}</span>
        </h2>
        {editable && (
          <Can permission="admin.departments.manage">
            <NameLeaderDrawer departmentId={department.id} name={department.name} />
          </Can>
        )}
      </div>
      {department.leaders.length === 0 ? (
        <EmptyState title="No leader yet">
          An administrator names one, from the confirmed members.
        </EmptyState>
      ) : (
        <Table head={['Name', 'Title', 'Since', '']}>
          {department.leaders.map((l) => (
            <Row key={l.id}>
              <Cell>
                <span className="flex items-center gap-2">
                  <span className="font-medium text-fg">{l.name}</span>
                  {l.account?.status === 'INVITED' && <Badge tone="accent">Invited</Badge>}
                  {l.account?.status === 'DISABLED' && <Badge tone="muted">Access disabled</Badge>}
                </span>
              </Cell>
              <Cell nowrap>
                <span className="text-fg2">{l.title}</span>
              </Cell>
              <Cell nowrap>
                <span className="text-fg2">{since(l.since)}</span>
              </Cell>
              <Cell nowrap>
                {editable && (
                  <Can permission="admin.departments.manage">
                    <EndButton
                      label="End"
                      question={`End ${l.name}'s leadership of ${department.name}?`}
                      explanation="They stop seeing the department and sending its messages straight away. Their account stays, and the record that they led is kept."
                      confirm="End it"
                      path={`/admin/departments/${department.id}/leaders/${l.id}/end`}
                    />
                  </Can>
                )}
              </Cell>
            </Row>
          ))}
        </Table>
      )}
    </section>
  );
}

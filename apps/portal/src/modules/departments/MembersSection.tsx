'use client';

import { Can } from '@/lib/session';
import { EmptyState } from '@/components/shell/States';
import { Table, Row, Cell } from '@/components/ui/Table';
import { STAGE_LABEL } from '../membership/types';
import { AddMemberDrawer } from './AddMemberDrawer';
import { EndButton } from './EndButton';
import { since, type DepartmentDetail } from './types';

/**
 * A department's members, with adding and removing for whoever may keep them:
 * its leaders (`departments.own.members`) or an administrator
 * (`admin.departments.manage`). The page says which, since the same list
 * serves both.
 */
export function MembersSection({
  department,
  permission,
}: {
  department: DepartmentDetail;
  permission: string;
}) {
  const editable = !department.archived;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[14px] font-semibold text-fg">
          Members <span className="font-normal text-fg3">· {department.members.length}</span>
        </h2>
        {editable && (
          <Can permission={permission}>
            <AddMemberDrawer departmentId={department.id} name={department.name} />
          </Can>
        )}
      </div>
      {department.members.length === 0 ? (
        <EmptyState title="Nobody in it yet">
          Its leaders add members from the church&apos;s People list.
        </EmptyState>
      ) : (
        <Table head={['Name', 'In it since', '']}>
          {department.members.map((m) => (
            <Row key={m.id}>
              <Cell>
                {/* One column on a phone, where leaders mostly are: the stage and
                    the end of the number sit under the name. */}
                <span className="flex flex-col">
                  <span className="font-medium text-fg">{m.name}</span>
                  <span className="text-[11.5px] text-fg3">
                    {[STAGE_LABEL[m.stage], m.phoneTail && `phone ${m.phoneTail}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              </Cell>
              <Cell nowrap>
                <span className="text-fg2">{since(m.since)}</span>
              </Cell>
              <Cell nowrap>
                {editable && (
                  <Can permission={permission}>
                    <EndButton
                      label="Remove"
                      question={`Take ${m.name} out of ${department.name}?`}
                      explanation="They stop getting the department's messages. The record that they were in it is kept."
                      confirm="Take them out"
                      path={`/departments/${department.id}/members/${m.id}/end`}
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

import type { Metadata } from 'next';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { Badge } from '@/components/ui/Badge';
import { Table, Row, Cell } from '@/components/ui/Table';
import { ago, type ChurchUser } from '@/modules/platform/types';
import { ViewAsButton } from './ViewAsButton';

export const metadata: Metadata = { title: 'People' };

export default async function PeoplePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [me, users] = await Promise.all([
    serverApi<MeResponse>('/auth/me'),
    serverApi<ChurchUser[]>(`/platform/churches/${id}/users`),
  ]);
  const canView = can(me, 'platform.users.impersonate');

  return (
    <>
      <Table head={['Person', 'Roles', 'Last active', '', '']}>
        {users.map((user) => (
          <Row key={user.userId}>
            <Cell>
              <span className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="flex size-7 flex-none items-center justify-center rounded-full bg-chip text-[11px] font-semibold text-fg2"
                >
                  {user.initials}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium text-fg">{user.fullName}</span>
                  <span className="truncate text-[11.5px] text-fg3">{user.email}</span>
                </span>
              </span>
            </Cell>
            <Cell>
              {user.roles.length ? (
                <span className="text-fg2">{user.roles.join(' · ')}</span>
              ) : (
                <span className="text-fg3">No role</span>
              )}
            </Cell>
            <Cell nowrap>
              <span className="text-fg2">{ago(user.lastActiveAt)}</span>
            </Cell>
            <Cell nowrap>
              {user.status === 'INVITED' && <Badge tone="accent">Invited</Badge>}
              {user.status === 'DISABLED' && <Badge tone="muted">Disabled</Badge>}
            </Cell>
            <Cell nowrap>
              {canView && user.canImpersonate && (
                <ViewAsButton
                  churchId={id}
                  userId={user.userId}
                  firstName={user.fullName.split(' ')[0] ?? user.fullName}
                />
              )}
            </Cell>
          </Row>
        ))}
      </Table>
      <p className="mt-2 text-[11.5px] text-fg3">
        Viewing as someone is read-only and silent: they are never told, and their church cannot see
        it. Every page you open is written to the view-as log.
      </p>
    </>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { EmptyState, ForbiddenState } from '@/components/shell/States';
import { Badge } from '@/components/ui/Badge';
import { Table, Row, Cell } from '@/components/ui/Table';
import { PeopleFilters } from './PeopleFilters';
import { InviteButton } from './InviteButton';

export const metadata: Metadata = { title: 'People' };

export type PersonRow = {
  userId: string;
  fullName: string;
  email: string;
  initials: string;
  status: 'ACTIVE' | 'INVITED' | 'DISABLED';
  roles: { id: string; name: string; moduleKey: string }[];
  lastActiveAt: string | null;
  invitation: { expiresAt: string; expired: boolean; sentCount: number } | null;
  isYou: boolean;
};

type RoleGroup = {
  moduleKey: string;
  moduleName: string;
  enabled: boolean;
  roles: {
    id: string;
    name: string;
    description: string;
    isSystem: boolean;
    permissions: string[];
  }[];
};

/** "2 hours ago", "yesterday", "3 Sept" — enough to see who is around. */
function when(iso: string | null): string {
  if (!iso) return 'Never';
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'admin.users.read')) return <ForbiddenState what="the people of this church" />;

  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of ['q', 'status', 'roleId'] as const) {
    if (params[key]) query.set(key, params[key]);
  }
  query.set('page', params.page ?? '1');

  const [{ rows, total }, roleGroups] = await Promise.all([
    serverApi<{ rows: PersonRow[]; total: number }>(`/admin/users?${query}`),
    can(me, 'admin.roles.read')
      ? serverApi<RoleGroup[]>('/admin/roles?assignable=true')
      : Promise.resolve([] as RoleGroup[]),
  ]);

  return (
    <>
      <PageHeader
        title="People"
        subtitle={`Everyone who can sign in to ${me.church?.name ?? 'this church'}.`}
        actions={can(me, 'admin.users.invite') && <InviteButton roleGroups={roleGroups} />}
      />

      <PeopleFilters roleGroups={roleGroups} total={total} shown={rows.length} />

      <div className="mt-4">
        {rows.length === 0 ? (
          <EmptyState title="Nobody matches these filters">
            <Link href="/admin/users" className="text-accent underline">
              Clear them
            </Link>
          </EmptyState>
        ) : (
          <Table head={['Person', 'Roles', 'Last active', '']}>
            {rows.map((person) => (
              <Row key={person.userId}>
                <Cell>
                  <Link
                    href={`/admin/users/${person.userId}`}
                    className="flex items-center gap-2.5"
                  >
                    <span
                      aria-hidden="true"
                      className="flex size-7 flex-none items-center justify-center rounded-full bg-chip text-[11px] font-semibold text-fg2"
                    >
                      {person.initials}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="flex items-center gap-1.5 font-medium text-fg">
                        {person.fullName}
                        {person.isYou && <span className="text-[11px] text-fg3">(you)</span>}
                      </span>
                      <span className="truncate text-[11.5px] text-fg3">{person.email}</span>
                    </span>
                  </Link>
                </Cell>
                <Cell>
                  {person.roles.length ? (
                    <span className="text-fg2">{person.roles.map((r) => r.name).join(' · ')}</span>
                  ) : (
                    <span className="text-fg3">No role yet</span>
                  )}
                </Cell>
                <Cell nowrap>
                  <span className="text-fg2">{when(person.lastActiveAt)}</span>
                </Cell>
                <Cell nowrap>
                  {person.status === 'INVITED' && (
                    <Badge tone={person.invitation?.expired ? 'danger' : 'accent'}>
                      {person.invitation?.expired ? 'Invitation expired' : 'Invited'}
                    </Badge>
                  )}
                  {person.status === 'DISABLED' && <Badge tone="muted">Disabled</Badge>}
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </div>
    </>
  );
}

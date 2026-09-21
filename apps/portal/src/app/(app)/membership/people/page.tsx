import type { Metadata } from 'next';
import Link from 'next/link';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { EmptyState, ForbiddenState } from '@/components/shell/States';
import type { PersonRow } from '@/modules/membership/types';
import { MembersFilters } from './MembersFilters';
import { MembersTable } from './MembersTable';
import { MembersActions } from './MembersActions';

export const metadata: Metadata = { title: 'Members' };

type Listed = { rows: PersonRow[]; total: number; tabCounts: Record<string, number> };

const KEYS = [
  'tab',
  'q',
  'salvation',
  'baptism',
  'gender',
  'age',
  'lives',
  'source',
  'page',
] as const;

/** Everyone the church is caring for, filtered as you type. */
export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'membership.people.read'))
    return <ForbiddenState what="the people of this church" />;

  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of KEYS) if (params[key]) query.set(key, params[key]);
  const data = await serverApi<Listed>(`/membership/people?${query}`);

  return (
    <>
      <PageHeader
        title="Members"
        subtitle="Everyone who has registered, and everyone the office has added."
        actions={<MembersActions query={query.toString()} />}
      />
      <MembersFilters counts={data.tabCounts} shown={data.rows.length} total={data.total} />
      <div className="mt-4">
        {data.rows.length === 0 ? (
          <EmptyState title="No member matches these filters.">
            <Link href="/membership/people" className="text-accent underline">
              Clear them
            </Link>
          </EmptyState>
        ) : (
          <MembersTable rows={data.rows} />
        )}
      </div>
    </>
  );
}

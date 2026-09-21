import type { Metadata } from 'next';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { ForbiddenState } from '@/components/shell/States';
import { EntryForm } from './EntryForm';

export const metadata: Metadata = { title: 'Record an entry' };

/** One form for both kinds; the words change, the rules do not. */
export default async function NewEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'finance.transactions.create')) return <ForbiddenState what="recording entries" />;

  const { kind } = await searchParams;
  const isIncome = kind === 'income';

  return (
    <div className="max-w-xl">
      <PageHeader
        title={isIncome ? 'Record income' : 'Record an expense'}
        subtitle={`${isIncome ? 'Received' : 'Paid out'} by ${me.church?.name ?? 'this church'}.`}
      />
      <EntryForm
        kind={isIncome ? 'income' : 'expense'}
        currency={me.church?.currency ?? 'TZS'}
        timezone={me.church?.timezone ?? 'UTC'}
      />
    </div>
  );
}

import type { Metadata } from 'next';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { ForbiddenState } from '@/components/shell/States';
import { RecordButtons } from '@/modules/finance/components/RecordButtons';

export const metadata: Metadata = { title: 'Record an entry' };

/**
 * The address recording an entry used to have.
 *
 * The form itself is now the right-hand drawer, like every other form in the
 * portal, so this page keeps the link working: it shows the transactions
 * heading with the drawer already open on the kind that was asked for.
 */
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
    <PageHeader
      title={isIncome ? 'Record income' : 'Record an expense'}
      subtitle={`${isIncome ? 'Received' : 'Paid out'} by ${me.church?.name ?? 'this church'}.`}
      actions={
        <RecordButtons
          currency={me.church?.currency ?? 'TZS'}
          timezone={me.church?.timezone ?? 'UTC'}
          initial={isIncome ? 'income' : 'expense'}
        />
      }
    />
  );
}

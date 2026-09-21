import type { Metadata } from 'next';
import Link from 'next/link';
import type { CatalogItem, MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { EmptyState, ForbiddenState } from '@/components/shell/States';
import { Badge } from '@/components/ui/Badge';
import { Table, Row, Cell } from '@/components/ui/Table';
import { ItemActions, NewItemButton } from './ItemActions';
import { cn } from '@/lib/cn';

export const metadata: Metadata = { title: 'Lists' };

/**
 * The two lists everything is recorded against.
 *
 * Nothing can be deleted here. An item that has been used has to keep
 * existing for the old entries to mean anything; one that is finished with is
 * turned off, and stops being offered.
 */
export default async function ListsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; status?: string }>;
}) {
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'finance.catalog.read')) return <ForbiddenState what="the finance lists" />;

  const params = await searchParams;
  const kind = params.tab === 'income' ? 'income' : 'expense';
  const status = params.status ?? 'active';
  const path = kind === 'income' ? 'income-sources' : 'expense-items';
  const { rows } = await serverApi<{ rows: CatalogItem[] }>(`/finance/${path}?status=${status}`);

  return (
    <>
      <PageHeader
        title="Lists"
        subtitle="What income and expenses are recorded against."
        actions={<NewItemButton kind={kind} />}
      />

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {(
          [
            { key: 'expense', label: 'Expense items' },
            { key: 'income', label: 'Income sources' },
          ] as const
        ).map((tab) => (
          <Link
            key={tab.key}
            href={`/finance/lists?tab=${tab.key}`}
            aria-current={kind === tab.key ? 'page' : undefined}
            className={cn(
              'rounded-full border px-3 py-1 text-[12px]',
              kind === tab.key
                ? 'border-accent-br bg-chip text-fg'
                : 'border-border text-fg2 hover:bg-hover',
            )}
          >
            {tab.label}
          </Link>
        ))}
        <Link
          href={`/finance/lists?tab=${kind}&status=${status === 'all' ? 'active' : 'all'}`}
          className="ml-auto text-[12px] text-accent underline"
        >
          {status === 'all' ? 'Show only what is on' : 'Show the ones turned off too'}
        </Link>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Nothing in this list yet">
          Items are added here, or while recording an entry.
        </EmptyState>
      ) : (
        <Table head={['Name', 'Description', 'Used', 'Last used', '']}>
          {rows.map((item) => (
            <Row key={item.id}>
              <Cell>
                <span className="flex items-center gap-2">
                  <span className={item.isActive ? 'text-fg' : 'text-fg3'}>{item.name}</span>
                  {!item.isActive && <Badge tone="muted">Off</Badge>}
                </span>
              </Cell>
              <Cell>
                <span className="text-fg2">{item.description || '—'}</span>
              </Cell>
              <Cell nowrap>
                <span className="tabular-nums text-fg2">{item.uses}</span>
              </Cell>
              <Cell nowrap>
                <span className="text-fg2">{item.lastUsedOn ? day(item.lastUsedOn) : '—'}</span>
              </Cell>
              <Cell nowrap>
                <ItemActions kind={kind} item={item} />
              </Cell>
            </Row>
          ))}
        </Table>
      )}
    </>
  );
}

const day = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

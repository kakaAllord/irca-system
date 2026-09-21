import { PageHeader } from '@/components/shell/PageHeader';
import { EmptyState } from '@/components/shell/States';

/** Placeholder until Phase 3 builds this page. */
export default function Page() {
  return (
    <>
      <PageHeader title="People" subtitle="Everyone who can sign in to this church." />
      <EmptyState title="Not built yet">This page arrives with the Admin portal.</EmptyState>
    </>
  );
}

import { PageHeader } from '@/components/shell/PageHeader';
import { EmptyState } from '@/components/shell/States';

/** Placeholder until Phase 3 builds this page. */
export default function Page() {
  return (
    <>
      <PageHeader title="Portals" subtitle="The parts of the system this church uses." />
      <EmptyState title="Not built yet">This page arrives with the Admin portal.</EmptyState>
    </>
  );
}

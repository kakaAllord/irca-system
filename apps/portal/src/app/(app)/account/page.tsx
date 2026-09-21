import { PageHeader } from '@/components/shell/PageHeader';
import { EmptyState } from '@/components/shell/States';

/** Placeholder until Phase 3 builds this page. */
export default function Page() {
  return (
    <>
      <PageHeader title="Account" subtitle="Your details, password and devices." />
      <EmptyState title="Not built yet">This page arrives with the Admin portal.</EmptyState>
    </>
  );
}

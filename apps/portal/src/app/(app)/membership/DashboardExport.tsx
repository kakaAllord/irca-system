'use client';

import { Button } from '@/components/ui/Button';
import { Can } from '@/lib/session';

export function DashboardExport() {
  return (
    <Can permission="membership.people.export">
      <Button
        variant="secondary"
        onClick={() => {
          window.location.href = '/api/membership/people/export.csv';
        }}
      >
        Export CSV
      </Button>
    </Can>
  );
}

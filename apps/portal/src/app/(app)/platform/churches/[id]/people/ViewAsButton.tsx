'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { Button } from '@/components/ui/Button';

/** Opens the portal as this person, in their church, read-only. */
export function ViewAsButton({
  churchId,
  userId,
  firstName,
}: {
  churchId: string;
  userId: string;
  firstName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-[11.5px] text-danger">{error}</span>}
      <Button
        size="sm"
        variant="secondary"
        loading={busy}
        title={`See the portal exactly as ${firstName} does. Read-only, and written to the view-as log.`}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await clientApi('/impersonation', {
              method: 'POST',
              body: { subjectUserId: userId, churchId },
            });
            router.push('/');
            router.refresh();
          } catch (err) {
            setBusy(false);
            setError(err instanceof ApiRequestError ? err.message : 'It did not work.');
          }
        }}
      >
        View as {firstName}
      </Button>
    </span>
  );
}

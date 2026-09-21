'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clientApi } from '@/lib/api/client';
import { useMe } from '@/lib/session';
import { Button } from '@/components/ui/Button';

/** For someone who serves more than one church. */
export function ChurchSwitcher({ onClose }: { onClose: () => void }) {
  const me = useMe();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Switch church"
        className="w-full max-w-sm rounded-[12px] border border-border bg-surface p-5"
      >
        <h2 className="text-[15px] font-semibold text-fg">Switch church</h2>
        <ul className="mt-3 flex flex-col gap-1">
          {me.churches.map((church) => (
            <li key={church.id}>
              <Button
                variant={church.id === me.church?.id ? 'primary' : 'secondary'}
                loading={busy === church.id}
                className="w-full justify-start"
                onClick={async () => {
                  setBusy(church.id);
                  await clientApi('/auth/church', {
                    method: 'POST',
                    body: { churchId: church.id },
                  });
                  onClose();
                  router.replace('/');
                  router.refresh();
                }}
              >
                {church.name}
              </Button>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clientApi } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { useMe } from '@/lib/session';

const minutesLeft = (expiresAt: string) =>
  Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 60_000));

/**
 * Shown to the person doing the viewing, never to the person being viewed,
 * who is not told at all. It is impossible to miss: it sits above everything,
 * the tab title says it too, and it counts down to when it ends by itself.
 */
export function ImpersonationBanner() {
  const me = useMe();
  const router = useRouter();
  const impersonation = me.impersonation;
  const [left, setLeft] = useState(() =>
    impersonation ? minutesLeft(impersonation.expiresAt) : 0,
  );
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    if (!impersonation) return;
    document.title = `[Viewing as ${me.user.fullName}] ${document.title}`;
    const timer = setInterval(() => {
      const remaining = minutesLeft(impersonation.expiresAt);
      setLeft(remaining);
      if (remaining <= 0) router.refresh();
    }, 30_000);
    return () => clearInterval(timer);
  }, [impersonation, me.user.fullName, router]);

  if (!impersonation) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-warn-br bg-warn-bg px-4 py-2 text-[12.5px] text-warn-fg"
    >
      <span>
        <strong className="font-semibold">Viewing as {me.user.fullName}</strong>
        {me.roleLabels.length > 0 && ` (${me.roleLabels.join(' · ')})`} · read-only · ends in {left}{' '}
        min
      </span>
      <Button
        size="sm"
        variant="secondary"
        loading={stopping}
        className="ml-auto"
        onClick={async () => {
          setStopping(true);
          await clientApi('/impersonation', { method: 'DELETE' }).catch(() => undefined);
          const back = sessionStorage.getItem('irca_return_to');
          sessionStorage.removeItem('irca_return_to');
          router.replace(back && back.startsWith('/') ? back : '/');
          router.refresh();
        }}
      >
        Stop viewing
      </Button>
    </div>
  );
}

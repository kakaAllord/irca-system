'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Badge } from '@/components/ui/Badge';

type Portal = { key: string; name: string; enabled: boolean; peopleWithRoles: number };

export function PortalToggle({ portal, canManage }: { portal: Portal; canManage: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canManage)
    return (
      <Badge tone={portal.enabled ? 'positive' : 'muted'}>{portal.enabled ? 'On' : 'Off'}</Badge>
    );

  async function set(enabled: boolean) {
    setBusy(true);
    setError(null);
    try {
      await clientApi(`/admin/modules/${portal.key}`, { method: 'PUT', body: { enabled } });
      setConfirming(false);
      setUnderstood(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant={portal.enabled ? 'ghost' : 'primary'}
        loading={busy && !confirming}
        onClick={() => (portal.enabled ? setConfirming(true) : set(true))}
      >
        {portal.enabled ? 'Turn off' : 'Turn on'}
      </Button>

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Turn off ${portal.name}?`}
        description={`${portal.peopleWithRoles} ${portal.peopleWithRoles === 1 ? 'person loses' : 'people lose'} access to ${portal.name} straight away. Their roles and every record are kept, and come back if you turn it on again.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={!understood}
              loading={busy}
              onClick={() => set(false)}
            >
              Turn it off
            </Button>
          </>
        }
      >
        <label className="flex items-center gap-2 text-[12.5px] text-fg2">
          <input
            type="checkbox"
            checked={understood}
            onChange={(e) => setUnderstood(e.target.checked)}
          />
          I understand
        </label>
        {error && <p className="mt-2 text-[12px] text-danger">{error}</p>}
      </Dialog>
    </>
  );
}

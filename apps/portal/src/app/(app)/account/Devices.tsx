'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clientApi } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import type { Device } from './page';

export function Devices({ devices, readOnly }: { devices: Device[]; readOnly: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function revoke(path: string, key: string) {
    setBusy(key);
    await clientApi(path, { method: 'DELETE' }).catch(() => undefined);
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-border2">
        {devices.map((device) => (
          <li
            key={device.id}
            className="flex flex-wrap items-center justify-between gap-2 py-2 text-[12.5px]"
          >
            <span>
              <span className="font-medium text-fg">{device.device}</span>
              {device.isThisOne && <span className="ml-1.5 text-[11px] text-pos">this device</span>}
              <span className="block text-[11.5px] text-fg3">
                {device.ip ?? 'unknown address'} · last used{' '}
                {new Date(device.lastSeenAt).toLocaleString('en-GB', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </span>
            </span>
            {!readOnly && !device.isThisOne && (
              <Button
                variant="ghost"
                size="sm"
                loading={busy === device.id}
                onClick={() => revoke(`/me/sessions/${device.id}`, device.id)}
              >
                Sign out
              </Button>
            )}
          </li>
        ))}
      </ul>
      {!readOnly && devices.length > 1 && (
        <div>
          <Button
            variant="secondary"
            size="sm"
            loading={busy === 'all'}
            onClick={() => revoke('/me/sessions', 'all')}
          >
            Sign out everywhere else
          </Button>
        </div>
      )}
    </div>
  );
}

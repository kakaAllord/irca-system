'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clientApi } from '@/lib/api/client';

/** Staff are texted too (reminders, the leaders' messages); here they can turn it off. */
export function TextsToggle({
  optOut,
  phone,
  readOnly,
}: {
  optOut: boolean;
  phone: string | null;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function set(next: boolean) {
    setBusy(true);
    await clientApi('/me/messages', { method: 'PUT', body: { optOut: next } });
    setBusy(false);
    router.refresh();
  }
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center gap-2 text-[12.5px] text-fg">
        <input
          type="checkbox"
          checked={!optOut}
          disabled={readOnly || busy}
          onChange={(e) => set(!e.target.checked)}
        />
        Text me the church&apos;s messages
      </label>
      <p className="text-[11.5px] text-fg3">
        {phone
          ? `To ${phone}.`
          : 'There is no phone number on your account or your record in People.'}{' '}
        Replying STOP to any message does the same as turning this off.
      </p>
    </div>
  );
}

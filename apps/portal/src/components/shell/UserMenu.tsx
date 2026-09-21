'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clientApi } from '@/lib/api/client';
import { useMe } from '@/lib/session';
import { cn } from '@/lib/cn';
import { ChurchSwitcher } from './ChurchSwitcher';

/** The signed-in person, at the foot of the sidebar, as in the design. */
export function UserMenu({ collapsed }: { collapsed: boolean }) {
  const me = useMe();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  return (
    <div className="relative border-t border-border2 pt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-left hover:bg-hover',
          collapsed && 'justify-center',
        )}
      >
        <span
          aria-hidden="true"
          className="flex size-7 flex-none items-center justify-center rounded-full bg-chip text-[11px] font-semibold text-fg2"
        >
          {me.user.initials}
        </span>
        {!collapsed && (
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-[12.5px] font-medium text-fg">{me.user.fullName}</span>
            <span className="truncate text-[11px] text-fg3">
              {me.roleLabels[0] ?? 'No role yet'}
            </span>
          </span>
        )}
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-[200px] rounded-[10px] border border-border bg-surface p-1 shadow-lg">
          <Link
            href="/account"
            onClick={() => setOpen(false)}
            className="block rounded-[7px] px-2.5 py-1.5 text-[12.5px] text-fg2 hover:bg-hover hover:text-fg"
          >
            Account
          </Link>
          {me.churches.length > 1 && (
            <button
              type="button"
              onClick={() => setSwitching(true)}
              className="block w-full rounded-[7px] px-2.5 py-1.5 text-left text-[12.5px] text-fg2 hover:bg-hover hover:text-fg"
            >
              Switch church
            </button>
          )}
          <button
            type="button"
            onClick={async () => {
              await clientApi('/auth/logout', { method: 'POST' }).catch(() => undefined);
              router.replace('/login');
              router.refresh();
            }}
            className="block w-full rounded-[7px] px-2.5 py-1.5 text-left text-[12.5px] text-fg2 hover:bg-hover hover:text-fg"
          >
            Sign out
          </button>
        </div>
      )}

      {switching && <ChurchSwitcher onClose={() => setSwitching(false)} />}
    </div>
  );
}

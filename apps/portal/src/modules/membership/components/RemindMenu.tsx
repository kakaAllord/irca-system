'use client';

import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { useState } from 'react';
import { clientApi } from '@/lib/api/client';
import { Can } from '@/lib/session';

type Link = { url: string; message: string; whatsappUrl: string | null };

/**
 * Sending someone their own link to finish the form.
 *
 * Copy it, or open WhatsApp with a message already written in the language
 * they chose. Either way the reminder is recorded, so two people in the office
 * do not both chase the same visitor on the same afternoon.
 */
export function RemindMenu({ personId, label = 'Remind' }: { personId: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function link(): Promise<Link> {
    return clientApi<Link>(`/membership/people/${personId}/registration-link`);
  }
  const record = (channel: 'COPY_LINK' | 'WHATSAPP') =>
    clientApi(`/membership/people/${personId}/reminders`, {
      method: 'POST',
      body: { channel },
    }).catch(() => undefined);

  return (
    <Can permission="membership.registrations.remind">
      <Menu>
        <MenuButton className="inline-flex h-7 items-center rounded-[7px] border border-border px-2.5 text-[11.5px] font-medium text-fg hover:bg-hover">
          {copied ? 'Link copied' : label} ▾
        </MenuButton>
        <MenuItems
          anchor="bottom end"
          className="z-30 mt-1 w-48 rounded-[10px] border border-border bg-surface py-1 shadow-xl"
        >
          <MenuItem>
            <button
              type="button"
              className="w-full px-3 py-2 text-left text-[12.5px] text-fg data-focus:bg-hover"
              onClick={async () => {
                const { url } = await link();
                await navigator.clipboard.writeText(url);
                await record('COPY_LINK');
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              Copy their link
            </button>
          </MenuItem>
          <MenuItem>
            <button
              type="button"
              className="w-full px-3 py-2 text-left text-[12.5px] text-fg data-focus:bg-hover"
              onClick={async () => {
                const { whatsappUrl } = await link();
                if (!whatsappUrl) return;
                await record('WHATSAPP');
                window.open(whatsappUrl, '_blank', 'noopener');
              }}
            >
              Open WhatsApp
            </button>
          </MenuItem>
        </MenuItems>
      </Menu>
    </Can>
  );
}

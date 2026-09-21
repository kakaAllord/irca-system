'use client';

import { useState, type ReactNode } from 'react';
import type { Theme } from '@/lib/theme';
import { Sidebar } from './Sidebar';
import { ThemeToggle } from './ThemeToggle';
import { ImpersonationBanner } from './ImpersonationBanner';

/**
 * The portal's frame: the sidebar, the impersonation banner above everything,
 * and the page itself. On a phone the sidebar becomes a drawer, so the same
 * pages work at 360 pixels.
 */
export function Shell({
  theme,
  sidebarCollapsed,
  children,
}: {
  theme: Theme;
  sidebarCollapsed: boolean;
  children: ReactNode;
}) {
  const [drawer, setDrawer] = useState(false);

  return (
    <div className="flex min-h-dvh flex-col">
      <ImpersonationBanner />
      <div className="flex flex-1">
        <aside className="hidden md:block">
          <div className="sticky top-0 h-dvh">
            <Sidebar collapsedInitially={sidebarCollapsed} />
          </div>
        </aside>

        {drawer && (
          <div className="fixed inset-0 z-40 flex md:hidden">
            <div className="h-full bg-sidebar">
              <Sidebar collapsedInitially={false} onNavigate={() => setDrawer(false)} />
            </div>
            <button
              type="button"
              aria-label="Close menu"
              className="flex-1 bg-black/40"
              onClick={() => setDrawer(false)}
            />
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-2 border-b border-border px-4 py-2.5 md:justify-end">
            <button
              type="button"
              onClick={() => setDrawer(true)}
              className="rounded-[7px] border border-border px-2.5 py-1 text-[12px] text-fg2 md:hidden"
            >
              Menu
            </button>
            <span className="ml-auto flex items-center gap-2 md:ml-0">
              <span className="flex items-center gap-1.5 text-[11.5px] text-fg3">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-pos" />
                Live
              </span>
              <ThemeToggle initial={theme} />
            </span>
          </header>
          <main className="min-w-0 flex-1 px-4 py-6 md:px-7">{children}</main>
        </div>
      </div>
    </div>
  );
}

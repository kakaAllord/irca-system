'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useMe } from '@/lib/session';
import { Logo } from '@/components/Logo';
import { NavIcon } from './NavIcon';
import { cn } from '@/lib/cn';
import { UserMenu } from './UserMenu';

/** The active page is the longest link that the current path starts with. */
function useActiveHref(hrefs: string[]): string | null {
  const pathname = usePathname();
  return (
    hrefs
      .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
      .sort((a, b) => b.length - a.length)[0] ?? null
  );
}

export function Sidebar({
  collapsedInitially,
  onNavigate,
}: {
  collapsedInitially: boolean;
  onNavigate?: () => void;
}) {
  const me = useMe();
  const [collapsed, setCollapsed] = useState(collapsedInitially);
  const active = useActiveHref(me.modules.flatMap((m) => m.nav.map((n) => n.href)));

  return (
    <nav
      aria-label="Portals"
      className={cn(
        'flex h-full flex-col gap-1 border-r border-border bg-sidebar p-2.5',
        collapsed ? 'w-16' : 'w-[218px]',
        me.impersonation && 'border-t-[3px] border-t-warn-br',
      )}
    >
      <div className="flex items-center gap-2.5 px-1.5 py-2">
        <Logo size={28} />
        {!collapsed && (
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-[12.5px] font-semibold text-fg">
              {me.church?.code ?? 'IRCA'}
            </span>
            <span className="text-[11px] text-fg3">Admin portal</span>
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto pt-2">
        {me.modules.map((module) => (
          <div key={module.key} className="flex flex-col gap-0.5">
            {!collapsed && (
              <p className="px-2 pb-1 text-[10.5px] font-semibold tracking-wide text-fg3 uppercase">
                {module.name}
              </p>
            )}
            {module.nav.map((item) => {
              const on = item.href === active;
              const badge = me.badges[item.href];
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={on ? 'page' : undefined}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    'flex items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-[12.5px] font-medium',
                    on ? 'bg-surface text-fg shadow-sm' : 'text-fg2 hover:bg-hover hover:text-fg',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-[22px] flex-none items-center justify-center rounded-[6px] border',
                      on ? 'border-accent bg-accent text-accent-ink' : 'border-border text-fg3',
                    )}
                  >
                    <NavIcon name={item.icon} />
                  </span>
                  {!collapsed && <span className="truncate">{item.label}</span>}
                  {/* Something waiting should be visible without opening the page. */}
                  {badge ? (
                    <span
                      className="ml-auto flex min-w-[18px] items-center justify-center rounded-full bg-accent px-1.5 text-[10.5px] font-semibold text-accent-ink"
                      aria-label={`${badge} waiting`}
                    >
                      {badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => {
          const next = !collapsed;
          setCollapsed(next);
          document.cookie = `irca_sidebar=${next ? 'collapsed' : 'open'}; path=/; max-age=31536000; samesite=lax`;
        }}
        className="flex items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-[12px] text-fg3 hover:bg-hover hover:text-fg"
      >
        <span aria-hidden="true" className="w-[22px] text-center">
          {collapsed ? '»' : '«'}
        </span>
        {!collapsed && 'Collapse'}
      </button>

      <UserMenu collapsed={collapsed} />
    </nav>
  );
}

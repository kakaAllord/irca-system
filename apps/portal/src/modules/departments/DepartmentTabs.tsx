'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCan } from '@/lib/session';
import { cn } from '@/lib/cn';

/**
 * A department's pages, for its leaders: its people, and — while the
 * Communications portal is on — its messages, templates and recurring ones.
 */
export function DepartmentTabs({ id }: { id: string }) {
  const pathname = usePathname();
  const can = useCan();
  const base = `/departments/${id}`;
  const tabs = [
    { href: base, label: 'People', show: true },
    { href: `${base}/messages`, label: 'Messages', show: can('comms.department.read') },
    { href: `${base}/templates`, label: 'Templates', show: can('comms.department.read') },
    { href: `${base}/recurring`, label: 'Recurring', show: can('comms.department.read') },
  ].filter((t) => t.show);
  if (tabs.length < 2) return null;
  return (
    <nav aria-label="Department" className="mb-5 flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((tab) => {
        const on = tab.href === base ? pathname === base : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={on ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-[12.5px] font-medium whitespace-nowrap',
              on
                ? 'border-accent text-fg'
                : 'border-transparent text-fg3 hover:border-border hover:text-fg2',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

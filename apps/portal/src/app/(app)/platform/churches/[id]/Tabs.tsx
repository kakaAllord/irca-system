'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

/** The parts of a church, in the order a dev usually wants them. */
export function Tabs({ id, canManage }: { id: string; canManage: boolean }) {
  const pathname = usePathname();
  const base = `/platform/churches/${id}`;
  const tabs = [
    { href: base, label: 'Overview' },
    { href: `${base}/usage`, label: 'Usage' },
    { href: `${base}/database`, label: 'Database' },
    { href: `${base}/people`, label: 'People' },
    { href: `${base}/activity`, label: 'Activity' },
    ...(canManage ? [{ href: `${base}/keys`, label: 'Keys' }] : []),
  ];

  return (
    <nav aria-label="This church" className="flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((tab) => {
        const on = pathname === tab.href;
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

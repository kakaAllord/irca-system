'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

const TABS = [
  { href: '/dev/usage', label: 'Overview' },
  { href: '/dev/usage/charts', label: 'Every number' },
  { href: '/dev/usage/database', label: 'Database' },
  { href: '/dev/usage/api', label: 'API' },
  { href: '/dev/usage/sign-ins', label: 'Sign-ins' },
  { href: '/dev/usage/email', label: 'Email' },
];

/** The parts of the usage pages, in the order a developer usually wants them. */
export function Tabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Usage" className="flex gap-1 overflow-x-auto border-b border-border">
      {TABS.map((tab) => {
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

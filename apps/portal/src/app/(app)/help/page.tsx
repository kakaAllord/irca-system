import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/shell/PageHeader';

export const metadata: Metadata = { title: 'Help' };

const GUIDES = [
  {
    href: '/help/getting-started',
    title: 'Getting started',
    about:
      'Accepting your invitation, signing in, a forgotten password, what the sidebar shows you, and what "viewing as" means.',
  },
  {
    href: '/help/finance',
    title: 'Finance in five minutes',
    about:
      'Recording an expense, a stack of receipts at once, reading an entry number, voiding a mistake, and printing the statement.',
  },
];

/** The two guides handed out at training, kept here so they are never lost. */
export default function HelpPage() {
  return (
    <>
      <PageHeader title="Help" subtitle="Each guide is one page, and prints as one." />
      <div className="grid gap-3 sm:grid-cols-2">
        {GUIDES.map((guide) => (
          <Link
            key={guide.href}
            href={guide.href}
            className="rounded-[10px] border border-border bg-surface p-4 hover:bg-hover"
          >
            <h2 className="text-[14px] font-semibold text-fg">{guide.title}</h2>
            <p className="mt-1 text-[12.5px] text-fg2">{guide.about}</p>
          </Link>
        ))}
      </div>
    </>
  );
}

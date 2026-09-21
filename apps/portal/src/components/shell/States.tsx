import Link from 'next/link';
import type { ReactNode } from 'react';

/** A page this person may not open. Said plainly, rather than pretending it is missing. */
export function ForbiddenState({ what = 'this page' }: { what?: string }) {
  return (
    <div className="mx-auto max-w-md rounded-[12px] border border-border bg-surface p-7 text-center">
      <h1 className="text-[16px] font-semibold text-fg">You don&apos;t have access to {what}</h1>
      <p className="mt-2 text-[12.5px] text-fg2">
        Ask your church administrator if you need it. They can give you the right role.
      </p>
      <Link href="/" className="mt-4 inline-block text-[12.5px] text-accent underline">
        Go back
      </Link>
    </div>
  );
}

/** Signed in, but nobody has given them anything yet. */
export function NoAccessState({ admins }: { admins: string[] }) {
  return (
    <div className="mx-auto max-w-md rounded-[12px] border border-border bg-surface p-7 text-center">
      <h1 className="text-[16px] font-semibold text-fg">No portals yet</h1>
      <p className="mt-2 text-[12.5px] text-fg2">
        You&apos;re signed in, but no portals have been given to you yet.
        {admins.length > 0 && ` Ask ${admins.join(' or ')} to add you.`}
      </p>
    </div>
  );
}

/** A list with nothing in it, with the way out where the eye lands. */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-[10px] border border-dashed border-border p-8 text-center">
      <p className="text-[13px] font-medium text-fg">{title}</p>
      {children && <div className="mt-1.5 text-[12.5px] text-fg2">{children}</div>}
    </div>
  );
}

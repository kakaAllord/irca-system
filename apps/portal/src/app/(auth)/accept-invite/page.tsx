import type { Metadata } from 'next';
import Link from 'next/link';
import { serverApi } from '@/lib/api/server';
import { ApiRequestError } from '@/lib/api/errors';
import { AcceptForm } from './AcceptForm';

export const metadata: Metadata = { title: 'Accept your invitation' };

type Invitation = {
  churchName: string;
  email: string;
  fullName: string;
  inviterName: string;
  roleSummary: string;
  needsPassword: boolean;
};

const WHY: Record<string, string> = {
  used: 'This invitation has already been used. Sign in instead.',
  revoked: 'This invitation was cancelled. Ask your church administrator for a new one.',
  expired: 'This invitation has expired. Ask your church administrator to send a new one.',
};

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const token = (await searchParams).token ?? '';

  let invitation: Invitation | null = null;
  let problem = 'This invitation link is not valid.';
  try {
    invitation = await serverApi<Invitation>(`/invitations/${encodeURIComponent(token)}`);
  } catch (err) {
    if (err instanceof ApiRequestError) {
      const reason = (err.fieldErrors as unknown as { reason?: string })?.reason;
      problem = (reason && WHY[reason]) || err.message;
    }
  }

  if (!invitation) {
    return (
      <>
        <h1 className="text-[20px] font-semibold text-fg">This link cannot be used</h1>
        <p className="mt-2 text-[12.5px] text-fg2">{problem}</p>
        <Link href="/login" className="mt-4 inline-block text-[12.5px] text-accent underline">
          Go to sign in
        </Link>
      </>
    );
  }

  return (
    <>
      <h1 className="text-[20px] font-semibold text-fg">
        Welcome, {invitation.fullName.split(' ')[0]}
      </h1>
      <p className="mt-1 text-[12.5px] text-fg2">
        {invitation.inviterName} has given you access to <strong>{invitation.churchName}</strong> as{' '}
        {invitation.roleSummary}.
      </p>
      <div className="mt-6">
        <AcceptForm token={token} invitation={invitation} />
      </div>
    </>
  );
}

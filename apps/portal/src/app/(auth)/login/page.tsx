import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { safeNext } from '@/lib/safe-next';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const next = safeNext((await searchParams).next);
  // Already signed in: go straight on, rather than show a form for nothing.
  const me = await serverApi<MeResponse>('/auth/me', { onUnauthorized: 'null' });
  if (me) redirect(next);

  return (
    <>
      <h1 className="text-[20px] font-semibold text-fg">Sign in</h1>
      <p className="mt-1 text-[12.5px] text-fg2">
        Use the email your church administrator invited you with.
      </p>
      <div className="mt-6">
        <LoginForm next={next} />
      </div>
    </>
  );
}

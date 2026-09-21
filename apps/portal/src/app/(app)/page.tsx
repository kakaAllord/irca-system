import type { Metadata } from 'next';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { Brand } from '@/components/Brand';
import { SignOutButton } from './SignOutButton';

export const metadata: Metadata = { title: 'Home' };

/** A placeholder home until Phase 2 draws the portal's frame and modules. */
export default async function Home() {
  const me = await serverApi<MeResponse>('/auth/me');
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-10">
      <Brand churchName={me.church?.code ?? 'IRCA'} />
      <div className="rounded-[12px] border border-border bg-surface p-6">
        <p className="text-[13px] text-fg2">Signed in as</p>
        <p className="mt-1 text-[16px] font-semibold text-fg">{me.user.fullName}</p>
        <p className="text-[12.5px] text-fg3">{me.user.email}</p>
        <p className="mt-4 text-[12.5px] text-fg2">
          {me.church
            ? `Working in ${me.church.name}`
            : me.user.platformRole === 'DEV'
              ? 'Platform dev: no church selected'
              : 'No church selected'}
        </p>
        <div className="mt-6">
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}

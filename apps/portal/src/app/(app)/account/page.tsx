import type { Metadata } from 'next';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { PageHeader } from '@/components/shell/PageHeader';
import { ProfileForm } from './ProfileForm';
import { PasswordForm } from './PasswordForm';
import { Devices } from './Devices';

export const metadata: Metadata = { title: 'Account' };

export type Device = {
  id: string;
  device: string;
  ip: string | null;
  startedAt: string;
  lastSeenAt: string;
  isThisOne: boolean;
};

export default async function AccountPage() {
  const me = await serverApi<MeResponse>('/auth/me');
  const devices = await serverApi<Device[]>('/me/sessions');
  const viewing = me.impersonation !== null;

  return (
    <>
      <PageHeader title="Account" subtitle={me.user.email} />
      <div className="flex max-w-xl flex-col gap-5">
        <section className="rounded-[10px] border border-border bg-surface p-4">
          <h2 className="text-[13px] font-semibold text-fg">Your details</h2>
          <div className="mt-3">
            <ProfileForm fullName={me.user.fullName} readOnly={viewing} />
          </div>
        </section>

        {!viewing && (
          <section className="rounded-[10px] border border-border bg-surface p-4">
            <h2 className="text-[13px] font-semibold text-fg">Change your password</h2>
            <p className="mt-1 text-[12px] text-fg2">Every other device will be signed out.</p>
            <div className="mt-3">
              <PasswordForm />
            </div>
          </section>
        )}

        <section className="rounded-[10px] border border-border bg-surface p-4">
          <h2 className="text-[13px] font-semibold text-fg">Where you are signed in</h2>
          <div className="mt-3">
            <Devices devices={devices} readOnly={viewing} />
          </div>
        </section>
      </div>
    </>
  );
}

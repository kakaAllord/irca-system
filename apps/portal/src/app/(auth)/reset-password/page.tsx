import type { Metadata } from 'next';
import { ResetForm } from './ResetForm';

export const metadata: Metadata = { title: 'Choose a new password' };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const token = (await searchParams).token ?? '';
  return (
    <>
      <h1 className="text-[20px] font-semibold text-fg">Choose a new password</h1>
      <p className="mt-1 text-[12.5px] text-fg2">
        Everything else signed in as you will be signed out.
      </p>
      <div className="mt-6">
        <ResetForm token={token} />
      </div>
    </>
  );
}

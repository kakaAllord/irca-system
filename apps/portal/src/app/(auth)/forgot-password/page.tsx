import type { Metadata } from 'next';
import Link from 'next/link';
import { ForgotForm } from './ForgotForm';

export const metadata: Metadata = { title: 'Forgot your password' };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-[20px] font-semibold text-fg">Forgot your password?</h1>
      <p className="mt-1 text-[12.5px] text-fg2">
        Give us your email and we will send you a link to choose a new one.
      </p>
      <div className="mt-6">
        <ForgotForm />
      </div>
      <Link href="/login" className="mt-4 inline-block text-[12.5px] text-accent underline">
        Back to sign in
      </Link>
    </>
  );
}

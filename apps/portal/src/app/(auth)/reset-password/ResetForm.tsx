'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PASSWORD_MIN, type MeResponse } from '@irca/shared';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { PasswordInput } from '@/components/ui/PasswordInput';

export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    window.history.replaceState(null, '', '/reset-password');
  }, []);

  const longEnough = password.length >= PASSWORD_MIN;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldError(undefined);
    if (!longEnough) return setFieldError(`Use at least ${PASSWORD_MIN} characters`);
    if (password !== repeat) return setFieldError('The two passwords do not match');

    setBusy(true);
    try {
      await clientApi<MeResponse>('/auth/reset-password', {
        method: 'POST',
        body: { token, password },
      });
      router.replace('/');
      router.refresh();
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiRequestError) {
        if (err.fieldErrors.password) return setFieldError(err.fieldErrors.password[0]);
        return setError(err.message);
      }
      setError('Something went wrong. Try again in a moment.');
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <PasswordInput
        label="New password"
        autoComplete="new-password"
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={fieldError}
        hint={
          <span className={longEnough ? 'text-pos' : undefined}>
            {longEnough ? '✓' : '·'} At least {PASSWORD_MIN} characters
          </span>
        }
      />
      <PasswordInput
        label="Type it again"
        autoComplete="new-password"
        value={repeat}
        onChange={(e) => setRepeat(e.target.value)}
      />
      {error && (
        <Alert tone="error">
          {error}{' '}
          <Link href="/forgot-password" className="underline">
            Ask for a new link
          </Link>
          .
        </Alert>
      )}
      <Button type="submit" loading={busy} className="w-full">
        Save and sign in
      </Button>
    </form>
  );
}

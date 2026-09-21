'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { PASSWORD_MIN, type MeResponse } from '@irca/shared';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';

export function AcceptForm({
  token,
  invitation,
}: {
  token: string;
  invitation: { email: string; fullName: string; needsPassword: boolean };
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState(invitation.fullName);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // The token is a working key: keep it out of history and off the screen.
    window.history.replaceState(null, '', '/accept-invite');
  }, []);

  const longEnough = password.length >= PASSWORD_MIN;
  const matches = password === repeat;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldError(undefined);
    if (invitation.needsPassword && (!longEnough || !matches)) {
      setFieldError(
        !longEnough ? `Use at least ${PASSWORD_MIN} characters` : 'The two passwords do not match',
      );
      return;
    }
    setBusy(true);
    try {
      await clientApi<MeResponse>(`/invitations/${encodeURIComponent(token)}/accept`, {
        method: 'POST',
        body: { fullName, ...(invitation.needsPassword ? { password } : {}) },
      });
      router.replace('/');
      router.refresh();
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiRequestError) {
        setFieldError(err.fieldErrors.password?.[0]);
        setError(err.fieldErrors.password ? null : err.message);
        return;
      }
      setError('Something went wrong. Try again in a moment.');
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <Input
        label="Your name"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        autoComplete="name"
      />
      <Input
        label="Email"
        value={invitation.email}
        readOnly
        autoComplete="username"
        className="text-fg2"
      />

      {invitation.needsPassword && (
        <>
          <PasswordInput
            label="Choose a password"
            required
            autoComplete="new-password"
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
            required
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            hint={
              repeat.length > 0 ? (
                <span className={matches ? 'text-pos' : 'text-danger'}>
                  {matches ? '✓ They match' : 'They do not match yet'}
                </span>
              ) : undefined
            }
          />
        </>
      )}

      {error && <Alert tone="error">{error}</Alert>}
      <Button type="submit" loading={busy} className="mt-1 w-full">
        {invitation.needsPassword ? 'Set password and sign in' : 'Join and sign in'}
      </Button>
    </form>
  );
}

'use client';

import { useState, type FormEvent } from 'react';
import { PASSWORD_MIN } from '@irca/shared';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { PasswordInput } from '@/components/ui/PasswordInput';

export function PasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldError(undefined);
    setDone(false);
    if (next.length < PASSWORD_MIN) return setFieldError(`Use at least ${PASSWORD_MIN} characters`);

    setBusy(true);
    try {
      await clientApi('/me/password', {
        method: 'POST',
        body: { currentPassword: current, newPassword: next },
      });
      setCurrent('');
      setNext('');
      setDone(true);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.fieldErrors.newPassword) setFieldError(err.fieldErrors.newPassword[0]);
        else setError(err.message);
      } else setError('Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      <PasswordInput
        label="Current password"
        autoComplete="current-password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
      />
      <PasswordInput
        label="New password"
        autoComplete="new-password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        error={fieldError}
      />
      {error && <Alert tone="error">{error}</Alert>}
      {done && <Alert>Your password is changed, and other devices are signed out.</Alert>}
      <div>
        <Button type="submit" loading={busy} disabled={!current || !next}>
          Change password
        </Button>
      </div>
    </form>
  );
}

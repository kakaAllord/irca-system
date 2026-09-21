'use client';

import { useState, type FormEvent } from 'react';
import { clientApi } from '@/lib/api/client';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export function ForgotForm() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  if (sent) {
    // Always the same answer, so this page cannot be used to find out which
    // addresses have accounts.
    return (
      <Alert>
        If an account exists for that email, we have sent a link. It works once and lasts an hour.
        Check the spam folder if it does not arrive.
      </Alert>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    await clientApi('/auth/forgot-password', { method: 'POST', body: { email } }).catch(
      () => undefined,
    );
    setSent(true);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <Input
        label="Email"
        type="email"
        autoComplete="username"
        autoFocus
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Button type="submit" loading={busy} className="w-full">
        Send the link
      </Button>
    </form>
  );
}

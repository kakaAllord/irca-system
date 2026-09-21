'use client';

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LoginSchema, type MeResponse } from '@irca/shared';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';

type FieldErrors = { email?: string; password?: string };

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const passwordRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    // The same rules the API applies, checked here first so a blank field
    // never costs a round trip.
    const parsed = LoginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const first = (field: string) =>
        parsed.error.issues.find((i) => i.path[0] === field)?.message;
      setFieldErrors({ email: first('email'), password: first('password') });
      return;
    }
    setFieldErrors({});
    setBusy(true);

    try {
      await clientApi<MeResponse>('/auth/login', { method: 'POST', body: parsed.data });
      router.replace(next);
      router.refresh();
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiRequestError) {
        if (err.code === 'INVALID_CREDENTIALS') {
          setPassword('');
          passwordRef.current?.focus();
          setError(err.message);
          return;
        }
        if (err.code === 'ACCOUNT_LOCKED' || err.code === 'RATE_LIMITED') {
          setError(err.message);
          return;
        }
        if (err.code === 'VALIDATION_FAILED') {
          setFieldErrors({
            email: err.fieldErrors.email?.[0],
            password: err.fieldErrors.password?.[0],
          });
          return;
        }
        // Something unexpected: the request id is what support needs to find it.
        // eslint-disable-next-line no-console -- the request id is what support asks for
        console.error('Sign-in failed', { code: err.code, requestId: err.requestId });
      }
      setError('Something went wrong. Try again in a moment.');
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <Input
        label="Email"
        name="email"
        type="email"
        autoComplete="username"
        autoFocus
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={fieldErrors.email}
      />
      <PasswordInput
        ref={passwordRef}
        label="Password"
        name="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={fieldErrors.password}
      />
      {error && <Alert tone="error">{error}</Alert>}
      <Button type="submit" loading={busy} className="mt-1 w-full">
        Sign in
      </Button>
      <Link
        href="/forgot-password"
        className="text-center text-[12px] text-fg2 underline hover:text-fg"
      >
        Forgot your password?
      </Link>
    </form>
  );
}

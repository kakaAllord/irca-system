'use client';

import { Button } from '@/components/ui/Button';

/** Something went wrong on a page. The request id is what support asks for. */
export default function PageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-md rounded-[12px] border border-danger-br bg-danger-bg p-7 text-center">
      <h1 className="text-[16px] font-semibold text-danger">Something went wrong</h1>
      <p className="mt-2 text-[12.5px] text-fg2">
        Try again. If it keeps happening, tell your developer this reference:{' '}
        <code className="font-mono">{error.digest ?? 'none'}</code>
      </p>
      <Button className="mt-4" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}

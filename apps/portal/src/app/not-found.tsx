import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-md rounded-[12px] border border-border bg-surface p-7 text-center">
        <h1 className="text-[16px] font-semibold text-fg">That page doesn&apos;t exist</h1>
        <p className="mt-2 text-[12.5px] text-fg2">
          The link may be old, or the page may have moved.
        </p>
        <Link href="/" className="mt-4 inline-block text-[12.5px] text-accent underline">
          Go to the portal
        </Link>
      </div>
    </main>
  );
}

import { Brand } from '@/components/Brand';

/** Pages for people who are not signed in: one centred card, no sidebar. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-[380px] rounded-[12px] border border-border bg-surface p-7 shadow-sm">
        <Brand />
        <div className="mt-7">{children}</div>
      </div>
    </main>
  );
}

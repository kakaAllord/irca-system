import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { GeistSans } from 'geist/font/sans';
import { THEME_COOKIE, themeFrom } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'IRCA Admin', template: '%s · IRCA Admin' },
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read on the server, so the first paint is already in the chosen theme.
  const theme = themeFrom((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="en" data-theme={theme} className={GeistSans.variable}>
      <body className="min-h-dvh text-[13px]">{children}</body>
    </html>
  );
}

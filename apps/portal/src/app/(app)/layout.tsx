import { cookies } from 'next/headers';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { SessionProvider } from '@/lib/session';
import { Shell } from '@/components/shell/Shell';
import { THEME_COOKIE, themeFrom } from '@/lib/theme';

/**
 * Every signed-in page sits inside the portal's frame. The API is asked who is
 * signed in on every page, so a session that has been revoked, has expired, or
 * has lost its church is sent to sign in at once rather than on the next click.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await serverApi<MeResponse>('/auth/me');
  const jar = await cookies();
  return (
    <SessionProvider me={me}>
      <Shell
        theme={themeFrom(jar.get(THEME_COOKIE)?.value)}
        sidebarCollapsed={jar.get('irca_sidebar')?.value === 'collapsed'}
      >
        {children}
      </Shell>
    </SessionProvider>
  );
}

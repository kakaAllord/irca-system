import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';

/**
 * Every signed-in page sits under this layout, which asks the API who is
 * signed in. An expired or revoked session gets a 401 here, and serverApi
 * sends the person to sign in. Phase 2 turns this into the portal's frame.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await serverApi<MeResponse>('/auth/me');
  return <>{children}</>;
}

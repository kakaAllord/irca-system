'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { MeResponse } from '@irca/shared';

const SessionContext = createContext<MeResponse | null>(null);

export function SessionProvider({ me, children }: { me: MeResponse; children: ReactNode }) {
  return <SessionContext.Provider value={me}>{children}</SessionContext.Provider>;
}

export function useMe(): MeResponse {
  const me = useContext(SessionContext);
  if (!me) throw new Error('useMe was used outside the signed-in layout');
  return me;
}

/**
 * Whether the signed-in person may do something.
 *
 * While they are being viewed as by someone else, the list holds only
 * permissions that change nothing, so every button wrapped in this disappears
 * on its own. No page needs to know about impersonation.
 */
export function useCan(): (permission: string) => boolean {
  const me = useMe();
  return (permission: string) => me.permissions.includes(permission);
}

/** Shows its children only to someone who holds the permission. */
export function Can({
  permission,
  fallback = null,
  children,
}: {
  permission: string;
  fallback?: ReactNode;
  children: ReactNode;
}) {
  return useCan()(permission) ? <>{children}</> : <>{fallback}</>;
}

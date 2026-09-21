import 'server-only';
import type { MeResponse } from '@irca/shared';

/** Whether this person may open a page. Pages show ForbiddenState when not. */
export function can(me: MeResponse, permission: string): boolean {
  return me.permissions.includes(permission);
}

/** The first page this person can actually open, for the home redirect. */
export function firstHome(me: MeResponse): string | null {
  const first = me.modules[0];
  return first?.nav[0]?.href ?? first?.home ?? null;
}

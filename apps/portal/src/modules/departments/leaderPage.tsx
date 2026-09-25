import 'server-only';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { ApiRequestError } from '@/lib/api/errors';
import type { DepartmentDetail } from './types';

/**
 * The department a leader's page is about, or null when it is not theirs to
 * open. The API decides; this only turns its refusal into a page.
 */
export async function leaderDepartment(
  id: string,
): Promise<{ me: MeResponse; department: DepartmentDetail } | null> {
  const me = await serverApi<MeResponse>('/auth/me');
  if (!me.permissions.includes('departments.own.read')) return null;
  try {
    return { me, department: await serverApi<DepartmentDetail>(`/departments/${id}`) };
  } catch (err) {
    if (err instanceof ApiRequestError && (err.status === 403 || err.status === 404)) return null;
    throw err;
  }
}

import type { Metadata } from 'next';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { ForbiddenState } from '@/components/shell/States';
import type { ApiClient } from '@/modules/platform/types';
import { Keys } from './Keys';

export const metadata: Metadata = { title: 'Keys' };

export default async function KeysPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'platform.churches.manage')) return <ForbiddenState what="this church's keys" />;

  const clients = await serverApi<ApiClient[]>(`/platform/churches/${id}/api-clients`);
  return <Keys churchId={id} clients={clients} />;
}

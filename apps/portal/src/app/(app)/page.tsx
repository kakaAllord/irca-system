import { redirect } from 'next/navigation';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { firstHome } from '@/lib/auth/guards';
import { NoAccessState } from '@/components/shell/States';

/** Home is wherever this person's first portal starts. */
export default async function Home() {
  const me = await serverApi<MeResponse>('/auth/me');
  const home = firstHome(me);
  if (home) redirect(home);

  const admins = await serverApi<{ name: string }[]>('/auth/admins').catch(() => []);
  return <NoAccessState admins={admins.map((a) => a.name)} />;
}

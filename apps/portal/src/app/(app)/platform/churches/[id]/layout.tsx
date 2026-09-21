import Link from 'next/link';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { can } from '@/lib/auth/guards';
import { ForbiddenState } from '@/components/shell/States';
import { Badge } from '@/components/ui/Badge';
import type { ChurchDetail } from '@/modules/platform/types';
import { StatusButton } from './StatusButton';
import { Tabs } from './Tabs';

/** One church, with everything about it behind a row of tabs. */
export default async function ChurchLayout({
  children,
  params,
}: LayoutProps<'/platform/churches/[id]'>) {
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'platform.churches.read')) return <ForbiddenState what="the dev console" />;

  const { id } = await params;
  const church = await serverApi<ChurchDetail>(`/platform/churches/${id}`);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/platform" className="text-[11.5px] text-fg3 hover:text-fg2">
            ← All churches
          </Link>
          <h1 className="mt-1 flex items-center gap-2 text-[20px] font-semibold text-fg">
            {church.name}
            {church.status === 'SUSPENDED' && <Badge tone="danger">Paused</Badge>}
          </h1>
          <p className="mt-0.5 text-[12.5px] text-fg2">
            {church.code} · {church.slug} · {church.timezone} · {church.currency}
          </p>
        </div>
        {can(me, 'platform.churches.manage') && (
          <StatusButton id={church.id} name={church.name} status={church.status} />
        )}
      </div>

      <Tabs id={church.id} canManage={can(me, 'platform.churches.manage')} />
      <div className="mt-4">{children}</div>
    </>
  );
}

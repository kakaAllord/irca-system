import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { MeResponse } from '@irca/shared';
import { serverApi } from '@/lib/api/server';
import { ApiRequestError } from '@/lib/api/errors';
import { can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/shell/PageHeader';
import { ForbiddenState } from '@/components/shell/States';
import { TrainingDrawer, TrainingRegister } from '@/modules/outreach/TrainingControls';
import { churchToday, longDay, type Training } from '@/modules/outreach/types';

export const metadata: Metadata = { title: 'Training' };

/** One training, and its register. */
export default async function TrainingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await serverApi<MeResponse>('/auth/me');
  if (!can(me, 'outreach.training.read')) return <ForbiddenState what="the training" />;
  let training: Training;
  try {
    training = await serverApi<Training>(`/outreach/trainings/${id}`);
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 404) notFound();
    throw err;
  }
  const manage = can(me, 'outreach.training.manage');
  const today = churchToday(me.church?.timezone);

  return (
    <div className="max-w-2xl">
      <Link href="/outreach/training" className="text-[12px] text-fg2 hover:text-fg">
        ← Training
      </Link>
      <div className="mt-2">
        <PageHeader
          title={training.topic}
          subtitle={[
            `${longDay(training.date)}, ${training.time}`,
            training.venue,
            training.trainer && `with ${training.trainer}`,
          ]
            .filter(Boolean)
            .join(' · ')}
          actions={manage ? <TrainingDrawer training={training} defaultDate={today} /> : undefined}
        />
      </div>
      {training.date > today ? (
        <p className="rounded-[10px] border border-dashed border-border p-6 text-center text-[12.5px] text-fg2">
          Who came is marked on the day.
        </p>
      ) : (
        <TrainingRegister training={training} editable={manage} />
      )}
    </div>
  );
}

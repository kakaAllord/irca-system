'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { useCan } from '@/lib/session';
import { EmptyState } from '@/components/shell/States';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { ScheduleDrawer } from './ScheduleDrawer';
import { DAYS, when, type AudienceOptions, type Schedule, type Template } from './types';

/** The beats: when each next runs, what it last did, and pause, resume, change, stop. */
export function SchedulesPanel({
  schedules,
  departmentId,
  options,
  templates,
  managePermission,
  historyBase,
}: {
  schedules: Schedule[];
  departmentId: string | null;
  options: AudienceOptions | null;
  templates: Template[];
  managePermission: string;
  historyBase: string;
}) {
  const can = useCan();
  const manage = can(managePermission) && options !== null;
  return (
    <div className="flex flex-col gap-4">
      {manage && (
        <div>
          <ScheduleDrawer
            departmentId={departmentId}
            options={options}
            templates={templates}
            trigger={(open) => <Button onClick={open}>+ New recurring message</Button>}
          />
        </div>
      )}
      {!schedules.length && (
        <EmptyState title="Nothing recurring yet">
          A reminder every Tuesday, set up once.
        </EmptyState>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {schedules.map((s) => (
          <ScheduleCard
            key={s.id}
            schedule={s}
            manage={manage}
            options={options}
            templates={templates}
            departmentId={departmentId}
            historyBase={historyBase}
          />
        ))}
      </div>
    </div>
  );
}

function ScheduleCard({
  schedule: s,
  manage,
  options,
  templates,
  departmentId,
  historyBase,
}: {
  schedule: Schedule;
  manage: boolean;
  options: AudienceOptions | null;
  templates: Template[];
  departmentId: string | null;
  historyBase: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);

  async function call(path: string, method: 'PUT' | 'POST', body?: object) {
    setBusy(true);
    setError(null);
    try {
      await clientApi(path, { method, body });
      setStopping(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const days = s.daysOfWeek.map((d) => DAYS[d - 1]).join(', ');
  return (
    <article className="flex flex-col gap-2 rounded-[10px] border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-[13px] font-semibold text-fg">{s.name}</h3>
          <p className="text-[11.5px] text-fg3">
            {s.audienceName}
            {!departmentId && ` · ${s.department?.name ?? 'Communications'}`}
          </p>
        </div>
        <Badge tone={s.isActive ? 'positive' : 'muted'}>{s.isActive ? 'On' : 'Paused'}</Badge>
      </div>
      <p className="text-[12.5px] text-fg2">
        {days} at {s.timeOfDay}
        {s.jitterMinutes ? `, drifting up to ${s.jitterMinutes} minutes` : ''}. From{' '}
        {s.templates.map((t) => `"${t.name}"`).join(' or ')}.
      </p>
      <p className="text-[12px] text-fg3">
        {s.isActive && s.nextRunAt
          ? `Next: ${when(s.nextRunAt)}.`
          : s.isActive
            ? 'It has ended.'
            : 'Paused.'}
        {s.lastMessage && (
          <>
            {' '}
            Last:{' '}
            <a className="text-accent underline" href={`${historyBase}/${s.lastMessage.id}`}>
              {when(s.lastMessage.at)}
            </a>
            .
          </>
        )}
      </p>
      {s.lastError && <Alert tone="warn">The last time it did not send: {s.lastError}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      {manage && options && (
        <div className="mt-1 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            loading={busy}
            onClick={() => call(`/comms/schedules/${s.id}/active`, 'PUT', { active: !s.isActive })}
          >
            {s.isActive ? 'Pause' : 'Resume'}
          </Button>
          <ScheduleDrawer
            departmentId={departmentId}
            options={options}
            templates={templates}
            schedule={s}
            trigger={(open) => (
              <Button size="sm" variant="ghost" onClick={open}>
                Change
              </Button>
            )}
          />
          <Button size="sm" variant="ghost" onClick={() => setStopping(true)}>
            Stop for good
          </Button>
        </div>
      )}
      <Dialog
        open={stopping}
        onClose={() => setStopping(false)}
        title={`Stop "${s.name}" for good?`}
        description="It will not send again. The messages it already sent stay in the history."
        footer={
          <>
            <Button variant="ghost" onClick={() => setStopping(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={() => call(`/comms/schedules/${s.id}/archive`, 'POST')}
            >
              Stop it
            </Button>
          </>
        }
      />
    </article>
  );
}

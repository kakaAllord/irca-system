'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Input } from '@/components/ui/Input';
import { MarkButton, MarkLegend, nextMark, type AttendanceMark } from '@/components/ui/MarkButton';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { Training } from './types';

const message = (err: unknown) =>
  err instanceof ApiRequestError ? err.message : 'Something went wrong.';

/** Planning a training, or changing one: topic, trainer, when, where. */
export function TrainingDrawer({
  training,
  defaultDate,
}: {
  training?: Training;
  /** The coming Friday, in church time. */
  defaultDate: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState(training?.topic ?? '');
  const [trainer, setTrainer] = useState(training?.trainer ?? '');
  const [date, setDate] = useState(training?.date ?? defaultDate);
  const [time, setTime] = useState(training?.time ?? '18:00');
  const [venue, setVenue] = useState(training?.venue ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const body = { topic, trainer, date, time, venue, notes: training?.notes };
      if (training) {
        await clientApi(`/outreach/trainings/${training.id}`, { method: 'PUT', body });
        setOpen(false);
        router.refresh();
      } else {
        const made = await clientApi<{ id: string }>('/outreach/trainings', {
          method: 'POST',
          body,
        });
        router.push(`/outreach/training/${made.id}`);
      }
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  const missing = [
    ...(topic.trim().length < 2 ? ['Topic'] : []),
    ...(!date ? ['Date'] : []),
    ...(!time ? ['Time'] : []),
  ];

  return (
    <>
      {training ? (
        <Button variant="ghost" onClick={() => setOpen(true)}>
          Change
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)}>Plan a training</Button>
      )}
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={training ? 'Change this training' : 'Plan a training'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton loading={busy} missing={missing} onClick={save}>
              {training ? 'Save' : 'Plan it'}
            </SubmitButton>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Input
            label="Topic"
            required
            maxLength={120}
            placeholder="Sharing your story"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
          <Input
            label="Trainer"
            maxLength={80}
            value={trainer}
            onChange={(e) => setTrainer(e.target.value)}
          />
          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                label="Date"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="w-32">
              <Input
                label="Time"
                type="time"
                required
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>
          <Input
            label="Venue"
            maxLength={80}
            placeholder="Church hall"
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
          />
        </div>
      </Drawer>
    </>
  );
}

/**
 * The training's register, marked with the foundation class's own boxes: a
 * tap moves a box through attended, missed and not yet. "Everyone else was
 * absent" finishes it in one go once the ticks are in.
 */
export function TrainingRegister({
  training,
  editable,
}: {
  training: Training;
  editable: boolean;
}) {
  const router = useRouter();
  const [marks, setMarks] = useState(
    () => new Map(training.register.map((p) => [p.personId, p.mark])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function put(changes: { personId: string; mark: AttendanceMark | null }[]) {
    const before = new Map(marks);
    setMarks((m) => {
      const next = new Map(m);
      for (const c of changes) next.set(c.personId, c.mark);
      return next;
    });
    setBusy(true);
    setError(null);
    try {
      await clientApi(`/outreach/trainings/${training.id}/attendance`, {
        method: 'PUT',
        body: { marks: changes },
      });
      router.refresh();
    } catch (err) {
      setMarks(before);
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  const [q, setQ] = useState('');
  const unmarked = training.register.filter((p) => !marks.get(p.personId));
  const shown = q.trim()
    ? training.register.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()))
    : training.register;
  const present = training.register.filter((p) => marks.get(p.personId) === 'ATTENDED').length;

  return (
    <section className="rounded-[10px] border border-border bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-fg">
          Who came{' '}
          <span className="font-normal text-fg3">
            · {present} of {training.register.length}
          </span>
        </h2>
        {editable && unmarked.length > 0 && present > 0 && (
          <Button
            size="sm"
            variant="secondary"
            loading={busy}
            onClick={() => put(unmarked.map((p) => ({ personId: p.personId, mark: 'MISSED' })))}
          >
            Everyone else was absent
          </Button>
        )}
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {training.register.length > 8 && (
        <input
          type="search"
          aria-label="Find someone on the register"
          placeholder="Type part of a name"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="mb-2 h-9 w-full rounded-[7px] border border-border bg-input px-3 text-[13px] text-fg placeholder:text-fg3"
        />
      )}
      <ul className="flex flex-col">
        {shown.map((p) => {
          const mark = marks.get(p.personId) ?? null;
          return (
            <li
              key={p.personId}
              className="flex items-center justify-between gap-2 border-t border-border2 py-2 first:border-0"
            >
              <span className="text-[12.5px] text-fg">
                {p.name}
                {!p.onTeam && (
                  <span className="ml-2 text-[11.5px] text-fg3">no longer on the team</span>
                )}
              </span>
              <MarkButton
                mark={mark}
                label={p.name}
                disabled={!editable || busy}
                onClick={() => put([{ personId: p.personId, mark: nextMark(mark) }])}
              />
            </li>
          );
        })}
      </ul>
      <MarkLegend empty="Not marked" />
    </section>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BLANKS, senderBlanks } from '@irca/shared';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Input } from '@/components/ui/Input';
import { RequiredMark } from '@/components/ui/RequiredMark';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { AudiencePicker, audienceReady } from './AudiencePicker';
import {
  DAYS,
  WEEKS,
  type Audience,
  type AudienceOptions,
  type Schedule,
  type Template,
} from './types';

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Setting up a beat: who, which approved templates (two or more sound more
 * human: one is picked at random each time), which days, what time, and how
 * many minutes it may drift so it does not arrive like an alarm.
 */
export function ScheduleDrawer({
  departmentId,
  options,
  templates,
  schedule,
  trigger,
}: {
  departmentId: string | null;
  options: AudienceOptions;
  templates: Template[];
  schedule?: Schedule;
  trigger: (open: () => void) => React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(schedule?.name ?? '');
  const [audience, setAudience] = useState<Audience | null>(schedule?.audience ?? null);
  const [templateIds, setTemplateIds] = useState<string[]>(schedule?.templateIds ?? []);
  const [fields, setFields] = useState<Record<string, string>>(schedule?.fields ?? {});
  const [days, setDays] = useState<number[]>(schedule?.daysOfWeek ?? []);
  const [week, setWeek] = useState(String(schedule?.weeksOfMonth[0] ?? ''));
  const [time, setTime] = useState(schedule?.timeOfDay ?? '18:00');
  const [jitter, setJitter] = useState(String(schedule?.jitterMinutes ?? 15));
  const [startsOn, setStartsOn] = useState(schedule?.startsOn ?? today());
  const [endsOn, setEndsOn] = useState(schedule?.endsOn ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blanks = senderBlanks([
    ...new Set(templates.filter((t) => templateIds.includes(t.id)).flatMap((t) => t.fields)),
  ]);

  async function save() {
    setBusy(true);
    setError(null);
    const body = {
      departmentId,
      name,
      audience,
      templateIds,
      fields,
      daysOfWeek: days,
      weeksOfMonth: week ? [Number(week)] : [],
      timeOfDay: time,
      jitterMinutes: Number(jitter),
      startsOn,
      endsOn: endsOn || null,
    };
    try {
      if (schedule) await clientApi(`/comms/schedules/${schedule.id}`, { method: 'PUT', body });
      else await clientApi('/comms/schedules', { method: 'POST', body });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const missing = [
    !name.trim() && 'Name',
    !audienceReady(audience) && 'who it goes to',
    !templateIds.length && 'a template',
    !days.length && 'a day',
    ...blanks.filter((b) => !fields[b]?.trim()).map((b) => BLANKS[b].label.toLowerCase()),
  ].filter(Boolean) as string[];

  return (
    <>
      {trigger(() => setOpen(true))}
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={schedule ? `Change "${schedule.name}"` : 'A recurring message'}
        description="Sent on its own, on its days, never at night. Each time it checks everything a person sending would be checked for."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton loading={busy} missing={missing} onClick={save}>
              Save
            </SubmitButton>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Name"
            required
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tuesday practice"
          />
          <AudiencePicker
            options={options}
            departmentId={departmentId}
            value={audience}
            onChange={setAudience}
          />
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-[12px] font-medium text-fg2">
              Templates
              <RequiredMark />
            </legend>
            {templates.map((t) => (
              <label key={t.id} className="flex items-start gap-2 text-[12.5px]">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={templateIds.includes(t.id)}
                  onChange={(e) =>
                    setTemplateIds((ids) =>
                      e.target.checked ? [...ids, t.id] : ids.filter((i) => i !== t.id),
                    )
                  }
                />
                {t.name}
              </label>
            ))}
            {!templates.length && (
              <p className="text-[12px] text-fg3">No approved templates yet.</p>
            )}
            {templateIds.length === 1 && (
              <p className="text-[11.5px] text-fg3">
                One works. Two or more sound more human: one is picked at random each time.
              </p>
            )}
          </fieldset>
          {blanks.map((b) => (
            <Input
              key={b}
              label={BLANKS[b].label}
              required
              maxLength={60}
              value={fields[b] ?? ''}
              onChange={(e) => {
                const value = e.target.value;
                setFields((f) => ({ ...f, [b]: value }));
              }}
            />
          ))}
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-[12px] font-medium text-fg2">
              Days
              <RequiredMark />
            </legend>
            <div className="flex flex-wrap gap-3">
              {DAYS.map((d, i) => (
                <label key={d} className="flex items-center gap-1.5 text-[12.5px]">
                  <input
                    type="checkbox"
                    checked={days.includes(i + 1)}
                    onChange={(e) =>
                      setDays((ds) =>
                        e.target.checked ? [...ds, i + 1] : ds.filter((x) => x !== i + 1),
                      )
                    }
                  />
                  {d}
                </label>
              ))}
            </div>
          </fieldset>
          <Select
            label="How often"
            value={week}
            onChange={(e) => setWeek(e.target.value)}
            options={[
              { value: '', label: 'Every week' },
              ...WEEKS.map((w, i) => ({
                value: String(i + 1),
                label: `Once a month: the ${w} of those days`,
              })),
            ]}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Time"
              type="time"
              required
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
            <Select
              label="May drift by"
              value={jitter}
              onChange={(e) => setJitter(e.target.value)}
              options={['0', '10', '15', '20', '30'].map((m) => ({
                value: m,
                label: m === '0' ? 'Exactly on time' : `Up to ${m} minutes`,
              }))}
            />
            <Input
              label="From"
              type="date"
              required
              value={startsOn}
              onChange={(e) => setStartsOn(e.target.value)}
            />
            <Input
              label="Until (optional)"
              type="date"
              value={endsOn}
              onChange={(e) => setEndsOn(e.target.value)}
            />
          </div>
          {error && <Alert tone="error">{error}</Alert>}
        </div>
      </Drawer>
    </>
  );
}

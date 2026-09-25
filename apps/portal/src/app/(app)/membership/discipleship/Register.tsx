'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Input } from '@/components/ui/Input';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Can, useCan } from '@/lib/session';
import { MarkButton, MarkLegend, nextMark } from '@/components/ui/MarkButton';
import type { RegisterData } from './page';

/**
 * The class register: a tick is a session attended. Tapping a box cycles it
 * attended, missed, not yet held, so a wrong tap is one more tap to undo.
 */
export function Register({ groupId, data }: { groupId: string; data: RegisterData }) {
  const router = useRouter();
  const can = useCan();
  const editable = can('membership.discipleship.manage');
  const [marking, setMarking] = useState<number | null>(null);
  const [ticked, setTicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function cycle(enrollmentId: string, sessionNo: number, now: 'ATTENDED' | 'MISSED' | null) {
    const next = nextMark(now);
    try {
      await clientApi('/membership/discipleship/attendance', {
        method: 'PUT',
        body: { enrollmentId, sessionNo, mark: next },
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
    }
  }

  async function markAll() {
    try {
      await clientApi(`/membership/discipleship/groups/${groupId}/sessions/${marking}/mark-all`, {
        method: 'POST',
        body: { attendedEnrollmentIds: ticked },
      });
      setMarking(null);
      setTicked([]);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
    }
  }

  const nextSession = Math.min(
    data.sessions,
    Math.max(1, ...data.rows.map((r) => r.marks.filter(Boolean).length + 1)),
  );

  return (
    <section className="rounded-[10px] border border-border bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[13px] font-semibold text-fg">Foundation class register</h2>
          <p className="text-[12px] text-fg3">
            Only people who signed up. {data.sessions} sessions; a tick is a session attended.
          </p>
        </div>
        <Can permission="membership.discipleship.manage">
          <Button size="sm" onClick={() => setMarking(nextSession)}>
            Mark today&apos;s session
          </Button>
        </Can>
      </div>
      {error && <Alert tone="error">{error}</Alert>}

      {data.rows.length === 0 ? (
        <p className="text-[12.5px] text-fg3">Nobody in this group yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[11px] text-fg3">
                <th className="py-1.5 pr-3 font-semibold">Person</th>
                {Array.from({ length: data.sessions }, (_, i) => (
                  <th key={i} className="w-9 py-1.5 text-center font-semibold">
                    {i + 1}
                  </th>
                ))}
                <th className="py-1.5 pl-3 text-right font-semibold">Done</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.enrollmentId} className="border-t border-border2">
                  <td className="py-1.5 pr-3">
                    <span className="font-medium text-fg">{row.fullName}</span>
                    {row.atRisk && (
                      <span className="ml-2 text-[11px] text-warn-fg">two missed in a row</span>
                    )}
                  </td>
                  {row.marks.map((mark, i) => (
                    <td key={i} className="py-1 text-center">
                      <MarkButton
                        mark={mark}
                        label={`${row.fullName}, session ${i + 1}`}
                        disabled={!editable || row.completed}
                        empty="not yet held"
                        onClick={() => cycle(row.enrollmentId, i + 1, mark)}
                      />
                    </td>
                  ))}
                  <td className="py-1.5 pl-3 text-right tabular-nums text-fg2">
                    {row.completed ? 'Finished' : `${row.attended} / ${data.sessions}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <MarkLegend />
        </div>
      )}

      <Drawer
        open={marking !== null}
        onClose={() => setMarking(null)}
        title={`Mark session ${marking ?? ''}`}
        description="Tick everyone who came. Everyone else is marked missed."
        footer={
          <>
            <Button variant="ghost" onClick={() => setMarking(null)}>
              Cancel
            </Button>
            <Button onClick={markAll}>Save the register</Button>
          </>
        }
      >
        <ul className="flex flex-col gap-2">
          {data.rows
            .filter((r) => !r.completed)
            .map((row) => (
              <li key={row.enrollmentId}>
                <label className="flex items-center gap-2 text-[12.5px]">
                  <input
                    type="checkbox"
                    checked={ticked.includes(row.enrollmentId)}
                    onChange={(e) =>
                      setTicked((all) =>
                        e.target.checked
                          ? [...all, row.enrollmentId]
                          : all.filter((x) => x !== row.enrollmentId),
                      )
                    }
                  />
                  {row.fullName}
                </label>
              </li>
            ))}
        </ul>
      </Drawer>
    </section>
  );
}

/** Starting a new class group: 'Thursday group', 'Saturday group'. */
export function NewGroup() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await clientApi('/membership/discipleship/groups', { method: 'POST', body: { name } });
      setOpen(false);
      setName('');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Can permission="membership.discipleship.manage">
      <Button variant="secondary" onClick={() => setOpen(true)}>
        + New group
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Start a foundation class group"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton
              loading={busy}
              missing={name.trim().length < 2 ? ['Name'] : []}
              onClick={save}
            >
              Start it
            </SubmitButton>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Input
            label="Name"
            required
            placeholder="Thursday group"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
      </Drawer>
    </Can>
  );
}

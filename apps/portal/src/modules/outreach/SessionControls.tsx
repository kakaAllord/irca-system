'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Drawer } from '@/components/ui/Drawer';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { PeoplePicker } from './PeoplePicker';
import type { PartnerGroup, Session, SessionStatus, SessionTeam, TeamPerson } from './types';

const message = (err: unknown) =>
  err instanceof ApiRequestError ? err.message : 'Something went wrong.';

/** Planning a Saturday, or changing its date and title. */
export function SessionDrawer({ session }: { session?: Session }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [heldOn, setHeldOn] = useState(session?.heldOn ?? nextSaturday());
  const [title, setTitle] = useState(session?.title ?? '');
  const [notes, setNotes] = useState(session?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const body = { heldOn, title, notes };
      if (session) {
        await clientApi(`/outreach/sessions/${session.id}`, { method: 'PUT', body });
        setOpen(false);
        router.refresh();
      } else {
        const made = await clientApi<{ id: string }>('/outreach/sessions', {
          method: 'POST',
          body,
        });
        router.push(`/outreach/sessions/${made.id}`);
      }
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {session ? (
        <Button variant="ghost" onClick={() => setOpen(true)}>
          Change
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)}>Plan a Saturday</Button>
      )}
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={session ? 'Change this Saturday' : 'Plan a Saturday'}
        description={session ? undefined : 'Then send a team to each area.'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton loading={busy} missing={heldOn ? [] : ['Date']} onClick={save}>
              {session ? 'Save' : 'Plan it'}
            </SubmitButton>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Input
            label="Date"
            type="date"
            required
            value={heldOn}
            onChange={(e) => setHeldOn(e.target.value)}
          />
          <Input
            label="Title"
            placeholder="Sombetini and Kaloleni"
            maxLength={80}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Input
            label="Notes"
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </Drawer>
    </>
  );
}

/** Closing a Saturday, or opening it again when closing it was a mistake. */
export function StatusButtons({ session }: { session: Session }) {
  const router = useRouter();
  const [asking, setAsking] = useState<SessionStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function set(status: SessionStatus) {
    setBusy(true);
    setError(null);
    try {
      await clientApi(`/outreach/sessions/${session.id}/status`, {
        method: 'PUT',
        body: { status },
      });
      setAsking(null);
      router.refresh();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  if (session.status !== 'PLANNED') {
    return (
      <Button variant="secondary" loading={busy} onClick={() => set('PLANNED')}>
        Open again
      </Button>
    );
  }
  return (
    <>
      <Button onClick={() => setAsking('COMPLETED')}>Mark completed</Button>
      <Button variant="ghost" onClick={() => setAsking('CANCELLED')}>
        Cancel it
      </Button>
      <Dialog
        open={asking !== null}
        onClose={() => setAsking(null)}
        title={asking === 'COMPLETED' ? 'Mark this Saturday completed?' : 'Cancel this Saturday?'}
        description={
          asking === 'COMPLETED'
            ? 'Its teams are then fixed. People can still be recorded against it.'
            : 'Nobody can be recorded against a cancelled Saturday. It stays in the list.'
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setAsking(null)}>
              Back
            </Button>
            <Button
              variant={asking === 'CANCELLED' ? 'danger' : 'primary'}
              loading={busy}
              onClick={() => asking && set(asking)}
            >
              {asking === 'COMPLETED' ? 'Mark completed' : 'Cancel the Saturday'}
            </Button>
          </>
        }
      >
        {error && <p className="text-[12px] text-danger">{error}</p>}
      </Dialog>
    </>
  );
}

/**
 * Sending a team to an area: start from a partner group, or tick people for
 * the day, and type the area — suggested from the ones already used, never a
 * fixed list.
 */
export function TeamDrawer({
  sessionId,
  team,
  people,
  groups,
  areas,
}: {
  sessionId: string;
  team?: SessionTeam;
  people: TeamPerson[];
  groups: PartnerGroup[];
  areas: string[];
}) {
  const router = useRouter();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [groupId, setGroupId] = useState(team?.group?.id ?? '');
  const [picked, setPicked] = useState<string[]>(team?.people.map((p) => p.personId) ?? []);
  const [area, setArea] = useState(team?.area ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = groups.filter((g) => g.active);
  function pickGroup(id: string) {
    setGroupId(id);
    const group = active.find((g) => g.id === id);
    if (group) setPicked(group.people.map((p) => p.personId));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await clientApi(
        team
          ? `/outreach/sessions/${sessionId}/teams/${team.id}`
          : `/outreach/sessions/${sessionId}/teams`,
        {
          method: team ? 'PUT' : 'POST',
          body: { groupId: groupId || null, area, personIds: picked, notes: team?.notes },
        },
      );
      setOpen(false);
      if (!team) {
        setGroupId('');
        setPicked([]);
        setArea('');
      }
      router.refresh();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  const missing = [
    ...(area.trim().length < 2 ? ['Area'] : []),
    ...(picked.length === 0 ? ['who is going'] : []),
  ];

  return (
    <>
      {team ? (
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
          Change
        </Button>
      ) : (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          + Add a team
        </Button>
      )}
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={team ? `The ${team.area} team` : 'Send a team to an area'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton loading={busy} missing={missing} onClick={save}>
              {team ? 'Save' : 'Add the team'}
            </SubmitButton>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Input
            label="Area"
            required
            placeholder="Sombetini"
            maxLength={80}
            list={listId}
            value={area}
            onChange={(e) => setArea(e.target.value)}
            hint="Type a new one if it is not suggested."
          />
          <datalist id={listId}>
            {areas.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
          {active.length > 0 && (
            <Select
              label="Start from a partner group"
              value={groupId}
              onChange={(e) => pickGroup(e.target.value)}
              options={[
                { value: '', label: 'None: put people together for the day' },
                ...active.map((g) => ({
                  value: g.id,
                  label: `${g.name}: ${g.people.map((p) => p.name).join(', ')}`,
                })),
              ]}
            />
          )}
          <PeoplePicker
            legend="Who is going"
            people={people.map((p) => ({
              personId: p.personId,
              name: p.name,
              phoneTail: p.phoneTail,
              note: p.group,
            }))}
            picked={picked}
            onChange={setPicked}
          />
        </div>
      </Drawer>
    </>
  );
}

/** Taking a team off a Saturday still being planned, before anyone is recorded against it. */
export function RemoveTeamButton({ sessionId, team }: { sessionId: string; team: SessionTeam }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await clientApi(`/outreach/sessions/${sessionId}/teams/${team.id}`, { method: 'DELETE' });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Remove
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Take the ${team.area} team off this Saturday?`}
        description="Nobody has been recorded against it yet, so nothing is lost."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Keep it
            </Button>
            <Button variant="danger" loading={busy} onClick={remove}>
              Remove the team
            </Button>
          </>
        }
      >
        {error && <p className="text-[12px] text-danger">{error}</p>}
      </Dialog>
    </>
  );
}

/**
 * People the team spoke to without taking details, and how many of them gave
 * their life to Christ. Typed, because there is nothing else to count them
 * by; kept apart from those recorded.
 */
export function SpokenToField({ team }: { team: SessionTeam }) {
  const router = useRouter();
  const [value, setValue] = useState(String(team.spokenToOnly));
  const [saved, setSaved] = useState(String(team.savedOnly));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const whole = (v: string) => /^\d+$/.test(v);
  const changed =
    whole(value) &&
    whole(saved) &&
    (value !== String(team.spokenToOnly) || saved !== String(team.savedOnly));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await clientApi(`/outreach/teams/${team.id}/spoken-to`, {
        method: 'PUT',
        body: { spokenToOnly: Number(value), savedOnly: Number(saved) },
      });
      router.refresh();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-end gap-2">
      <div className="w-28">
        <Input
          label="Spoken to, no details"
          type="number"
          inputMode="numeric"
          min={0}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <div className="w-28">
        <Input
          label="Of them, saved"
          type="number"
          inputMode="numeric"
          min={0}
          value={saved}
          onChange={(e) => setSaved(e.target.value)}
        />
      </div>
      {changed && (
        <Button size="md" variant="secondary" loading={busy} onClick={save}>
          Save
        </Button>
      )}
      {error && <span className="text-[11.5px] text-danger">{error}</span>}
    </div>
  );
}

/** The coming Saturday, or today when it is one, in the browser's own calendar. */
function nextSaturday(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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
import type { PartnerGroup, TeamPerson } from './types';

/**
 * Making a partner group, or changing one: a name and two or three of the
 * team. Only the team is offered, so the API's "not on the team" refusal is
 * there for a list that went stale, not for everyday use.
 */
export function GroupDrawer({
  team,
  group,
}: {
  team: TeamPerson[];
  /** The group to change; none to make a new one. */
  group?: PartnerGroup;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(group?.name ?? '');
  const [picked, setPicked] = useState<string[]>(group?.people.map((p) => p.personId) ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function start() {
    setName(group?.name ?? '');
    setPicked(group?.people.map((p) => p.personId) ?? []);
    setError(null);
    setOpen(true);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await clientApi(group ? `/outreach/groups/${group.id}` : '/outreach/groups', {
        method: group ? 'PUT' : 'POST',
        body: { name, personIds: picked },
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const missing = [
    ...(name.trim().length < 2 ? ['Name'] : []),
    ...(picked.length < 2 ? ['two or three people'] : []),
  ];

  return (
    <>
      {group ? (
        <Button size="sm" variant="ghost" onClick={start}>
          Change
        </Button>
      ) : (
        <Button variant="secondary" onClick={start}>
          + New group
        </Button>
      )}
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={group ? `Change ${group.name}` : 'New partner group'}
        description="Two or three of the team who usually go out together. On a Saturday the group is where a team starts; partners can still be swapped on the day."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton loading={busy} missing={missing} onClick={save}>
              {group ? 'Save' : 'Make the group'}
            </SubmitButton>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Input
            label="Name"
            required
            placeholder="Njiro pair"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[12px] font-medium text-fg2">
              Who is in it <span className="font-normal text-fg3">· {picked.length} of 3</span>
            </legend>
            {team.map((p) => {
              const checked = picked.includes(p.personId);
              return (
                <label key={p.personId} className="flex items-center gap-2 text-[12.5px]">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!checked && picked.length >= 3}
                    onChange={(e) =>
                      setPicked((all) =>
                        e.target.checked
                          ? [...all, p.personId]
                          : all.filter((id) => id !== p.personId),
                      )
                    }
                  />
                  <span className="text-fg">{p.name}</span>
                  {p.group && p.group !== group?.name && (
                    <span className="text-[11.5px] text-fg3">already in {p.group}</span>
                  )}
                </label>
              );
            })}
          </fieldset>
        </div>
      </Drawer>
    </>
  );
}

/** Switching a group off, or back on. Never deleted: past Saturdays point at it. */
export function GroupActiveButton({ group }: { group: PartnerGroup }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      await clientApi(`/outreach/groups/${group.id}/active`, {
        method: 'PUT',
        body: { active: !group.active },
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="ghost" loading={busy} onClick={toggle}>
        {group.active ? 'Switch off' : 'Bring back'}
      </Button>
      {error && <span className="text-[11.5px] text-danger">{error}</span>}
    </>
  );
}

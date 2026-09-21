'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';

type RoleGroup = {
  moduleName: string;
  roles: { id: string; name: string; description: string }[];
};

/** Invite someone: an email, a name, and what they may use. */
export function InviteButton({ roleGroups }: { roleGroups: RoleGroup[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setEmail('');
    setFullName('');
    setRoleIds([]);
    setError(null);
    setEmailError(undefined);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEmailError(undefined);
    setBusy(true);
    try {
      await clientApi('/admin/users/invitations', {
        method: 'POST',
        body: { email, fullName, roleIds },
      });
      setSentTo(email);
      close();
      router.refresh();
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiRequestError) {
        // "Already invited", "already has access" and the like belong next to
        // the email, which is what they are about.
        if (['ALREADY_MEMBER', 'ALREADY_INVITED', 'MEMBER_DISABLED'].includes(err.code)) {
          return setEmailError(err.message);
        }
        return setError(err.message);
      }
      setError('Something went wrong. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {sentTo && <Alert>Invitation sent to {sentTo}.</Alert>}
      <Button onClick={() => setOpen(true)}>+ Invite person</Button>

      <Dialog
        open={open}
        onClose={close}
        title="Invite a person"
        description="They will get an email with a link to set their password."
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" form="invite-form" loading={busy} disabled={roleIds.length === 0}>
              Send invitation
            </Button>
          </>
        }
      >
        <form id="invite-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <Input
            label="Email"
            type="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={emailError}
          />
          <Input label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} />

          <fieldset className="flex flex-col gap-3">
            <legend className="text-[12px] font-medium text-fg2">What can they use?</legend>
            {roleGroups.length === 0 && (
              <p className="text-[12px] text-fg3">
                No portals are on yet. Turn one on under Portals first.
              </p>
            )}
            {roleGroups.map((group) => (
              <div key={group.moduleName} className="flex flex-col gap-1.5">
                <p className="text-[10.5px] font-semibold tracking-wide text-fg3 uppercase">
                  {group.moduleName}
                </p>
                {group.roles.map((role) => (
                  <label key={role.id} className="flex items-start gap-2 text-[12.5px]">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={roleIds.includes(role.id)}
                      onChange={(e) =>
                        setRoleIds((ids) =>
                          e.target.checked ? [...ids, role.id] : ids.filter((i) => i !== role.id),
                        )
                      }
                    />
                    <span>
                      <span className="font-medium text-fg">{role.name}</span>
                      {role.description && (
                        <span className="block text-[11.5px] text-fg3">{role.description}</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            ))}
            <p className="text-[11.5px] text-fg3">
              Portals that are turned off are not listed. Turn them on under Portals.
            </p>
          </fieldset>

          {error && <Alert tone="error">{error}</Alert>}
        </form>
      </Dialog>
    </>
  );
}

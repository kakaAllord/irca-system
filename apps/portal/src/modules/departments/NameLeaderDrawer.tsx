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
import { PersonSearch } from './PersonSearch';
import type { LeaderCandidate } from './types';

const ACCOUNT = {
  ACTIVE: 'can sign in',
  INVITED: 'invited, not signed in yet',
  DISABLED: 'access disabled',
};

/**
 * An administrator naming a leader: a confirmed member, their title, and —
 * when they have no account and no email on record — the email they will
 * sign in with. What they may do comes from leading, so no role is asked for.
 */
export function NameLeaderDrawer({ departmentId, name }: { departmentId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<LeaderCandidate | null>(null);
  const [title, setTitle] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [done, setDone] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setChosen(null);
    setTitle('');
    setEmail('');
    setError(null);
    setFieldErrors({});
  }

  // No account yet and nothing on record: the email is what they sign in with.
  const needsEmail = chosen !== null && !chosen.account && !chosen.emailOnRecord;

  async function save() {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const res = await clientApi<{ invited: boolean }>(
        `/admin/departments/${departmentId}/leaders`,
        {
          method: 'POST',
          body: { personId: chosen.personId, title, email },
        },
      );
      setDone(
        res.invited
          ? `${chosen.name} is ${title} of ${name}, and has been sent an email to set a password.`
          : `${chosen.name} is ${title} of ${name}. They see it when they next sign in.`,
      );
      close();
      router.refresh();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setFieldErrors(err.fieldErrors);
        setError(err.message);
      } else setError('Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const missing = [
    !chosen && 'Confirmed member',
    !title.trim() && 'Title',
    needsEmail && !email.trim() && 'Email',
  ].filter(Boolean) as string[];

  return (
    <>
      {done && (
        // On a line of its own under the heading, not squeezed beside it.
        <div className="order-last basis-full">
          <Alert>{done}</Alert>
        </div>
      )}
      <Button size="sm" onClick={() => setOpen(true)}>
        + Name a leader
      </Button>
      <Drawer
        open={open}
        onClose={close}
        title={`Name a leader of ${name}`}
        description="Only a confirmed member can lead. They can then add the department's members themselves."
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <SubmitButton loading={busy} missing={missing} onClick={save}>
              Name them
            </SubmitButton>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <PersonSearch<LeaderCandidate>
            label="Confirmed member"
            endpoint="/admin/departments/leader-candidates"
            describe={(c) =>
              [
                c.phoneTail && `phone ${c.phoneTail}`,
                c.account ? `${c.account.email}, ${ACCOUNT[c.account.status]}` : 'no account yet',
              ]
                .filter(Boolean)
                .join(' · ')
            }
            chosen={chosen}
            onChoose={setChosen}
            emptyHint="No confirmed member by that name. The pastors confirm members in Membership → Applications."
          />
          <Input
            label="Title"
            required
            placeholder="Chairperson, Secretary…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            error={fieldErrors.title?.[0]}
          />
          {chosen && !chosen.account && (
            <Input
              label="Email they will sign in with"
              type="email"
              required={needsEmail}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              hint={
                chosen.emailOnRecord
                  ? 'Leave empty to use the email on their record.'
                  : 'They have no email on record.'
              }
              error={fieldErrors.email?.[0]}
            />
          )}
          {chosen && !chosen.account && (
            <p className="text-[11.5px] text-fg3">
              They have no account yet, so they will be sent an invitation to set a password.
            </p>
          )}
          {error && <Alert tone="error">{error}</Alert>}
        </div>
      </Drawer>
    </>
  );
}

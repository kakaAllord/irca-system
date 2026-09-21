'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MeResponse } from '@irca/shared';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';

type Person = {
  userId: string;
  fullName: string;
  status: 'ACTIVE' | 'INVITED' | 'DISABLED';
  isYou: boolean;
  canImpersonate: boolean;
};

/** View as, disable and re-enable, and the invitation's own buttons. */
export function PersonActions({ me, person }: { me: MeResponse; person: Person }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDisable, setConfirmDisable] = useState(false);

  const canManage = me.permissions.includes('admin.users.manage');
  const canInvite = me.permissions.includes('admin.users.invite');

  async function call(
    what: string,
    run: () => Promise<unknown>,
    after: 'refresh' | 'home' = 'refresh',
  ) {
    setBusy(what);
    setError(null);
    try {
      await run();
      if (after === 'home') {
        // Where to come back to when they stop viewing.
        sessionStorage.setItem('irca_return_to', window.location.pathname);
        router.replace('/');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(null);
      setConfirmDisable(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2">
        {/* One click, no reason asked for, and the person is never told. */}
        {person.canImpersonate && (
          <Button
            variant="secondary"
            loading={busy === 'view'}
            title={`See the portal exactly as ${person.fullName.split(' ')[0]} does. Read-only.`}
            onClick={() =>
              call(
                'view',
                () =>
                  clientApi('/impersonation', {
                    method: 'POST',
                    body: { subjectUserId: person.userId },
                  }),
                'home',
              )
            }
          >
            View as {person.fullName.split(' ')[0]}
          </Button>
        )}

        {canInvite && person.status === 'INVITED' && (
          <>
            <Button
              variant="secondary"
              loading={busy === 'resend'}
              onClick={() =>
                call('resend', () =>
                  clientApi(`/admin/users/${person.userId}/invitation/resend`, { method: 'POST' }),
                )
              }
            >
              Resend invitation
            </Button>
            <Button
              variant="ghost"
              loading={busy === 'cancel'}
              onClick={() =>
                call('cancel', () =>
                  clientApi(`/admin/users/${person.userId}/invitation`, { method: 'DELETE' }),
                )
              }
            >
              Cancel invitation
            </Button>
          </>
        )}

        {canManage && person.status === 'ACTIVE' && !person.isYou && (
          <Button variant="ghost" onClick={() => setConfirmDisable(true)}>
            Disable access
          </Button>
        )}
        {canManage && person.status === 'DISABLED' && (
          <Button
            variant="secondary"
            loading={busy === 'enable'}
            onClick={() =>
              call('enable', () =>
                clientApi(`/admin/users/${person.userId}/access`, {
                  method: 'PUT',
                  body: { enabled: true },
                }),
              )
            }
          >
            Restore access
          </Button>
        )}
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <Dialog
        open={confirmDisable}
        onClose={() => setConfirmDisable(false)}
        title={`Disable ${person.fullName}?`}
        description={`They will be signed out of this church and will not be able to sign in until you restore it. Everything they recorded stays.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDisable(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busy === 'disable'}
              onClick={() =>
                call('disable', () =>
                  clientApi(`/admin/users/${person.userId}/access`, {
                    method: 'PUT',
                    body: { enabled: false },
                  }),
                )
              }
            >
              Disable access
            </Button>
          </>
        }
      />
    </div>
  );
}

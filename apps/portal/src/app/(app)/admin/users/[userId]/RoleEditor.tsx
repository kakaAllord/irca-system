'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';

type RoleGroup = {
  moduleKey: string;
  moduleName: string;
  roles: { id: string; name: string; description: string; isSystem: boolean }[];
};

export function RoleEditor({
  userId,
  current,
  roleGroups,
  canEdit,
}: {
  userId: string;
  current: string[];
  roleGroups: RoleGroup[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [roleIds, setRoleIds] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const named = roleGroups.flatMap((g) =>
    g.roles.filter((r) => current.includes(r.id)).map((r) => ({ ...r, group: g.moduleName })),
  );

  if (!editing) {
    return (
      <div className="flex flex-wrap items-start justify-between gap-3">
        {named.length ? (
          <ul className="flex flex-col gap-1 text-[12.5px]">
            {named.map((role) => (
              <li key={role.id}>
                <span className="text-fg3">{role.group} · </span>
                <span className="font-medium text-fg">{role.name}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12.5px] text-fg3">No roles yet, so they can see nothing.</p>
        )}
        {canEdit && (
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            Edit roles
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {roleGroups.map((group) => (
        <div key={group.moduleKey} className="flex flex-col gap-1.5">
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

      {error && <Alert tone="error">{error}</Alert>}

      <div className="flex gap-2">
        <Button
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await clientApi(`/admin/users/${userId}/roles`, { method: 'PUT', body: { roleIds } });
              setEditing(false);
              router.refresh();
            } catch (err) {
              setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
            } finally {
              setBusy(false);
            }
          }}
        >
          Save roles
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setRoleIds(current);
            setEditing(false);
            setError(null);
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

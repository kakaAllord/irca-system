'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Input } from '@/components/ui/Input';
import type { PermissionDef } from './page';

type Role = {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  memberCount: number;
};

/**
 * Making a role is choosing from what the portal offers, split into what it
 * lets someone see and what it lets them change, because that is the
 * distinction that matters when handing out access.
 */
export function RoleDrawer({
  moduleKey,
  moduleName,
  permissions,
  role,
}: {
  moduleKey: string;
  moduleName: string;
  permissions: PermissionDef[];
  role?: Role;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [keys, setKeys] = useState<string[]>(role?.permissions ?? []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reads = permissions.filter((p) => p.kind === 'read');
  const writes = permissions.filter((p) => p.kind === 'write');

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (role) {
        await clientApi(`/admin/roles/${role.id}`, {
          method: 'PATCH',
          body: { name, description, permissionKeys: keys },
        });
      } else {
        await clientApi('/admin/roles', {
          method: 'POST',
          body: { moduleKey, name, description, permissionKeys: keys },
        });
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!role) return;
    setBusy(true);
    setError(null);
    try {
      await clientApi(`/admin/roles/${role.id}`, { method: 'DELETE' });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const list = (title: string, defs: PermissionDef[]) => (
    <div className="flex flex-col gap-1.5">
      <p className="text-[10.5px] font-semibold tracking-wide text-fg3 uppercase">{title}</p>
      {defs.map((p) => (
        <label key={p.key} className="flex items-start gap-2 text-[12.5px]">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={keys.includes(p.key)}
            onChange={(e) =>
              setKeys((k) => (e.target.checked ? [...k, p.key] : k.filter((x) => x !== p.key)))
            }
          />
          <span>
            <span className="text-fg">{p.label}</span>
            {p.hint && <span className="block text-[11px] text-fg3">{p.hint}</span>}
          </span>
        </label>
      ))}
    </div>
  );

  return (
    <>
      <Button variant={role ? 'ghost' : 'secondary'} size="sm" onClick={() => setOpen(true)}>
        {role ? 'Edit' : '+ New role'}
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={role ? `Edit ${role.name}` : `New ${moduleName} role`}
        description="Choose what this role lets someone do. Only this portal's own permissions are listed."
        footer={
          <>
            {role && (
              <Button
                variant="danger"
                size="sm"
                loading={busy}
                onClick={remove}
                className="mr-auto"
              >
                Delete role
              </Button>
            )}
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button loading={busy} disabled={!name.trim() || keys.length === 0} onClick={save}>
              {role ? 'Save changes' : 'Create role'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Treasurer"
          />
          <Input
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this role is for"
          />
          {list('Can see', reads)}
          {list('Can change', writes)}
          {error && <Alert tone="error">{error}</Alert>}
        </div>
      </Drawer>
    </>
  );
}

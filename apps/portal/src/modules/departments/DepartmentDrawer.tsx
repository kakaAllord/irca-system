'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';

export type PortalChoice = { key: string; name: string; takenBy: string | null };

/**
 * Making a department, or changing one: its name, what it is, and the portal
 * that belongs to it if it has one. Most departments have none.
 */
export function DepartmentDrawer({
  department,
  portals,
}: {
  /** Absent for a new one. */
  department?: { id: string; name: string; description: string; portalKey: string | null };
  portals: PortalChoice[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(department?.name ?? '');
  const [description, setDescription] = useState(department?.description ?? '');
  const [portal, setPortal] = useState(department?.portalKey ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function close() {
    setOpen(false);
    setError(null);
    setFieldErrors({});
    if (!department) {
      setName('');
      setDescription('');
      setPortal('');
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const body = { name, description, moduleKey: portal || null };
      if (department) {
        await clientApi(`/admin/departments/${department.id}`, { method: 'PUT', body });
        close();
        router.refresh();
      } else {
        const made = await clientApi<{ id: string }>('/admin/departments', {
          method: 'POST',
          body,
        });
        close();
        router.push(`/admin/departments/${made.id}`);
      }
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setFieldErrors(err.fieldErrors);
        setError(err.message);
      } else setError('Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const free = portals.filter((p) => !p.takenBy || p.key === department?.portalKey);
  const formId = department ? `department-${department.id}` : 'new-department';

  return (
    <>
      <Button
        size={department ? 'sm' : 'md'}
        variant={department ? 'secondary' : 'primary'}
        onClick={() => setOpen(true)}
      >
        {department ? 'Edit' : '+ New department'}
      </Button>
      <Drawer
        open={open}
        onClose={close}
        title={department ? `Change ${department.name}` : 'A new department'}
        description="The praise team, the choir, the ushers… An administrator then names its leaders, and they add its members."
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <SubmitButton
              type="submit"
              form={formId}
              loading={busy}
              missing={name.trim() ? [] : ['Name']}
            >
              {department ? 'Save' : 'Create it'}
            </SubmitButton>
          </>
        }
      >
        <form id={formId} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <Input
            label="Name"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={fieldErrors.name?.[0]}
          />
          <Input
            label="What it does"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={300}
          />
          <div className="flex flex-col gap-1.5">
            <Select
              label="Its portal"
              value={portal}
              onChange={(e) => setPortal(e.target.value)}
              options={[
                { value: '', label: 'None — most departments have none' },
                ...free.map((p) => ({ value: p.key, label: p.name })),
              ]}
            />
            <p className="text-[11.5px] text-fg3">
              A portal belongs to one department, and is switched on in Portals only once it has
              one.
            </p>
          </div>
          {error && <Alert tone="error">{error}</Alert>}
        </form>
      </Drawer>
    </>
  );
}

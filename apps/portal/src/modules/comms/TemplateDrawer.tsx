'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SMS_LANGS, type SmsLang } from '@irca/shared';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Input } from '@/components/ui/Input';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { BLANK_HINT, BodyField } from './BodyField';
import type { Template } from './types';

/**
 * Writing a template, or changing one. Changing an approved one makes its
 * next version, and says so: the approved words keep being sent until the new
 * ones are approved.
 */
export function TemplateDrawer({
  departmentId,
  template,
  trigger,
}: {
  departmentId: string | null;
  template?: Template;
  trigger: (open: () => void) => React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(template?.name ?? '');
  const [bodies, setBodies] = useState<Partial<Record<SmsLang, string>>>(template?.bodies ?? {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function close() {
    setOpen(false);
    setError(null);
    setFieldErrors({});
    if (!template) {
      setName('');
      setBodies({});
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      if (template) {
        await clientApi(`/comms/templates/${template.id}`, {
          method: 'PUT',
          body: { name, bodies },
        });
      } else {
        await clientApi('/comms/templates', {
          method: 'POST',
          body: { departmentId, name, bodies },
        });
      }
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

  const versioning = template?.status === 'ACTIVE';
  const missing = [
    !name.trim() && 'Name',
    !Object.values(bodies).some((b) => b?.trim()) && 'the words, in at least one language',
  ].filter(Boolean) as string[];

  return (
    <>
      {trigger(() => setOpen(true))}
      <Drawer
        open={open}
        onClose={close}
        title={
          template
            ? versioning
              ? `Version ${template.version + 1} of "${template.name}"`
              : `Change "${template.name}"`
            : 'A new template'
        }
        description={
          versioning
            ? 'The approved words keep being sent until these are approved.'
            : 'Write it once in each language people read. Communications approves all of them together.'
        }
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <SubmitButton loading={busy} missing={missing} onClick={save}>
              Save as a draft
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
            placeholder="Practice reminder"
          />
          {SMS_LANGS.map((lang) => (
            <BodyField
              key={lang}
              lang={lang}
              value={bodies[lang] ?? ''}
              error={fieldErrors[lang]?.[0]}
              onChange={(v) => setBodies((b) => ({ ...b, [lang]: v }))}
            />
          ))}
          <p className="text-[11.5px] text-fg3">Blanks you can use: {BLANK_HINT}.</p>
          {error && <Alert tone="error">{error}</Alert>}
        </div>
      </Drawer>
    </>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SMS_LANGS } from '@irca/shared';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { useCan, useMe } from '@/lib/session';
import { EmptyState } from '@/components/shell/States';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { TemplateDrawer } from './TemplateDrawer';
import type { Template, TemplateStatus } from './types';

const STATUS: Record<
  TemplateStatus,
  { label: string; tone: 'accent' | 'positive' | 'danger' | 'muted' | 'neutral' }
> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  PENDING: { label: 'Waiting for approval', tone: 'accent' },
  ACTIVE: { label: 'Approved', tone: 'positive' },
  REJECTED: { label: 'Sent back', tone: 'danger' },
  RETIRED: { label: 'Retired', tone: 'muted' },
};
const ORDER: TemplateStatus[] = ['PENDING', 'DRAFT', 'REJECTED', 'ACTIVE', 'RETIRED'];

/**
 * Templates, grouped by where they stand. Whoever may write them (the
 * department's leaders, or Communications) writes, changes and asks for
 * approval; Communications approves or sends back, never its own.
 */
export function TemplatesPanel({
  templates,
  departmentId,
  draftPermission,
}: {
  templates: Template[];
  /** The department whose templates these are; null for Communications. */
  departmentId: string | null;
  draftPermission: string;
}) {
  const can = useCan();
  const mayDraft = can(draftPermission);
  return (
    <div className="flex flex-col gap-6">
      {mayDraft && (
        <div>
          <TemplateDrawer
            departmentId={departmentId}
            trigger={(open) => <Button onClick={open}>+ New template</Button>}
          />
        </div>
      )}
      {templates.length === 0 && (
        <EmptyState title="No templates yet">Write the words once; use them every week.</EmptyState>
      )}
      {ORDER.map((status) => {
        const group = templates.filter((t) => t.status === status);
        if (!group.length) return null;
        return (
          <section key={status} className="flex flex-col gap-2">
            <h2 className="text-[13px] font-semibold text-fg">
              {STATUS[status].label} <span className="font-normal text-fg3">· {group.length}</span>
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {group.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  mayDraft={mayDraft}
                  ownOnly={departmentId !== null}
                  departmentId={departmentId}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function TemplateCard({
  template: t,
  mayDraft,
  ownOnly,
  departmentId,
}: {
  template: Template;
  mayDraft: boolean;
  ownOnly: boolean;
  departmentId: string | null;
}) {
  const router = useRouter();
  const me = useMe();
  const can = useCan();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');

  // A leader may use Communications' templates but not change them.
  const editable = mayDraft && (!ownOnly || t.department?.id === departmentId);
  const approver = can('comms.templates.approve');
  const ownWords = t.createdById === me.user.id || t.submittedById === me.user.id;

  async function act(action: 'submit' | 'approve' | 'retire' | 'reject', body?: object) {
    setBusy(action);
    setError(null);
    try {
      await clientApi(`/comms/templates/${t.id}/${action}`, { method: 'POST', body: body ?? {} });
      setRejecting(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="flex flex-col gap-2 rounded-[10px] border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-[13px] font-semibold text-fg">{t.name}</h3>
          <p className="text-[11.5px] text-fg3">
            {t.department?.name ?? 'Communications'}
            {t.version > 1 && ` · version ${t.version}`}
          </p>
        </div>
        <Badge tone={STATUS[t.status].tone}>{STATUS[t.status].label}</Badge>
      </div>
      {SMS_LANGS.filter((l) => t.bodies[l]).map((l) => (
        <p key={l} className="text-[12.5px] text-fg2">
          <span className="mr-1.5 text-[10.5px] font-semibold text-fg3 uppercase">{l}</span>
          {t.bodies[l]}
        </p>
      ))}
      {t.status === 'REJECTED' && t.decisionNote && (
        <Alert tone="warn">Sent back: {t.decisionNote}</Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      <div className="mt-1 flex flex-wrap gap-2">
        {editable && ['DRAFT', 'REJECTED', 'ACTIVE'].includes(t.status) && (
          <TemplateDrawer
            departmentId={departmentId}
            template={t}
            trigger={(open) => (
              <Button size="sm" variant="secondary" onClick={open}>
                {t.status === 'ACTIVE' ? 'Change (new version)' : 'Change'}
              </Button>
            )}
          />
        )}
        {editable && t.status === 'DRAFT' && (
          <Button size="sm" loading={busy === 'submit'} onClick={() => act('submit')}>
            Ask for approval
          </Button>
        )}
        {approver && t.status === 'PENDING' && !ownWords && (
          <>
            <Button size="sm" loading={busy === 'approve'} onClick={() => act('approve')}>
              Approve
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setRejecting(true)}>
              Send back
            </Button>
          </>
        )}
        {approver && t.status === 'PENDING' && ownWords && (
          <p className="text-[11.5px] text-fg3">Someone else approves words you wrote.</p>
        )}
        {editable && ['DRAFT', 'REJECTED', 'ACTIVE'].includes(t.status) && (
          <Button
            size="sm"
            variant="ghost"
            loading={busy === 'retire'}
            onClick={() => act('retire')}
          >
            Retire
          </Button>
        )}
      </div>
      <Dialog
        open={rejecting}
        onClose={() => setRejecting(false)}
        title={`Send "${t.name}" back?`}
        description="Say what needs changing. They can change it and ask again."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={note.trim().length < 3}
              loading={busy === 'reject'}
              onClick={() => act('reject', { note })}
            >
              Send it back
            </Button>
          </>
        }
      >
        <textarea
          aria-label="What needs changing"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full rounded-[7px] border border-border bg-input px-3 py-2 text-[13px] text-fg focus:border-accent focus:ring-2 focus:ring-accent-br focus:outline-none"
        />
      </Dialog>
    </article>
  );
}

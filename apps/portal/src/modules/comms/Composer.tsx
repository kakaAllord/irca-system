'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BLANKS, SMS_LANGS, blanksOf, senderBlanks, type SmsLang } from '@irca/shared';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { AudiencePicker, audienceReady } from './AudiencePicker';
import { BodyField } from './BodyField';
import {
  LANG_LABEL,
  money,
  type Audience,
  type AudienceOptions,
  type Preview,
  type Template,
} from './types';

/**
 * Writing and sending a message (07 step 7.14, Compose).
 *
 * Audience, then words — an approved template, or for Communications free
 * text — then the blanks the sender types, then when. What it will do is
 * shown before the button does anything: how many people, how many are left
 * alone and why, a sample in each language, the segments and the cost, and
 * any reason it would be refused. Sending spends money, so it asks first.
 */
export function Composer({
  departmentId,
  options,
  templates,
  canAdhoc,
  historyBase,
  initialAudience = null,
}: {
  departmentId: string | null;
  options: AudienceOptions;
  /** The approved templates this sender may use. */
  templates: Template[];
  canAdhoc: boolean;
  /** Where a sent message's page is: `${historyBase}/${id}`. */
  historyBase: string;
  /** Chosen already, when a page sends someone here to write to that audience. */
  initialAudience?: Audience | null;
}) {
  const router = useRouter();
  const [audience, setAudience] = useState<Audience | null>(initialAudience);
  const [mode, setMode] = useState<'template' | 'free'>('template');
  const [templateId, setTemplateId] = useState('');
  const [bodies, setBodies] = useState<Partial<Record<SmsLang, string>>>({});
  const [fields, setFields] = useState<Record<string, string>>({});
  const [later, setLater] = useState(false);
  const [at, setAt] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const template = templates.find((t) => t.id === templateId) ?? null;
  const usedBlanks = useMemo(
    () =>
      mode === 'template'
        ? (template?.fields ?? [])
        : [...new Set(Object.values(bodies).flatMap((b) => blanksOf(b ?? '')))],
    [mode, template, bodies],
  );
  const toType = senderBlanks(usedBlanks);
  const wordsReady =
    mode === 'template' ? !!template : Object.values(bodies).some((b) => b?.trim());
  const scheduledFor = later && at ? new Date(at).toISOString() : null;

  const request = useMemo(
    () =>
      audienceReady(audience) && wordsReady
        ? {
            departmentId,
            audience,
            ...(mode === 'template' ? { templateId } : { bodies }),
            fields,
            scheduledFor,
          }
        : null,
    [audience, wordsReady, departmentId, mode, templateId, bodies, fields, scheduledFor],
  );

  // Ask what it would do, a moment after the last change.
  useEffect(() => {
    if (!request) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    const timer = setTimeout(() => {
      clientApi<Preview>('/comms/messages/preview', { method: 'POST', body: request })
        .then((p) => {
          setPreview(p);
          setPreviewError(null);
        })
        .catch((err: unknown) => {
          setPreview(null);
          setPreviewError(err instanceof ApiRequestError ? err.message : 'Could not work it out.');
        });
    }, 400);
    return () => clearTimeout(timer);
  }, [request]);

  async function send() {
    if (!request) return;
    setBusy(true);
    setError(null);
    try {
      const sent = await clientApi<{ id: string }>('/comms/messages', {
        method: 'POST',
        body: request,
      });
      setConfirming(false);
      router.push(`${historyBase}/${sent.id}`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const missing = [
    !audienceReady(audience) && 'who it goes to',
    !wordsReady && (mode === 'template' ? 'a template' : 'the words'),
    ...toType.filter((f) => !fields[f]?.trim()).map((f) => BLANKS[f].label.toLowerCase()),
    later && !at && 'when',
    !!preview?.problem && 'a way past the problem shown',
  ].filter(Boolean) as string[];

  const label = preview
    ? `${scheduledFor ? 'Schedule for' : 'Send to'} ${preview.reach} ${preview.reach === 1 ? 'person' : 'people'} · about ${preview.costText}`
    : 'Send';

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-5">
        <AudiencePicker
          options={options}
          departmentId={departmentId}
          value={audience}
          onChange={setAudience}
        />

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-[12px] font-medium text-fg2">What it says</legend>
          {canAdhoc && (
            <div className="flex gap-4 text-[12.5px]">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={mode === 'template'}
                  onChange={() => setMode('template')}
                />
                An approved template
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={mode === 'free'} onChange={() => setMode('free')} />
                My own words
              </label>
            </div>
          )}
          {mode === 'template' ? (
            templates.length ? (
              <Select
                label="Template"
                required
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                options={[
                  { value: '', label: 'Choose one' },
                  ...templates.map((t) => ({
                    value: t.id,
                    label: `${t.name}${t.department ? '' : ' (Communications)'}`,
                  })),
                ]}
              />
            ) : (
              <p className="text-[12.5px] text-fg2">
                No approved templates yet. Write one under Templates and ask Communications to
                approve it.
              </p>
            )
          ) : (
            <>
              <Alert tone="warn">
                For what no template covers. It goes out as you write it, unapproved.
              </Alert>
              {SMS_LANGS.map((lang) => (
                <BodyField
                  key={lang}
                  lang={lang}
                  value={bodies[lang] ?? ''}
                  onChange={(v) => setBodies((b) => ({ ...b, [lang]: v }))}
                />
              ))}
            </>
          )}
          {mode === 'template' && template && (
            <div className="rounded-[8px] border border-border bg-surface2 p-3 text-[12.5px] text-fg2">
              {SMS_LANGS.filter((l) => template.bodies[l]).map((l) => (
                <p key={l} className="mb-1 last:mb-0">
                  <span className="mr-1.5 text-[11px] font-semibold text-fg3 uppercase">{l}</span>
                  {template.bodies[l]}
                </p>
              ))}
            </div>
          )}
        </fieldset>

        {toType.length > 0 && (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-[12px] font-medium text-fg2">Fill in the blanks</legend>
            {toType.map((f) => (
              <Input
                key={f}
                label={BLANKS[f].label}
                required
                maxLength={60}
                value={fields[f] ?? ''}
                onChange={(e) => {
                  const value = e.target.value;
                  setFields((prev) => ({ ...prev, [f]: value }));
                }}
              />
            ))}
          </fieldset>
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[12px] font-medium text-fg2">When</legend>
          <label className="flex items-center gap-2 text-[12.5px]">
            <input type="radio" checked={!later} onChange={() => setLater(false)} /> Now
          </label>
          <label className="flex items-center gap-2 text-[12.5px]">
            <input type="radio" checked={later} onChange={() => setLater(true)} /> Later
          </label>
          {later && (
            <Input
              label="Send at"
              type="datetime-local"
              required
              value={at}
              onChange={(e) => setAt(e.target.value)}
            />
          )}
        </fieldset>
      </div>

      <aside className="flex flex-col gap-3 rounded-[10px] border border-border bg-surface p-4 lg:sticky lg:top-4 lg:self-start">
        <h2 className="text-[13px] font-semibold text-fg">What it will do</h2>
        {!preview && !previewError && (
          <p className="text-[12.5px] text-fg3">
            Choose who it goes to and what it says, and this fills in.
          </p>
        )}
        {previewError && <Alert tone="error">{previewError}</Alert>}
        {preview && (
          <>
            <dl className="grid grid-cols-2 gap-2 text-[12.5px]">
              <dt className="text-fg3">To</dt>
              <dd className="font-medium text-fg">{preview.audienceName}</dd>
              <dt className="text-fg3">People</dt>
              <dd className="font-medium text-fg tabular-nums">{preview.reach}</dd>
              <dt className="text-fg3">Left alone</dt>
              <dd className="text-fg2">
                {preview.leftAlone.optedOut +
                  preview.leftAlone.noPhone +
                  preview.leftAlone.duplicate ===
                0
                  ? 'Nobody'
                  : [
                      preview.leftAlone.optedOut &&
                        `${preview.leftAlone.optedOut} asked not to be messaged`,
                      preview.leftAlone.noPhone &&
                        `${preview.leftAlone.noPhone} with no usable number`,
                      preview.leftAlone.duplicate &&
                        `${preview.leftAlone.duplicate} sharing a number`,
                    ]
                      .filter(Boolean)
                      .join(', ')}
              </dd>
              <dt className="text-fg3">Segments</dt>
              <dd className="text-fg2 tabular-nums">
                {preview.segments} at {money(preview.pricePerSegment)} TZS
              </dd>
              <dt className="text-fg3">Cost</dt>
              <dd className="font-semibold text-fg tabular-nums">about {preview.costText}</dd>
              {preview.dailyCap && (
                <>
                  <dt className="text-fg3">Today so far</dt>
                  <dd className="text-fg2 tabular-nums">
                    {money(preview.spentToday)} of {money(preview.dailyCap)} TZS
                  </dd>
                </>
              )}
            </dl>
            {preview.samples.map((s) => (
              <div key={s.lang} className="rounded-[8px] border border-border bg-surface2 p-3">
                <p className="mb-1 text-[11px] font-semibold text-fg3">
                  {LANG_LABEL[s.lang]} · {s.people} {s.people === 1 ? 'person' : 'people'} ·{' '}
                  {s.segments} {s.segments === 1 ? 'segment' : 'segments'} each
                  {s.encoding === 'UCS-2' &&
                    ' · a character outside the basic alphabet makes it dearer'}
                </p>
                <p className="text-[12.5px] whitespace-pre-wrap text-fg">{s.text}</p>
              </div>
            ))}
            {preview.problem && <Alert tone="error">{preview.problem}</Alert>}
          </>
        )}
        <SubmitButton missing={missing} onClick={() => setConfirming(true)}>
          {label}
        </SubmitButton>
      </aside>

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={scheduledFor ? 'Schedule this message?' : 'Send this message?'}
        description={
          preview &&
          `${preview.reach} ${preview.reach === 1 ? 'person' : 'people'} in ${preview.audienceName}, about ${preview.costText}. A text that has gone cannot be taken back.`
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Not yet
            </Button>
            <Button loading={busy} onClick={send}>
              {scheduledFor ? 'Schedule it' : 'Send it'}
            </Button>
          </>
        }
      >
        {error && <Alert tone="error">{error}</Alert>}
      </Dialog>
    </div>
  );
}

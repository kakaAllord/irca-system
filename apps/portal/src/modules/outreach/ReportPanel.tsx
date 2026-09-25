'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import type { ReportVersion, ReportVersions } from './types';

/** The bucket refuses more than this; saying so first saves a wasted upload. */
const MAX_BYTES = 10 * 1_048_576;

type Policy = { url: string; fields: Record<string, string> };

const size = (bytes: number) =>
  bytes < 1_048_576
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1_048_576).toFixed(1)} MB`;
const when = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * A Saturday's report, as the leader writes it: a PDF of up to 10 MB. It goes
 * from the browser straight to the church's private storage, and opens
 * through a link that works for five minutes. Attaching another keeps this
 * one as an earlier version.
 */
export function ReportPanel({
  sessionId,
  versions,
  canUpload,
}: {
  sessionId: string;
  versions: ReportVersions;
  canUpload: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const base = `/outreach/sessions/${sessionId}/report`;

  async function open(version?: ReportVersion) {
    setError(null);
    // Opened before the link is fetched, so the browser treats it as the click's own window.
    const tab = window.open('', '_blank');
    try {
      const { url } = await clientApi<{ url: string }>(
        version ? `${base}?file=${version.id}` : base,
      );
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (err) {
      tab?.close();
      setError(err instanceof ApiRequestError ? err.message : 'Could not open it.');
    }
  }

  async function upload(file: File) {
    setError(null);
    if (file.type !== 'application/pdf') {
      setError('Only a PDF can be attached. Save the report as a PDF first.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`That file is ${size(file.size)}. A report can be up to 10 MB.`);
      return;
    }
    try {
      setBusy('Getting ready…');
      const { key, policy } = await clientApi<{ key: string; policy: Policy }>(`${base}/upload`, {
        method: 'POST',
      });
      setBusy('Uploading…');
      const form = new FormData();
      for (const [name, value] of Object.entries(policy.fields)) form.append(name, value);
      form.append('file', file);
      const res = await fetch(policy.url, { method: 'POST', body: form });
      if (!res.ok) {
        setError('The storage refused the file. Check it is a PDF of up to 10 MB, and try again.');
        return;
      }
      setBusy('Saving…');
      await clientApi(base, { method: 'POST', body: { key, name: file.name } });
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : 'The upload did not finish. Try again.',
      );
    } finally {
      setBusy(null);
      if (input.current) input.current.value = '';
    }
  }

  const { current, earlier } = versions;
  return (
    <section className="flex flex-col gap-3 rounded-[10px] border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-fg">Report</h2>
        {canUpload && (
          <>
            <input
              ref={input}
              type="file"
              accept="application/pdf"
              className="sr-only"
              aria-label="Choose the report, a PDF"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
              }}
            />
            <Button variant="secondary" loading={!!busy} onClick={() => input.current?.click()}>
              {busy ?? (current ? 'Attach a new version' : 'Attach the report')}
            </Button>
          </>
        )}
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {current ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
          <span className="flex flex-col">
            <span className="text-fg">{current.name}</span>
            <span className="text-[11.5px] text-fg3">
              {size(current.bytes)} · {when(current.uploadedAt)}
              {current.uploadedBy && ` · ${current.uploadedBy}`}
            </span>
          </span>
          <Button size="sm" onClick={() => open()}>
            Open
          </Button>
        </div>
      ) : (
        <p className="text-[12.5px] text-fg3">
          No report yet. {canUpload ? 'The leader attaches it as a PDF, up to 10 MB.' : null}
        </p>
      )}
      {earlier.length > 0 && (
        <details className="text-[12px]">
          <summary className="cursor-pointer text-fg2">
            Earlier versions <span className="text-fg3">· {earlier.length}</span>
          </summary>
          <ul className="mt-2 flex flex-col gap-1.5">
            {earlier.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-2">
                <span className="text-fg3">
                  {v.name} · {when(v.uploadedAt)}
                </span>
                <Button size="sm" variant="ghost" onClick={() => open(v)}>
                  Open
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

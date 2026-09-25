'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiRequestError, readApiError } from '@/lib/api/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import type { ReportVersion, ReportVersions } from './types';

/** The API refuses more than this; saying so first saves a wasted upload. */
const MAX_BYTES = 10 * 1_048_576;

const size = (bytes: number) =>
  bytes < 1_048_576
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1_048_576).toFixed(1)} MB`;
const when = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * A Saturday's report, as the leader writes it: a PDF of up to 10 MB, kept on
 * the church's own file storage and opened only by those who may read it.
 * Attaching another keeps this one as an earlier version.
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

  /** Opened in a tab of its own; the API checks the reader may, on the way. */
  function open(version?: ReportVersion) {
    window.open(version ? `/api${base}?file=${version.id}` : `/api${base}`, '_blank', 'noopener');
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
      setBusy('Uploading…');
      // The file is the body; its size goes with it, so one cut short on the
      // way is refused rather than kept.
      const res = await fetch(
        `/api${base}?name=${encodeURIComponent(file.name)}&bytes=${file.size}`,
        {
          method: 'PUT',
          credentials: 'same-origin',
          headers: { 'x-irca-client': 'portal', 'content-type': 'application/pdf' },
          body: file,
        },
      );
      if (!res.ok) throw await readApiError(res);
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

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { useCan } from '@/lib/session';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';

export type ChurchAudience = {
  key: string;
  label: string;
  description: string;
  reach: number;
  leftAlone: number;
  departments: { id: string; name: string }[];
};

/**
 * The church-wide audiences, how many each reaches today, and which
 * departments may use them. A department always reaches its own people;
 * anything wider is Communications' deliberate choice (D21, D22).
 */
export function AudiencesPanel({
  audiences,
  departments,
}: {
  audiences: ChurchAudience[];
  departments: { id: string; name: string }[];
}) {
  const can = useCan();
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {audiences.map((a) => (
        <AudienceCard
          key={a.key}
          audience={a}
          departments={departments}
          manage={can('comms.audiences.manage')}
        />
      ))}
    </div>
  );
}

function AudienceCard({
  audience: a,
  departments,
  manage,
}: {
  audience: ChurchAudience;
  departments: { id: string; name: string }[];
  manage: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(departmentId: string, method: 'PUT' | 'DELETE') {
    setBusy(true);
    setError(null);
    try {
      await clientApi(`/comms/audiences/${a.key}/departments/${departmentId}`, { method });
      setAdding('');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const others = departments.filter((d) => !a.departments.some((g) => g.id === d.id));
  return (
    <article className="flex flex-col gap-2 rounded-[10px] border border-border bg-surface p-4">
      <h3 className="text-[13px] font-semibold text-fg">{a.label}</h3>
      <p className="text-[12px] text-fg2">{a.description}</p>
      <p className="text-[12.5px] text-fg">
        Reaches <span className="font-semibold tabular-nums">{a.reach}</span> today
        {a.leftAlone ? <span className="text-fg3"> · {a.leftAlone} left alone</span> : null}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11.5px] text-fg3">Departments that may use it:</span>
        {a.departments.length === 0 && <span className="text-[11.5px] text-fg3">none</span>}
        {a.departments.map((d) => (
          <span
            key={d.id}
            className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-fg2"
          >
            {d.name}
            {manage && (
              <button
                type="button"
                aria-label={`Take it back from ${d.name}`}
                disabled={busy}
                onClick={() => call(d.id, 'DELETE')}
                className="text-fg3 hover:text-danger"
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      {manage && others.length > 0 && (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Select
              label="Let a department use it"
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              options={[
                { value: '', label: 'Choose a department' },
                ...others.map((d) => ({ value: d.id, label: d.name })),
              ]}
            />
          </div>
          <Button
            size="md"
            variant="secondary"
            disabled={!adding}
            loading={busy}
            onClick={() => call(adding, 'PUT')}
          >
            Let them
          </Button>
        </div>
      )}
      {error && <Alert tone="error">{error}</Alert>}
    </article>
  );
}

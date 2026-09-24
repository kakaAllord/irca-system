'use client';

import { useCallback, useEffect, useState } from 'react';
import { clientApi } from '@/lib/api/client';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';

type ServerLine = {
  n: number;
  at: string;
  level: string;
  msg: string;
  reqId?: string;
  userId?: string;
  actorUserId?: string;
  churchId?: string;
  method?: string;
  url?: string;
  status?: number;
  ms?: number;
  rest?: Record<string, unknown>;
};

type ServerLogs = {
  lines: ServerLine[];
  newest: number;
  dropped: boolean;
  held: number;
  scope: 'all' | 'church';
};

type ActionRow = {
  id: string;
  at: string;
  churchCode: string | null;
  source: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  summary: string | null;
  actor: string | null;
  subject: string | null;
  requestId: string | null;
};

type ActionLogs = { rows: ActionRow[]; nextBefore: string | null; scope: 'all' | 'church' };

const LEVELS = [
  { value: '', label: 'Every level' },
  { value: 'debug', label: 'Debug and above' },
  { value: 'info', label: 'Info and above' },
  { value: 'warn', label: 'Warnings and above' },
  { value: 'error', label: 'Errors only' },
];

const TONE: Record<string, string> = {
  fatal: 'text-danger',
  error: 'text-danger',
  warn: 'text-warn-fg',
  info: 'text-fg2',
  debug: 'text-fg3',
  trace: 'text-fg3',
};

/** The two logs, side by side in one page, because they answer each other. */
export function LogsView({ timezone, isDev }: { timezone: string; isDev: boolean }) {
  const [tab, setTab] = useState<'server' | 'actions'>('server');

  return (
    <>
      <div
        role="tablist"
        aria-label="Which log"
        className="mb-4 flex gap-1 border-b border-border"
      >
        <Tab id="server" current={tab} onSelect={setTab}>
          Server
        </Tab>
        <Tab id="actions" current={tab} onSelect={setTab}>
          User actions
        </Tab>
      </div>

      {tab === 'server' ? (
        <ServerLog timezone={timezone} isDev={isDev} />
      ) : (
        <ActionLog timezone={timezone} isDev={isDev} />
      )}
    </>
  );
}

function Tab({
  id,
  current,
  onSelect,
  children,
}: {
  id: 'server' | 'actions';
  current: string;
  onSelect: (id: 'server' | 'actions') => void;
  children: React.ReactNode;
}) {
  const active = current === id;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => onSelect(id)}
      className={`-mb-px border-b-2 px-3 py-2 text-[12.5px] font-medium ${
        active ? 'border-fg text-fg' : 'border-transparent text-fg2 hover:text-fg'
      }`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------

function ServerLog({ timezone, isDev }: { timezone: string; isDev: boolean }) {
  const [level, setLevel] = useState('');
  const [search, setSearch] = useState('');
  const [live, setLive] = useState(true);
  const [data, setData] = useState<ServerLogs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '300' });
      if (level) params.set('level', level);
      if (search.trim()) params.set('search', search.trim());
      setData(await clientApi<ServerLogs>(`/dev/logs/server?${params}`));
      setError(null);
    } catch {
      setError('Could not read the log just now.');
    }
  }, [level, search]);

  useEffect(() => {
    void load();
  }, [load]);

  // Polling, not a socket: the buffer is small and this page is opened by one
  // person at a time when something is wrong.
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => void load(), 3_000);
    return () => clearInterval(timer);
  }, [live, load]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <Select
          label="Level"
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          options={LEVELS}
        />
        <Input
          label="Contains"
          placeholder="a path, a message, a request id"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button variant="secondary" onClick={() => void load()}>
          Refresh
        </Button>
        <label className="flex h-9 items-center gap-1.5 px-1 text-[12.5px] text-fg2">
          <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
          Keep up to date
        </label>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <p className="text-[11.5px] text-fg3">
        {data ? `${data.held} lines held in memory` : 'Reading…'}
        {data?.scope === 'church' && !isDev && ' · your church, and the system’s own lines'}
        {' · '}
        the log starts empty after the server restarts, and holds only the most recent lines
      </p>

      {!data ? (
        <Spinner />
      ) : data.lines.length === 0 ? (
        <p className="rounded-[10px] border border-border bg-surface px-4 py-6 text-center text-[12.5px] text-fg2">
          Nothing matches. {search || level ? 'Try a wider filter.' : 'Use the portal and watch.'}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border2 overflow-hidden rounded-[10px] border border-border bg-surface font-mono">
          {data.lines.map((line) => (
            <li key={line.n}>
              <button
                type="button"
                onClick={() => setOpen((n) => (n === line.n ? null : line.n))}
                aria-expanded={open === line.n}
                className="flex w-full flex-wrap items-baseline gap-x-2 px-3 py-1.5 text-left text-[11.5px] hover:bg-hover"
              >
                <span className="w-[68px] shrink-0 text-fg3">{time(line.at, timezone)}</span>
                <span className={`w-[42px] shrink-0 uppercase ${TONE[line.level] ?? 'text-fg2'}`}>
                  {line.level}
                </span>
                {line.method && <span className="shrink-0 text-fg2">{line.method}</span>}
                <span className="min-w-0 flex-1 truncate text-fg">{line.url ?? line.msg}</span>
                {line.status !== undefined && (
                  <span
                    className={`shrink-0 ${line.status >= 500 ? 'text-danger' : line.status >= 400 ? 'text-warn-fg' : 'text-fg3'}`}
                  >
                    {line.status}
                  </span>
                )}
                {line.ms !== undefined && (
                  <span className="w-[54px] shrink-0 text-right text-fg3">{line.ms} ms</span>
                )}
              </button>
              {open === line.n && (
                <pre className="overflow-x-auto border-t border-border2 bg-bg px-3 py-2 text-[11px] text-fg2">
                  {JSON.stringify(line, null, 2)}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function ActionLog({ timezone, isDev }: { timezone: string; isDev: boolean }) {
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [rows, setRows] = useState<ActionRow[] | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(
    async (before?: string) => {
      setBusy(true);
      try {
        const params = new URLSearchParams({ limit: '50' });
        if (search.trim()) params.set('search', search.trim());
        if (action.trim()) params.set('action', action.trim());
        if (before) params.set('before', before);
        const page = await clientApi<ActionLogs>(`/dev/logs/actions?${params}`);
        setRows((old) => (before && old ? [...old, ...page.rows] : page.rows));
        setNextBefore(page.nextBefore);
        setError(null);
      } catch {
        setError('Could not read the log just now.');
      } finally {
        setBusy(false);
      }
    },
    [search, action],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <Input
          label="Contains"
          placeholder="a name, a number, a code"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Input
          label="Action starts with"
          placeholder="finance. · membership. · admin."
          value={action}
          onChange={(e) => setAction(e.target.value)}
        />
        <Button variant="secondary" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {!isDev && (
        <p className="text-[11.5px] text-fg3">Your church only.</p>
      )}

      {!rows ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <p className="rounded-[10px] border border-border bg-surface px-4 py-6 text-center text-[12.5px] text-fg2">
          Nothing matches.
        </p>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-border2 rounded-[10px] border border-border bg-surface">
            {rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setOpen((id) => (id === row.id ? null : row.id))}
                  aria-expanded={open === row.id}
                  className="flex w-full flex-wrap items-baseline gap-x-2 gap-y-0.5 px-4 py-2.5 text-left hover:bg-hover"
                >
                  <span className="w-[130px] shrink-0 text-[11.5px] text-fg3">
                    {when(row.at, timezone)}
                  </span>
                  {isDev && row.churchCode && (
                    <span className="shrink-0 text-[11px] text-fg3">{row.churchCode}</span>
                  )}
                  <span className="min-w-0 flex-1 text-[12.5px] text-fg">
                    {row.summary ?? row.action}
                  </span>
                  <span className="shrink-0 text-[11.5px] text-fg2">{row.actor ?? 'The system'}</span>
                </button>
                {open === row.id && (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-border2 bg-bg px-4 py-2 text-[11.5px]">
                    <dt className="text-fg3">action</dt>
                    <dd className="font-mono text-fg">{row.action}</dd>
                    {row.entityType && (
                      <>
                        <dt className="text-fg3">on</dt>
                        <dd className="font-mono text-fg">
                          {row.entityType} {row.entityId}
                        </dd>
                      </>
                    )}
                    {row.subject && (
                      <>
                        <dt className="text-fg3">about</dt>
                        <dd className="text-fg">{row.subject}</dd>
                      </>
                    )}
                    {row.requestId && (
                      <>
                        <dt className="text-fg3">request</dt>
                        <dd className="font-mono text-fg">{row.requestId}</dd>
                      </>
                    )}
                  </dl>
                )}
              </li>
            ))}
          </ul>
          {nextBefore && (
            <Button variant="secondary" loading={busy} onClick={() => void load(nextBefore)}>
              Show older
            </Button>
          )}
        </>
      )}
    </div>
  );
}

const time = (iso: string, timeZone: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour12: false, timeZone });

const when = (iso: string, timeZone: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  });

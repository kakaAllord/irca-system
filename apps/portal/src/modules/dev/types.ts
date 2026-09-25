/** What the dev console reads from the API. */

export type Series = { metric: string; points: { day: string; value: number }[] };

export type DatabaseUse = {
  totalBytes: number;
  tables: {
    table: string;
    rows: number;
    bytes: number;
    rowsWeekAgo: number;
    rowsMonthAgo: number;
    share: number;
  }[];
};

export type ApiClient = {
  id: string;
  name: string;
  kind: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type ChurchSettings = {
  code: string;
  name: string;
  timezone: string;
  currency: string;
  createdAt: string;
  codeLocked: boolean;
};

/** Dev → Settings → Alerts (docs/plan/10, step 10.4). */
export type AlertRecipient = { name: string; email: string; phone: string | null };
export type AlertsSettings = {
  recipients: AlertRecipient[];
  /** Hear only about credit and failing texts, as Communications. */
  commsOnly: AlertRecipient[];
  active: { key: string; summary: string; raisedAt: string; lastSentAt: string }[];
  dbStorageGb: number | null;
};

export type RouteUse = { route: string; calls: number; averageMs: number | null };

export type SentEmail = {
  id: string;
  to: string;
  template: string;
  status: 'PENDING' | 'SENDING' | 'SENT' | 'FAILED';
  attempts: number;
  lastError: string | null;
  createdAt: string;
  sentAt: string | null;
};

export type Health = {
  database: { bytes: number; connections: number; tables: { table: string; bytes: number }[] };
  slowQueries: { query: string; calls: number; meanMs: number; totalMs: number }[] | null;
  outbox: Record<string, number>;
  /** Text messages waiting or given up on, and the last reading of the Beem credit, in TZS. */
  sms: { queue: Record<string, number>; credit: { amount: number; day: string } | null };
  jobs: {
    job: string;
    lastRunAt: string;
    durationMs: number | null;
    ok: boolean | null;
    error: string | null;
  }[];
  errors: { day: string; requests: number; errors: number }[];
};

/** 41 MB, 1.2 GB — sizes people read rather than count. */
export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = n / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

export const number = (n: number) => n.toLocaleString('en-GB');

/** "2 min ago", "3 days ago", "never". */
export function ago(iso: string | null): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** The date `n` days before today, as the usage routes take it: 2026-09-24. */
export const daysAgo = (n: number) =>
  new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

/** A counter added up over the days asked for. */
export const total = (series: Series[], metric: string) =>
  series.find((s) => s.metric === metric)?.points.reduce((sum, p) => sum + p.value, 0) ?? 0;

/** A gauge as it was last measured. */
export const latest = (series: Series[], metric: string) =>
  series.find((s) => s.metric === metric)?.points.at(-1)?.value ?? 0;

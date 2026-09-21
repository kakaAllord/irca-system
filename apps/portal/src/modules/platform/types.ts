/** What the dev console reads from the platform API. */

export type ChurchRow = {
  id: string;
  code: string;
  name: string;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: string;
  people: { active: number; invited: number };
  portals: number;
  requests: number;
  errors: number;
  activeUsers: number;
  signIns: number;
  emails: number;
  registrations: number;
  entries: number;
  dbBytes: number;
  dbSharePct: number;
  lastActiveAt: string | null;
  requestsByDay: { day: string; value: number }[];
};

export type ChurchDetail = {
  id: string;
  code: string;
  slug: string;
  name: string;
  timezone: string;
  currency: string;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: string;
  codeLocked: boolean;
  admins: { id: string; fullName: string; email: string; status: string }[];
};

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

export type ChurchUser = {
  userId: string;
  fullName: string;
  initials: string;
  email: string;
  status: string;
  roles: string[];
  lastActiveAt: string | null;
  canImpersonate: boolean;
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

export type Health = {
  database: { bytes: number; connections: number; tables: { table: string; bytes: number }[] };
  slowQueries: { query: string; calls: number; meanMs: number; totalMs: number }[] | null;
  outbox: Record<string, number>;
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

/** An address enough of which is hidden: ne***@gmail.com. */
export function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  if (!domain) return '***';
  return `${name!.slice(0, 2)}***@${domain}`;
}

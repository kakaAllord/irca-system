/** What a session looks like in the log. */
export type LogSession = {
  id: string;
  church: string;
  timezone: string;
  actor: { name: string; email: string; roles: string[] };
  subject: { name: string; email: string; roles: string[] };
  startedAt: string;
  endedAt: string | null;
  endReason: string | null;
  seconds: number | null;
  views: number;
};

export type View = { at: string; method: string; path: string; status: number; ms: number };

/** `show` answers with the same session, but with every page opened in it. */
export type SessionDetail = Omit<LogSession, 'views'> & { views: View[] };

export type LiveEvent = {
  actor: string | null;
  subject: string | null;
  at: string;
  kind: 'START' | 'VIEW' | 'END';
  sessionId: string | null;
  church: string;
  timezone: string;
  summary: string;
  method: string | null;
  path: string | null;
  status: number | null;
  ms: number | null;
};

export type Line = { text: string; tone?: 'dim' | 'accent' | 'danger' | 'ok' };

/** In the church's own time, because that is when it happened for them. */
export function at(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(iso));
}

/** 47s, 12m, 1h04. */
export function howLong(seconds: number | null): string {
  if (seconds === null) return 'open';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h${String(Math.round((seconds % 3600) / 60)).padStart(2, '0')}`;
}

const pad = (text: string, width: number) =>
  text.length > width ? `${text.slice(0, width - 1)}…` : text.padEnd(width);

/** One session per line, in columns that line up in a monospace font. */
export function sessionLine(session: LogSession): Line {
  return {
    text: [
      session.id.slice(0, 8),
      pad(at(session.startedAt, session.timezone), 19),
      pad(session.church, 6),
      pad(`${session.actor.email} → ${session.subject.email}`, 46),
      pad(howLong(session.seconds), 6),
      `${String(session.views).padStart(4)} views`,
      session.endedAt ? (session.endReason ?? '').toLowerCase() : 'still open',
    ].join('  '),
    tone: session.endedAt ? undefined : 'accent',
  };
}

export function sessionHeader(): Line {
  return {
    text: [
      pad('id', 8),
      pad('started', 19),
      pad('church', 6),
      pad('who viewed as whom', 46),
      pad('for', 6),
      '     views',
      'ended',
    ].join('  '),
    tone: 'dim',
  };
}

export function viewLine(view: View, timezone: string): Line {
  return {
    text: [
      pad(at(view.at, timezone), 19),
      pad(view.method, 6),
      pad(view.path, 52),
      String(view.status).padStart(3),
      `${String(view.ms).padStart(5)} ms`,
    ].join('  '),
    tone: view.status >= 400 ? 'danger' : undefined,
  };
}

export function eventLine(event: LiveEvent): Line {
  const who = `${event.actor ?? '?'} → ${event.subject ?? '?'}`;
  if (event.kind === 'VIEW') {
    return {
      text: `${at(event.at, event.timezone)}  ${pad(event.church, 6)}  ${pad(who, 46)}  ${event.method ?? ''} ${event.path ?? ''}`,
      tone: (event.status ?? 200) >= 400 ? 'danger' : 'dim',
    };
  }
  return {
    text: `${at(event.at, event.timezone)}  ${pad(event.church, 6)}  ${pad(who, 46)}  ${event.kind === 'START' ? 'started viewing as' : 'stopped'}`,
    tone: event.kind === 'START' ? 'accent' : 'ok',
  };
}

/** The rows as a file, for a support thread or an auditor. */
export function toCsv(rows: LogSession[]): string {
  const head = [
    'session_id',
    'church',
    'actor_name',
    'actor_email',
    'subject_name',
    'subject_email',
    'started_at',
    'ended_at',
    'end_reason',
    'seconds',
    'views',
  ];
  const cell = (value: string | number | null) => {
    const text = value === null ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [
    head.join(','),
    ...rows.map((r) =>
      [
        r.id,
        r.church,
        r.actor.name,
        r.actor.email,
        r.subject.name,
        r.subject.email,
        r.startedAt,
        r.endedAt,
        r.endReason,
        r.seconds,
        r.views,
      ]
        .map(cell)
        .join(','),
    ),
  ].join('\n');
}

import { Injectable } from '@nestjs/common';
import { Writable } from 'node:stream';

/** One line as pino wrote it, with the fields the console shows pulled out. */
export type LogLine = {
  /** Position in the buffer. Newer lines always have a higher number. */
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
  /** Everything else pino wrote, for the line that needs reading in full. */
  rest?: Record<string, unknown>;
};

const LEVELS: Record<number, string> = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal',
};

const RANK: Record<string, number> = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 };

/**
 * The last few thousand log lines, in memory, so the dev console can show what
 * the terminal shows.
 *
 * Deliberately not a table. A line per request written to Postgres would cost
 * more than it is worth, and real log shipping belongs with a log provider
 * (`docs/plan/10-strengthening.md`). This is the convenience of not having to
 * be at the terminal, and it says plainly that it starts empty after a
 * restart and holds only this one process's lines.
 */
@Injectable()
export class LogBufferService {
  private readonly lines: LogLine[] = [];
  private next = 1;
  private capacity = 2_000;

  /** Called once at boot, before any line arrives. */
  setCapacity(lines: number) {
    this.capacity = lines;
  }

  get size() {
    return this.lines.length;
  }

  /** The stream pino writes every line to, beside the terminal. */
  stream(): Writable {
    return new Writable({
      write: (chunk: Buffer, _encoding, callback) => {
        // A bad line must never take the server down with it.
        try {
          for (const raw of chunk.toString().split('\n')) {
            if (raw.trim()) this.push(raw);
          }
        } catch {
          // A line we cannot parse is a line we do without.
        }
        callback();
      },
    });
  }

  private push(raw: string) {
    if (this.capacity === 0) return;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const { level, time, msg, reqId, userId, actorUserId, churchId, req, res, responseTime, ...rest } =
      parsed;

    const request = req as { method?: string; url?: string; id?: string } | undefined;
    const response = res as { statusCode?: number } | undefined;

    this.lines.push({
      n: this.next++,
      at: new Date(typeof time === 'number' ? time : Date.now()).toISOString(),
      // pino writes the level as a number; anything else is a line we did not write.
      level: LEVELS[Number(level)] ?? (typeof level === 'string' ? level : 'info'),
      msg: typeof msg === 'string' ? msg : '',
      reqId: str(reqId ?? request?.id),
      userId: str(userId),
      actorUserId: str(actorUserId),
      churchId: str(churchId),
      method: request?.method,
      url: request?.url,
      status: response?.statusCode,
      ms: typeof responseTime === 'number' ? Math.round(responseTime) : undefined,
      rest: Object.keys(rest).length ? (rest as Record<string, unknown>) : undefined,
    });

    // Oldest out, one at a time, so the array never grows past its capacity.
    while (this.lines.length > this.capacity) this.lines.shift();
  }

  /**
   * Newest first, narrowed. `since` returns only what arrived after a line
   * already seen, which is what lets the page poll without re-reading
   * everything. `churchId` keeps that church's lines and the ones belonging to
   * no church at all.
   */
  list(query: {
    level?: string;
    search?: string;
    churchId?: string;
    since?: number;
    limit?: number;
  }): { lines: LogLine[]; newest: number; dropped: boolean } {
    const floor = query.level ? (RANK[query.level] ?? 0) : 0;
    const needle = query.search?.toLowerCase();

    const matched = this.lines.filter((line) => {
      if (floor && (RANK[line.level] ?? 0) < floor) return false;
      if (query.since && line.n <= query.since) return false;
      // A line with no church is the system's own — boot, jobs, a failure
      // before the guard ran — and is the most useful line there is when
      // something is broken, so it is not filtered away.
      if (query.churchId && line.churchId && line.churchId !== query.churchId) return false;
      if (needle) {
        const haystack = `${line.msg} ${line.url ?? ''} ${line.reqId ?? ''}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });

    const limit = Math.min(query.limit ?? 200, 1_000);
    return {
      lines: matched.slice(-limit).reverse(),
      newest: this.lines.at(-1)?.n ?? 0,
      // The caller asked for everything after a line that has already been
      // pushed out, so it has missed some.
      dropped: Boolean(query.since && this.lines.length > 0 && this.lines[0]!.n > query.since + 1),
    };
  }
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

/**
 * The one buffer, as a plain value.
 *
 * Pino is built by a factory that runs while the injector is still being
 * assembled, so the buffer cannot be something the injector has to resolve
 * first. It is created here and handed to Nest with `useValue`, which is why
 * the logger and the controller are certain to share the same one.
 */
export const logBuffer = new LogBufferService();

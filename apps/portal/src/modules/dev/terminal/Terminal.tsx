'use client';

import { useEffect, useRef, useState } from 'react';
import { clientApi } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { HELP, parseCommand, type Filters } from './parse';
import {
  eventLine,
  sessionHeader,
  sessionLine,
  toCsv,
  viewLine,
  type Line,
  type LiveEvent,
  type LogSession,
  type SessionDetail,
} from './format';

type Block = { id: number; typed: string | null; lines: Line[] };

const TONES: Record<NonNullable<Line['tone']>, string> = {
  dim: 'text-fg3',
  accent: 'text-accent',
  danger: 'text-danger',
  ok: 'text-pos',
};

const WELCOME: Line[] = [
  { text: 'The view-as log. Every time anyone opened the portal as someone else.', tone: 'dim' },
  { text: 'Type help to see what you can ask. Start with: log --since=7d', tone: 'dim' },
];

/**
 * The view-as log, read by typing.
 *
 * Nothing here can change anything: every command is a read. `follow` polls
 * for what has happened since the last thing it showed, so an open screen
 * fills in as people work, and `stop`, Escape or leaving the page ends it.
 */
export function Terminal({ timezone }: { timezone: string }) {
  const [blocks, setBlocks] = useState<Block[]>([{ id: 0, typed: null, lines: WELCOME }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [following, setFollowing] = useState(false);
  const history = useRef<string[]>([]);
  const historyAt = useRef<number | null>(null);
  const lastRows = useRef<LogSession[]>([]);
  const nextId = useRef(1);
  const bottom = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const follow = useRef<{ since: string; timer?: number } | null>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [blocks]);

  // Leaving the page must not leave a poll running.
  useEffect(() => () => window.clearTimeout(follow.current?.timer), []);

  function write(lines: Line[], typed: string | null = null) {
    setBlocks((old) => [...old, { id: nextId.current++, typed, lines }]);
  }

  function stopFollowing(say = true) {
    window.clearTimeout(follow.current?.timer);
    follow.current = null;
    setFollowing(false);
    if (say) write([{ text: 'Stopped following.', tone: 'dim' }]);
  }

  async function poll() {
    if (!follow.current) return;
    const { since } = follow.current;
    try {
      const query = new URLSearchParams({ after: since });
      const events = await clientApi<LiveEvent[]>(`/dev/impersonations/events?${query}`);
      if (!follow.current) return;
      if (events.length) {
        follow.current.since = events.at(-1)!.at;
        write(events.map((e) => eventLine(e, timezone)));
      }
    } catch {
      write([{ text: 'Lost the connection. Following again in a moment.', tone: 'danger' }]);
    }
    if (follow.current) {
      follow.current.timer = window.setTimeout(poll, 3000);
    }
  }

  async function run(typed: string) {
    const command = parseCommand(typed);
    if (command.name === 'error') {
      return write(command.message ? [{ text: command.message, tone: 'danger' }] : [], typed);
    }
    // Anything typed while following takes over the screen, so end it first.
    if (following && command.name !== 'stop') stopFollowing(false);

    switch (command.name) {
      case 'help':
        return write(
          HELP.map((text) => ({ text, tone: 'dim' as const })),
          typed,
        );
      case 'clear':
        history.current = [typed, ...history.current];
        return setBlocks([]);
      case 'stop':
        write([], typed);
        return following
          ? stopFollowing()
          : write([{ text: 'Not following anything.', tone: 'dim' }]);
      case 'export': {
        if (!lastRows.current.length) {
          return write([{ text: 'Ask for a log first, then export it.', tone: 'danger' }], typed);
        }
        const csv = command.format === 'csv';
        download(
          csv ? toCsv(lastRows.current) : JSON.stringify(lastRows.current, null, 2),
          `view-as-log.${command.format}`,
          csv ? 'text/csv' : 'application/json',
        );
        return write(
          [{ text: `${lastRows.current.length} sessions saved as ${command.format}.`, tone: 'ok' }],
          typed,
        );
      }
      default:
        break;
    }

    setBusy(true);
    try {
      switch (command.name) {
        case 'log': {
          const { rows, next } = await clientApi<{ rows: LogSession[]; next: string | null }>(
            `/dev/impersonations?${query(command.filters)}`,
          );
          lastRows.current = rows;
          return write(
            rows.length
              ? [
                  sessionHeader(),
                  ...rows.map((row) => sessionLine(row, timezone)),
                  {
                    text: `${rows.length} session${rows.length === 1 ? '' : 's'}${next ? ', and more before them — narrow it with --since or --limit' : ''}. Type export to save them, or show <id> for one.`,
                    tone: 'dim',
                  },
                ]
              : [{ text: 'Nobody viewed as anybody, with those filters.', tone: 'dim' }],
            typed,
          );
        }
        case 'show': {
          const session = await clientApi<SessionDetail>(`/dev/impersonations/${command.id}`);
          return write(
            [
              { text: `${session.actor.name} <${session.actor.email}>`, tone: 'accent' },
              { text: `viewed as ${session.subject.name} <${session.subject.email}>` },
              {
                text: `roles then: ${session.subject.roles.join(', ') || 'none'} · ${session.views.length} pages · ${session.endedAt ? `ended ${(session.endReason ?? '').toLowerCase()}` : 'still open'}`,
                tone: 'dim',
              },
              { text: '' },
              ...session.views.map((view) => viewLine(view, timezone)),
              ...(session.views.length
                ? []
                : [{ text: 'No pages were opened in it.', tone: 'dim' as const }]),
            ],
            typed,
          );
        }
        case 'follow': {
          follow.current = { since: new Date().toISOString() };
          setFollowing(true);
          write(
            [{ text: 'Following. Type stop, or press Escape, to end it.', tone: 'ok' }],
            typed,
          );
          return poll();
        }
      }
    } catch (err) {
      return write(
        [
          {
            text: err instanceof ApiRequestError ? err.message : 'That did not work. Try again.',
            tone: 'danger',
          },
        ],
        typed,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="flex h-[calc(100vh-190px)] min-h-[420px] flex-col overflow-hidden rounded-[10px] border border-border bg-[#0d1117] font-mono text-[12px] leading-[1.55] text-[#d7dde5]"
      onClick={() => field.current?.focus()}
    >
      <div className="flex-1 overflow-y-auto px-4 py-3" aria-live="polite">
        {blocks.map((block) => (
          <div key={block.id} className="mb-1.5">
            {block.typed !== null && (
              <p className="text-[#7fd1b9]">
                <span className="text-[#5a6673]">irca&gt;</span> {block.typed}
              </p>
            )}
            {block.lines.map((line, i) => (
              <p key={i} className={`whitespace-pre-wrap ${line.tone ? TONES[line.tone] : ''}`}>
                {line.text || ' '}
              </p>
            ))}
          </div>
        ))}
        <div ref={bottom} />
      </div>

      <form
        className="flex items-center gap-2 border-t border-[#1d2530] px-4 py-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          const typed = input.trim();
          if (!typed || busy) return;
          history.current = [typed, ...history.current].slice(0, 100);
          historyAt.current = null;
          setInput('');
          void run(typed);
        }}
      >
        <label htmlFor="log-command" className="text-[#5a6673]">
          irca&gt;
        </label>
        <input
          id="log-command"
          ref={field}
          value={input}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          aria-label="Command"
          placeholder={following ? 'following… type stop to end it' : 'log --since=7d'}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // The last things typed, on the arrow keys, as a terminal does.
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              const at =
                historyAt.current === null
                  ? 0
                  : Math.min(historyAt.current + 1, history.current.length - 1);
              if (history.current[at] !== undefined) {
                historyAt.current = at;
                setInput(history.current[at]!);
              }
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              const at = historyAt.current === null ? null : historyAt.current - 1;
              historyAt.current = at !== null && at >= 0 ? at : null;
              setInput(
                historyAt.current === null ? '' : (history.current[historyAt.current] ?? ''),
              );
            } else if (e.key === 'Escape' && following) {
              stopFollowing();
            }
          }}
          className="flex-1 bg-transparent text-[#d7dde5] placeholder:text-[#4a5561] focus:outline-none"
        />
        {busy && <span className="text-[#5a6673]">working…</span>}
        {following && <span className="text-accent">● live</span>}
      </form>
    </div>
  );
}

function query(filters: Filters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined) params.set(key, String(value));
  }
  if (!params.has('since')) params.set('since', '30d');
  return params.toString();
}

/** Saves text as a file, without leaving the page. */
function download(text: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

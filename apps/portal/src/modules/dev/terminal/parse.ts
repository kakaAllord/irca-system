/**
 * The view-as log is read by typing, not by clicking.
 *
 * It is the one place anyone can see who viewed the portal as whom, and the
 * questions asked of it are of the shape "everything Paul did last week",
 * which is a filter with three parts. A row of dropdowns for that is slower
 * to use than a line of text, and a line of text can be pasted into a
 * support thread. So: a small command language, parsed here, away from React,
 * where it can be tested by itself.
 */

export type Filters = {
  actor?: string;
  subject?: string;
  since?: string;
  until?: string;
  limit?: number;
};

export type Command =
  | { name: 'log'; filters: Filters }
  | { name: 'show'; id: string }
  | { name: 'follow' }
  | { name: 'stop' }
  | { name: 'export'; format: 'csv' | 'json' }
  | { name: 'clear' }
  | { name: 'help' }
  | { name: 'error'; message: string };

const FLAGS = ['actor', 'subject', 'since', 'until', 'limit'] as const;

export const HELP = [
  'log [--actor=text] [--subject=text] [--since=24h] [--until=DATE] [--limit=n]',
  '                  who viewed as whom, newest first',
  'show <id>         one session and every page opened in it (the first few characters of the id will do)',
  'follow            watch it happen, live; "stop" ends it',
  'export [csv|json] the last log you asked for, as a file',
  'clear             empty the screen',
  'help              this',
  '',
  'Times: 24h, 7d, 30d or a date such as 2026-09-01.',
];

/** A line of typing into one command, or an error saying what was wrong with it. */
export function parseCommand(line: string): Command {
  const parts = tokenize(line.trim());
  const [name, ...rest] = parts;
  if (!name) return { name: 'error', message: '' };

  switch (name.toLowerCase()) {
    case 'log': {
      const { flags, loose, error } = readFlags(rest);
      if (error) return { name: 'error', message: error };
      if (loose.length > 0) return { name: 'error', message: `I don't understand "${loose[0]}".` };
      const limit = flags.limit === undefined ? undefined : Number(flags.limit);
      if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 500)) {
        return { name: 'error', message: '--limit takes a whole number from 1 to 500.' };
      }
      return {
        name: 'log',
        filters: {
          ...(flags.actor ? { actor: flags.actor } : {}),
          ...(flags.subject ? { subject: flags.subject } : {}),
          ...(flags.since ? { since: flags.since } : {}),
          ...(flags.until ? { until: flags.until } : {}),
          ...(limit !== undefined ? { limit } : {}),
        },
      };
    }
    case 'show': {
      const id = rest[0];
      if (!id) return { name: 'error', message: 'show needs the id of a session: show 3f2a1b.' };
      if (!/^[0-9a-f-]{4,36}$/i.test(id)) {
        return { name: 'error', message: `"${id}" is not the start of a session id.` };
      }
      return { name: 'show', id: id.toLowerCase() };
    }
    case 'follow':
      return { name: 'follow' };
    case 'stop':
      return { name: 'stop' };
    case 'export': {
      const format = (rest[0] ?? 'csv').toLowerCase();
      if (format !== 'csv' && format !== 'json') {
        return { name: 'error', message: 'export takes csv or json.' };
      }
      return { name: 'export', format };
    }
    case 'clear':
    case 'cls':
      return { name: 'clear' };
    case 'help':
    case '?':
      return { name: 'help' };
    default:
      return { name: 'error', message: `"${name}" is not a command. Type help.` };
  }
}

/** Words, keeping "two words" in quotes together, including after a flag. */
function tokenize(line: string): string[] {
  return (line.match(/(?:[^\s"]+|"[^"]*")+/g) ?? []).map((part) => part.replace(/"/g, ''));
}

function readFlags(parts: string[]): {
  flags: Partial<Record<(typeof FLAGS)[number], string>>;
  loose: string[];
  error?: string;
} {
  const flags: Partial<Record<(typeof FLAGS)[number], string>> = {};
  const loose: string[] = [];
  for (const part of parts) {
    if (!part.startsWith('--')) {
      loose.push(part);
      continue;
    }
    const [key, ...value] = part.slice(2).split('=');
    const flag = FLAGS.find((f) => f === key);
    if (!flag) {
      return { flags, loose, error: `"--${key}" is not one of ${FLAGS.join(', ')}.` };
    }
    if (!value.length || !value.join('=')) {
      return { flags, loose, error: `--${key} needs a value, like --${key}=something.` };
    }
    flags[flag] = value.join('=');
  }
  return { flags, loose };
}

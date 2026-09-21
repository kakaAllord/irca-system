import { createInterface } from 'node:readline';

/**
 * Reads a secret without echoing it. Passwords never go on the command line,
 * where they would land in shell history and in the process list.
 *
 * When stdin is not a terminal (piped input, e.g. in a test), it reads the
 * next line as is.
 */
// Piped input is read once, line by line, into a queue that every prompt takes
// from: a fresh line reader per prompt would swallow the lines meant for the
// next one.
let piped: Promise<string[]> | null = null;
function pipedLines(): Promise<string[]> {
  piped ??= new Promise((resolve) => {
    const lines: string[] = [];
    const rl = createInterface({ input: process.stdin });
    rl.on('line', (line) => lines.push(line));
    rl.on('close', () => resolve(lines));
  });
  return piped;
}

export async function promptHidden(question: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    const lines = await pipedLines();
    const line = lines.shift();
    if (line === undefined) throw new Error(`No input for: ${question.trim()}`);
    return line;
  }

  process.stdout.write(question);
  return new Promise<string>((resolve, reject) => {
    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u0003') {
          stdin.setRawMode(false);
          reject(new Error('cancelled'));
          return;
        }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

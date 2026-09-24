import { describe, expect, it } from 'vitest';
import { parseCommand } from './parse';

describe('the view-as log command line', () => {
  it('reads every filter, and keeps quoted words together', () => {
    expect(parseCommand('log --actor="Paul Mwita" --since=7d --limit=20')).toEqual({
      name: 'log',
      filters: { actor: 'Paul Mwita', since: '7d', limit: 20 },
    });
  });

  it('says which flag it does not know, rather than ignoring it', () => {
    const parsed = parseCommand('log --wherever=irca');
    expect(parsed).toMatchObject({ name: 'error' });
    expect((parsed as { message: string }).message).toContain('--wherever');
  });

  it('says what it does not understand, rather than guessing', () => {
    const parsed = parseCommand('log irca');
    expect(parsed).toMatchObject({ name: 'error' });
    expect((parsed as { message: string }).message).toContain('irca');
  });

  it('refuses a limit that is not a sensible number', () => {
    expect(parseCommand('log --limit=nine')).toMatchObject({ name: 'error' });
    expect(parseCommand('log --limit=9000')).toMatchObject({ name: 'error' });
    expect(parseCommand('log --limit=500')).toMatchObject({ name: 'log' });
  });

  it('takes the first characters of a session id, and nothing else', () => {
    expect(parseCommand('show 3f2a1b')).toEqual({ name: 'show', id: '3f2a1b' });
    expect(parseCommand('show ../etc')).toMatchObject({ name: 'error' });
    expect(parseCommand('show')).toMatchObject({ name: 'error' });
  });

  it('follows, and stops', () => {
    expect(parseCommand('follow')).toEqual({ name: 'follow' });
    expect(parseCommand('stop')).toEqual({ name: 'stop' });
  });

  it('exports csv unless told otherwise', () => {
    expect(parseCommand('export')).toEqual({ name: 'export', format: 'csv' });
    expect(parseCommand('export json')).toEqual({ name: 'export', format: 'json' });
    expect(parseCommand('export pdf')).toMatchObject({ name: 'error' });
  });

  it('names what it does not know', () => {
    expect(parseCommand('sudo rm -rf')).toMatchObject({ name: 'error' });
    expect(parseCommand('  ')).toEqual({ name: 'error', message: '' });
  });
});

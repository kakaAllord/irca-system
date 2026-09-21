import { describe, expect, it } from 'vitest';
import { howLong, toCsv, type LogSession } from './format';

const session = (over: Partial<LogSession> = {}): LogSession => ({
  id: 'c0ffee00-0000-0000-0000-000000000000',
  church: 'IRCA',
  timezone: 'Africa/Dar_es_Salaam',
  actor: { name: 'Paul Mwita', email: 'paul@example.com', roles: ['dev'] },
  subject: { name: 'Mary, Clerk', email: 'mary@example.com', roles: ['Finance clerk'] },
  startedAt: '2026-09-21T09:00:00.000Z',
  endedAt: '2026-09-21T09:12:00.000Z',
  endReason: 'STOPPED',
  seconds: 720,
  views: 47,
  ...over,
});

describe('the view-as log, written down', () => {
  it('says how long in a unit that fits', () => {
    expect(howLong(47)).toBe('47s');
    expect(howLong(720)).toBe('12m');
    expect(howLong(3900)).toBe('1h05');
    expect(howLong(null)).toBe('open');
  });

  it('quotes a name with a comma in it, so the file survives a spreadsheet', () => {
    const csv = toCsv([session()]);
    const [head, row] = csv.split('\n');
    expect(head).toContain('actor_email');
    expect(row).toContain('"Mary, Clerk"');
    expect(row!.split(',')).toHaveLength(12);
  });

  it('leaves an open session ending empty rather than writing null', () => {
    const csv = toCsv([session({ endedAt: null, endReason: null, seconds: null })]);
    expect(csv).not.toContain('null');
  });
});

import { describe, expect, it } from 'vitest';
import { safeNext } from './safe-next';

describe('safeNext', () => {
  it('keeps paths on this site', () => {
    expect(safeNext('/finance/transactions?kind=expense')).toBe(
      '/finance/transactions?kind=expense',
    );
    expect(safeNext(['/admin', '/x'])).toBe('/admin');
  });

  it('sends everything else home', () => {
    for (const bad of [
      '//evil.com',
      '/\\evil.com',
      'https://evil.com',
      'evil.com',
      '',
      null,
      undefined,
    ]) {
      expect(safeNext(bad)).toBe('/');
    }
  });
});

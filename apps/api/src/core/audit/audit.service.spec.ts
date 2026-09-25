import { describe, expect, it } from 'vitest';
import { fitSummary } from './audit.service.js';

describe('fitSummary', () => {
  it('keeps a line that fits, and cuts a longer one to the column, saying so', () => {
    expect(fitSummary('Sent Peter and John to Sombetini')).toBe('Sent Peter and John to Sombetini');
    expect(fitSummary(null)).toBeNull();
    const long = `Sent ${'Team Member, '.repeat(60)}to Everywhere`;
    const cut = fitSummary(long)!;
    expect(cut).toHaveLength(300);
    expect(cut.endsWith('…')).toBe(true);
    expect(long.startsWith(cut.slice(0, -1))).toBe(true);
  });
});

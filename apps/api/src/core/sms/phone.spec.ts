import { describe, expect, it } from 'vitest';
import { toE164 } from './phone.js';

describe('phone numbers as the carrier wants them', () => {
  it('writes Tanzanian numbers however they were typed as one E.164 number', () => {
    expect(toE164('+255', '712345678')).toBe('+255712345678');
    expect(toE164('+255', '0712 345 678')).toBe('+255712345678');
    expect(toE164('+255', '+255712345678')).toBe('+255712345678');
  });

  it('keeps other countries', () => {
    expect(toE164('+254', '712345678')).toBe('+254712345678');
  });

  it('says so when there is nothing to send to', () => {
    expect(toE164('+255', '')).toBeNull();
    expect(toE164('+255', '12')).toBeNull();
  });
});

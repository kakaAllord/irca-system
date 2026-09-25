import { describe, expect, it } from 'vitest';
import { names, phoneKey } from './reached.service.js';

describe('phoneKey', () => {
  it('reads one number the same however it was typed', () => {
    const key = '255712345678';
    expect(phoneKey('+255', '0712 345 678')).toBe(key);
    expect(phoneKey('+255', '712345678')).toBe(key);
    expect(phoneKey('+255', '+255 712 345 678')).toBe(key);
    expect(phoneKey('+255', '0712-345-678')).toBe(key);
  });

  it('keeps the dialling code apart: a Kenyan number is not a Tanzanian one', () => {
    expect(phoneKey('+254', '0712345678')).not.toBe(phoneKey('+255', '0712345678'));
  });

  it('has no key for no number, or a fragment of one', () => {
    expect(phoneKey('+255', '')).toBeNull();
    expect(phoneKey('+255', '0712')).toBeNull();
  });
});

describe('names', () => {
  it('reads as a sentence', () => {
    expect(names([])).toBe('');
    expect(names(['Peter'])).toBe('Peter');
    expect(names(['Peter', 'John'])).toBe('Peter and John');
    expect(names(['Peter', 'John', 'Grace'])).toBe('Peter, John and Grace');
  });
});

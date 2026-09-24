import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { open, seal } from './secret-box.js';

describe('the secret box the Beem key is kept in', () => {
  const key = randomBytes(32);

  it('opens what it sealed, and never seals the same text the same way twice', () => {
    const a = seal('beem-api-key-1234', key);
    const b = seal('beem-api-key-1234', key);
    expect(open(a, key)).toBe('beem-api-key-1234');
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
    expect(Buffer.from(a).toString('utf8')).not.toContain('beem-api-key');
  });

  it('refuses a changed byte, and the wrong key', () => {
    const sealed = seal('secret', key);
    const tampered = Buffer.from(sealed);
    tampered[tampered.length - 1]! ^= 1;
    expect(() => open(tampered, key)).toThrow();
    expect(() => open(sealed, randomBytes(32))).toThrow();
  });
});

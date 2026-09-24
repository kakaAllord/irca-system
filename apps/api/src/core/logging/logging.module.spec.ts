import { describe, expect, it } from 'vitest';
import { redactUrl } from './logging.module.js';

describe('redacting a token out of a logged URL', () => {
  it('replaces a long random-looking path segment', () => {
    const token = 'A'.repeat(43);
    expect(redactUrl(`/v1/invitations/${token}`)).toBe('/v1/invitations/[redacted]');
    expect(redactUrl(`/v1/invitations/${token}/accept`)).toBe('/v1/invitations/[redacted]/accept');
  });

  it('leaves an ordinary path and a short id alone', () => {
    expect(redactUrl('/v1/finance/transactions')).toBe('/v1/finance/transactions');
    expect(redactUrl('/v1/dev/impersonations/3f2a1b')).toBe('/v1/dev/impersonations/3f2a1b');
    const id = '0193a2f1-7c4e-7b6a-9d2e-5f1c3a8b9e01';
    expect(redactUrl(`/v1/membership/people/${id}`)).toBe(`/v1/membership/people/${id}`);
  });

  it('redacts a token that carries a query string too', () => {
    const token = 'B'.repeat(43);
    expect(redactUrl(`/v1/invitations/${token}?x=1`)).toBe('/v1/invitations/[redacted]?x=1');
  });
});

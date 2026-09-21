import { describe, expect, it } from 'vitest';
import { carriesToken, contentSecurityPolicy, securityHeaders } from './web-security';

describe('what a browser is told it may do', () => {
  const csp = contentSecurityPolicy({ nonce: 'abc123' });

  it('runs only the scripts it handed out a nonce for', () => {
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain('unsafe-eval');
    // The relaxation is styles only, and never scripts.
    expect(csp.split('; ').filter((d) => d.includes('unsafe-inline'))).toEqual([
      "style-src 'self' 'unsafe-inline'",
    ]);
  });

  it('cannot be framed, cannot load a plugin, and upgrades to https', () => {
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain('upgrade-insecure-requests');
  });

  it('allows the eval React needs in development, and nothing extra in production', () => {
    expect(contentSecurityPolicy({ nonce: 'x', dev: true })).toContain("'unsafe-eval'");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it('keeps the address of a page that is itself a secret out of Referer', () => {
    expect(carriesToken('/r/9f2c-token/step-3')).toBe(true);
    expect(carriesToken('/reset-password?token=abc')).toBe(true);
    expect(carriesToken('/accept-invite')).toBe(true);
    expect(carriesToken('/finance/requests')).toBe(false);
  });

  it('asks for https for two years, and turns off the hardware nothing uses', () => {
    const headers = Object.fromEntries(securityHeaders().map((h) => [h.key, h.value]));
    expect(headers['Strict-Transport-Security']).toBe('max-age=63072000; includeSubDomains');
    expect(headers['Permissions-Policy']).toContain('camera=()');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
  });
});

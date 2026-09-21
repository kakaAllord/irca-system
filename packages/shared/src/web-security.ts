/**
 * The headers a browser is given, for both web apps.
 *
 * They are here rather than in each app because the two must not drift: the
 * portal and the registration form are the same system to a visitor, and a
 * policy that is strict in one and loose in the other is only as good as the
 * loose one.
 *
 * The content policy is nonce-based: the proxy makes a fresh nonce for every
 * request, Next puts it on its own scripts and inline styles, and anything
 * else a browser is told to run is refused. `strict-dynamic` lets Next's own
 * bundles load the chunks they need without listing every file.
 */
export type CspOptions = {
  nonce: string;
  /** React uses eval in development for better stack traces; production does not. */
  dev?: boolean;
  /** Where the page may connect: the portal talks to its own origin only. */
  connect?: string[];
};

export function contentSecurityPolicy({ nonce, dev = false, connect = [] }: CspOptions): string {
  const sources = ["'self'", ...connect].join(' ');
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    // Styles are the one relaxation, and it is forced: a nonce covers a
    // <style> tag but never a style="..." attribute, and the bars on the usage
    // charts and the progress through the form are widths worked out as the
    // page is drawn. A browser that is given a style nonce ignores
    // 'unsafe-inline' entirely, so there is no half measure to take. Scripts,
    // where injection actually hurts, stay on the nonce.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    // next/font self-hosts the typeface, so no font service is needed.
    `font-src 'self'`,
    `connect-src ${sources}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `frame-src 'none'`,
    ...(dev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}

/**
 * The headers that do not change per request.
 *
 * HSTS is two years and covers subdomains: once a browser has seen it, that
 * name is https only. The permissions policy turns off the hardware nothing
 * here uses, so a page that is somehow made to ask for the camera is refused
 * by the browser rather than by the visitor.
 */
export function securityHeaders(): { key: string; value: string }[] {
  return [
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
    },
    // Belt and braces with frame-ancestors, for anything that predates CSP.
    { key: 'X-Frame-Options', value: 'DENY' },
  ];
}

/**
 * Pages whose address is itself the secret: a registration link, a password
 * reset, an invitation. The address must not travel in a Referer header to
 * anywhere, including to our own other pages.
 */
export const NO_REFERRER = { key: 'Referrer-Policy', value: 'no-referrer' };

/** True for a path whose URL carries a token. */
export function carriesToken(pathname: string): boolean {
  return (
    pathname.startsWith('/r/') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/accept-invite')
  );
}

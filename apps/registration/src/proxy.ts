import { NextResponse, type NextRequest } from 'next/server';
import { NO_REFERRER, carriesToken, contentSecurityPolicy } from '@irca/shared';

/**
 * Runs before every screen of the form.
 *
 * Its only job is the content policy: a fresh nonce per request, which Next
 * stamps on its own scripts and inline styles, so a browser refuses anything
 * else it is told to run. A registration link is a secret — anyone holding
 * /r/<token> can read and change those answers — so no screen under /r sends
 * a Referer header anywhere.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = contentSecurityPolicy({ nonce, dev: process.env.NODE_ENV === 'development' });

  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', csp);
  if (carriesToken(request.nextUrl.pathname)) {
    response.headers.set(NO_REFERRER.key, NO_REFERRER.value);
  }
  return response;
}

export const config = {
  // Not Next's own files or the images it optimises.
  matcher: ['/((?!_next/|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt)$).*)'],
};

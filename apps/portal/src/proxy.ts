import { NextResponse, type NextRequest } from 'next/server';

/** Pages anyone may open. Everything else needs to be signed in. */
const PUBLIC = ['/login', '/forgot-password', '/reset-password', '/accept-invite'];

/**
 * Runs before every page. Two jobs:
 *
 * 1. Someone with no session cookie at all is sent straight to sign-in, with
 *    the page they wanted remembered. This only saves a round trip for the
 *    obvious case: whether a cookie is still valid is the API's call, made by
 *    the signed-in layout.
 * 2. Every page is told which path it is rendering (x-irca-path), so a server
 *    component that finds the session expired can send the person back here
 *    after they sign in again.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const cookieName = process.env.SESSION_COOKIE_NAME ?? 'irca_session';
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!isPublic && !request.cookies.has(cookieName)) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', pathname + search);
    return NextResponse.redirect(login);
  }

  const headers = new Headers(request.headers);
  headers.set('x-irca-path', pathname + search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Not the API rewrite, Next's own files, or static assets.
  matcher: ['/((?!api/|_next/|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt)$).*)'],
};

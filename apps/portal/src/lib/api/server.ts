import 'server-only';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { readApiError } from './errors';

const API = () => {
  const url = process.env.API_INTERNAL_URL;
  if (!url)
    throw new Error('API_INTERNAL_URL is not set. Copy apps/portal/.env.example to .env.local.');
  return url;
};

/** The header proxy.ts sets, so a server component knows which page it is rendering. */
export const PATH_HEADER = 'x-irca-path';

type Options = RequestInit & {
  /**
   * What a 401 means for this call. 'redirect' (the default) sends the person
   * to sign in and back here afterwards; 'null' returns null instead, for pages
   * that work either way, such as the sign-in page itself.
   */
  onUnauthorized?: 'redirect' | 'null';
};

/**
 * Calls the API from the portal's server, as the signed-in person.
 *
 * Forwards the session cookie and the visitor's address, and never caches: every
 * answer here is about one person.
 */
export async function serverApi<T>(
  path: string,
  init: Options & { onUnauthorized: 'null' },
): Promise<T | null>;
export async function serverApi<T>(path: string, init?: Options): Promise<T>;
export async function serverApi<T>(path: string, init: Options = {}): Promise<T | null> {
  const { onUnauthorized = 'redirect', ...rest } = init;
  const jar = await cookies();
  const h = await headers();
  const name = process.env.SESSION_COOKIE_NAME ?? 'irca_session';
  const token = jar.get(name)?.value;

  const res = await fetch(`${API()}/v1${path}`, {
    ...rest,
    cache: 'no-store',
    headers: {
      ...rest.headers,
      ...(token ? { cookie: `${name}=${token}` } : {}),
      'x-irca-client': 'portal',
      'x-forwarded-for': h.get('x-forwarded-for') ?? '',
      ...(rest.body ? { 'content-type': 'application/json' } : {}),
    },
  });

  if (res.status === 401) {
    if (onUnauthorized === 'null') return null;
    const here = h.get(PATH_HEADER) ?? '/';
    redirect(`/login?next=${encodeURIComponent(here)}`);
  }
  if (!res.ok) throw await readApiError(res);
  return res.status === 204 ? null : ((await res.json()) as T);
}

'use client';

import { readApiError } from './errors';

/**
 * Calls the API from the browser. Requests go to /api on the portal's own
 * origin, which next.config.ts rewrites to the API, so the session cookie is
 * sent without any cross-origin setup. Throws ApiRequestError on failure.
 */
export async function clientApi<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init.method ?? 'GET',
    credentials: 'same-origin',
    headers: {
      'x-irca-client': 'portal',
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) throw await readApiError(res);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

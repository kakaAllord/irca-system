import 'server-only';
import { headers } from 'next/headers';
import type { Lang, Registration, Values } from '@irca/shared/registration';

/**
 * The same functions as `registration-db`, answered by the IRCA API instead of
 * by this app's own database.
 *
 * The key lives on this server and is never sent to a browser. The visitor's
 * address is forwarded, because the API's limits are per visitor and every
 * request here arrives from this server.
 */
const base = () => {
  const url = process.env.API_INTERNAL_URL;
  if (!url) throw new Error('API_INTERNAL_URL is not set, but REGISTRATION_BACKEND is api.');
  return `${url}/v1/public/registrations`;
};

type Dto = Omit<Registration, 'id' | 'createdAt' | 'updatedAt' | 'submittedAt'> & {
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
};

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const forwarded = (await headers()).get('x-forwarded-for') ?? '';
  const res = await fetch(`${base()}${path}`, {
    method: init.method ?? 'GET',
    cache: 'no-store',
    headers: {
      authorization: `Bearer ${process.env.REGISTRATION_API_KEY ?? ''}`,
      'x-irca-client': 'registration',
      ...(forwarded ? { 'x-forwarded-for': forwarded } : {}),
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (res.status === 404) return null as T;
  if (!res.ok) throw new Error(`The registration service answered ${res.status}.`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** Dates travel as strings; the app works in Dates, as it did with the pool. */
const toRegistration = (dto: Dto | null): Registration | null =>
  dto && {
    ...dto,
    // The API's id is a uuid; nothing in the app reads it except as an id.
    id: dto.token,
    createdAt: new Date(dto.createdAt),
    updatedAt: new Date(dto.updatedAt),
    submittedAt: dto.submittedAt ? new Date(dto.submittedAt) : null,
  };

export async function createRegistration(lang: Lang): Promise<Registration> {
  const dto = await call<Dto>('', { method: 'POST', body: { lang } });
  return toRegistration(dto)!;
}

export async function getByToken(token: string): Promise<Registration | null> {
  return toRegistration(await call<Dto | null>(`/${token}`));
}

export async function setLanguage(token: string, lang: Lang): Promise<void> {
  await call<void>(`/${token}/lang`, { method: 'PUT', body: { lang } });
}

export async function submit(token: string): Promise<Registration | null> {
  return toRegistration(await call<Dto | null>(`/${token}/submit`, { method: 'POST' }));
}

/** What the API answers a Continue with: a step id, or what is wrong. */
export type RemoteSaveResult = { ok: true; next: string } | { ok: false; error: string };

/**
 * One step, saved and checked by the API. The rules live there now, so this
 * does not validate first: one copy of the rules, one answer.
 */
export function saveStepRemote(
  token: string,
  stepId: string,
  draft: Partial<Values>,
): Promise<RemoteSaveResult> {
  return call<RemoteSaveResult>(`/${token}/steps/${stepId}`, { method: 'POST', body: { draft } });
}

/** Autosave. Never throws at the caller: a lost draft must not break a page. */
export async function saveDraftRemote(
  token: string,
  stepId: string,
  values: Partial<Values>,
): Promise<void> {
  await call<void>(`/${token}/draft`, { method: 'POST', body: { stepId, values } }).catch(
    () => undefined,
  );
}

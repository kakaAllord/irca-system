'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  EMPTY_VALUES, LANGS, screenIds, stepById, t, UI,
  type Lang, type Values,
} from './flow';
import { keysForStep, validateStep } from './validate';
import {
  createRegistration, getByToken, PhoneTakenError, saveValues, setLanguage, submit,
} from './registration';

const COOKIE = 'irca_token';

/** Screen 01. Creates the row, then hands out the URL that owns it. */
export async function startRegistration(formData: FormData) {
  const raw = String(formData.get('lang') ?? 'en');
  const lang: Lang = (LANGS as string[]).includes(raw) ? (raw as Lang) : 'en';

  const reg = await createRegistration(lang);

  // Same-device convenience only. The admin-sent link works without it, which
  // is the whole point of keying off the token instead.
  (await cookies()).set(COOKIE, reg.token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 90,
  });

  redirect(`/r/${reg.token}/heard`);
}

/**
 * Changing the language of a registration already under way.
 *
 * The language screen is reachable by walking back from the first question, and
 * someone who tapped the wrong one must be able to fix it. This updates the row
 * they already have rather than starting a second one, so nothing they have
 * answered is lost.
 */
export async function changeLanguage(formData: FormData) {
  const token = String(formData.get('token') ?? '');
  const raw = String(formData.get('lang') ?? '');
  const from = String(formData.get('from') ?? '');

  const reg = await getByToken(token);
  if (!reg) redirect('/');

  // Same reasoning as switchLanguage: an unrecognised value leaves the
  // registration on the language it already had.
  if ((LANGS as string[]).includes(raw)) await setLanguage(token, raw as Lang);

  // Back to the question they walked away from.
  const ids = screenIds(reg.values);
  const target = ids.includes(from) ? from : (ids[0] ?? 'done');
  redirect(`/r/${token}/${target}`);
}

/**
 * Change language without leaving the screen. The caller refreshes, so the
 * server re-renders the page it is already on in the new language.
 */
export async function switchLanguage(token: string, raw: string): Promise<void> {
  // An unrecognised value is ignored, not coerced. Falling back to English
  // here would quietly move someone off the language they chose because a
  // value failed to parse, which is worse than doing nothing.
  if (!(LANGS as string[]).includes(raw)) return;
  const reg = await getByToken(token);
  if (!reg) return;
  await setLanguage(token, raw as Lang);
}

export type SaveResult = { ok: true; next: string } | { ok: false; error: string };

/**
 * Persists one step and says where to go next. The next screen is computed from
 * the answers as they stand *after* this save, so ticking "join the church"
 * opens the membership path immediately rather than one step late.
 */
export async function saveStep(
  token: string,
  stepId: string,
  draft: Partial<Values>,
): Promise<SaveResult> {
  const reg = await getByToken(token);
  if (!reg) return { ok: false, error: 'Registration not found' };
  if (reg.status === 'submitted') return { ok: true, next: `/r/${token}/done` };

  const step = stepById(stepId);
  if (!step) return { ok: false, error: 'Unknown step' };

  // Take only the keys this step owns. Editing "phone" from the review screen
  // must not be able to blank out a neighbouring answer.
  const allowed = keysForStep(step);
  const patch: Partial<Values> = {};
  for (const k of allowed) {
    if (k in draft) (patch as Record<string, unknown>)[k] = draft[k];
  }

  const merged: Values = { ...reg.values, ...patch };

  const error = validateStep(step, merged, reg.lang);
  if (error) return { ok: false, error };

  const ids = screenIds(merged);
  const here = ids.indexOf(stepId);
  const next = ids[here + 1] ?? 'done';

  let saved;
  try {
    // The screen they are about to see, not the one they just finished: the
    // question someone abandons on is the one they were looking at.
    saved = await saveValues(token, patch, next, {
      merged,
      furthestSoFar: reg.furthestStep,
    });
  } catch (err) {
    if (err instanceof PhoneTakenError) {
      return { ok: false, error: t(UI.eTaken, reg.lang) };
    }
    throw err;
  }
  if (!saved) return { ok: false, error: 'Registration not found' };

  // The last question sends it in. There is no review screen to press send on
  // any more, so the check every required step used to get there happens here.
  if (next === 'done') {
    for (const id of ids) {
      const st = stepById(id);
      if (!st) continue;
      const error = validateStep(st, merged, reg.lang);
      if (error) return { ok: false, error };
    }
    await submit(token);
  }

  return { ok: true, next: `/r/${token}/${next}` };
}

/** The review screen's "Send it in". Re-checks every required step first. */
export async function submitRegistration(token: string): Promise<SaveResult> {
  const reg = await getByToken(token);
  if (!reg) return { ok: false, error: 'Registration not found' };
  if (reg.status === 'submitted') return { ok: true, next: `/r/${token}/done` };

  for (const id of screenIds(reg.values)) {
    const step = stepById(id);
    if (!step) continue;
    const error = validateStep(step, reg.values, reg.lang);
    if (error) return { ok: false, error };
  }

  await submit(token);
  return { ok: true, next: `/r/${token}/done` };
}

/** "Register someone else" — drop the cookie so the next person starts clean. */
export async function registerAnother() {
  (await cookies()).delete(COOKIE);
  redirect('/');
}

export async function currentToken(): Promise<string | null> {
  return (await cookies()).get(COOKIE)?.value ?? null;
}

export async function emptyValues(): Promise<Values> {
  return EMPTY_VALUES;
}

import { NextResponse } from 'next/server';
import { stepById, type Values } from '@irca/shared/registration';
import { keysForStep } from '@irca/shared/registration';
import { getByToken, saveValues } from '@/lib/registration';

/**
 * Autosave for a question in progress.
 *
 * Continue is what saves a *finished* answer. This is what catches the half of
 * one someone leaves behind when they put the phone down, get called into the
 * service, or close the tab. A visitor who typed their name and walked away
 * should still be in the office's list tomorrow.
 *
 * A route handler rather than a server action because it is called with
 * navigator.sendBeacon as the page goes away, and a beacon is a plain POST.
 *
 * Deliberately does not validate: a draft is partial by definition, and a phone
 * number with three digits in it so far is exactly the thing worth keeping.
 * Continue still runs the full rules before anyone moves on.
 */
export async function POST(req: Request) {
  let body: { token?: string; stepId?: string; values?: Partial<Values> };
  try {
    // sendBeacon with a string sends text/plain, so parse the text rather than
    // relying on req.json() and a content type we do not control.
    body = JSON.parse(await req.text());
  } catch {
    return new NextResponse('bad json', { status: 400 });
  }

  const { token, stepId, values } = body;
  if (typeof token !== 'string' || !/^[a-f0-9]{32}$/.test(token)) {
    return new NextResponse('bad token', { status: 400 });
  }

  const step = stepId ? stepById(stepId) : null;
  if (!step) return new NextResponse('unknown step', { status: 400 });
  if (!values || typeof values !== 'object') {
    return new NextResponse('no values', { status: 400 });
  }

  const reg = await getByToken(token);
  if (!reg) return new NextResponse('not found', { status: 404 });
  // Nothing to draft onto a registration already sent in.
  if (reg.status === 'submitted') return new NextResponse(null, { status: 204 });

  // Only the keys this step owns, exactly as the Continue path does, so a draft
  // cannot reach across and blank a neighbouring answer.
  const patch: Partial<Values> = {};
  for (const k of keysForStep(step)) {
    if (k in values) (patch as Record<string, unknown>)[k] = values[k];
  }
  if (!Object.keys(patch).length) return new NextResponse(null, { status: 204 });

  try {
    await saveValues(token, patch, stepId!, {
      merged: { ...reg.values, ...patch },
      furthestSoFar: reg.furthestStep,
    });
  } catch {
    // The commonest failure here is the once-per-number index, hit while
    // someone types a number another visitor already registered. Continue
    // surfaces that properly; a draft should not shout about it.
    return new NextResponse(null, { status: 204 });
  }

  return new NextResponse(null, { status: 204 });
}

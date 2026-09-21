'use client';

import { useEffect, useRef } from 'react';
import type { Values } from '@irca/shared/registration';

const ENDPOINT = '/api/draft';

/** Long enough that typing a name is one save, short enough to catch a pause. */
const IDLE_MS = 1200;

/**
 * Keeps the answer-in-progress on the server without waiting for Continue.
 *
 * Two halves, and the second is the one that matters:
 *
 *  1. A debounce, so typing a name costs one request rather than one per
 *     keystroke. With a couple of dozen visitors on a Sunday this is nowhere
 *     near any limit, but per-keystroke writes would still be silly.
 *
 *  2. A flush when the page goes away, via sendBeacon. This is the whole point:
 *     someone abandons a form on a phone by switching apps or locking the
 *     screen, and `beforeunload`/`unload` fire unreliably on mobile, never fire
 *     on an app switch, and disqualify the page from the back/forward cache.
 *     `visibilitychange` to hidden is the event that actually fires, with
 *     `pagehide` behind it for older browsers.
 */
export function useAutosave(token: string, stepId: string, values: Values) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // What the server was last told, so an unchanged step writes nothing.
  const lastSent = useRef<string | null>(null);
  // Read by the unload handlers, which must not close over a stale render.
  const latest = useRef({ token, stepId, values });
  latest.current = { token, stepId, values };

  const payload = () => JSON.stringify(latest.current);

  const flush = (beacon: boolean) => {
    const body = payload();
    if (body === lastSent.current) return;
    lastSent.current = body;

    if (beacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      // Fire and forget: the browser queues it and sends it even as the page
      // goes away. A fetch here would usually be cancelled.
      navigator.sendBeacon(ENDPOINT, body);
      return;
    }
    fetch(ENDPOINT, {
      method: 'POST',
      body,
      // keepalive lets it outlive the page too, for the non-beacon path.
      keepalive: true,
    }).catch(() => {
      // A dropped draft is not worth troubling anyone about; Continue will
      // write the answer properly, and the next keystroke retries.
      lastSent.current = null;
    });
  };

  // Debounced save while they are working.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(false), IDLE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, stepId, values]);

  // Flush on the way out.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush(true);
    };
    const onPageHide = () => flush(true);

    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Called when Continue takes over: the validated write makes a draft moot. */
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    lastSent.current = payload();
  };

  return { cancel };
}

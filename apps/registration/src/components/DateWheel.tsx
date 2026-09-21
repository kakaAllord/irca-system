'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UI, t, type Lang } from '@irca/shared/registration';
import { Calendar } from './icons';

/**
 * Date of birth, as three horizontal rails taken one at a time.
 *
 * Three departures from the usual date picker, all deliberate:
 *
 * 1. The rails run horizontally, full width. Every other wheel picker is a set
 *    of vertical columns squeezed side by side, which gives each one about a
 *    third of the screen and makes the targets small. Full-width rows give the
 *    day, month and year each the whole width, and a horizontal thumb swipe is
 *    the easiest gesture on a phone held one-handed.
 *
 * 2. One rail is open at a time. You set the day, lock it in, and it collapses
 *    to a line showing what you chose; the month rail takes its place, then the
 *    year. This is the accordion-checkout shape, and Material's own date picker
 *    does it for the year: making a choice closes the control it was made in.
 *    Three rails at once is three things to aim at on a phone; one is one.
 *
 *    The lock is an explicit tap rather than "whatever it settled on". A
 *    momentum rail comes to rest on values you were only scrolling past, so
 *    auto-advancing on settle would commit a date nobody chose. Every locked
 *    line keeps a Change on it, because a mis-flick on the day must not mean
 *    starting the whole date again.
 *
 * 3. The year rail is seeded from the age band they gave two screens earlier.
 *    Someone who said "19 to 35" opens on the year of a 27-year-old and can
 *    only roll within that band, so they are a few flicks from their answer
 *    instead of scrolling through a century. This is why we do not split the
 *    year into "19 / 20" and then digits: that is two extra interactions to
 *    arrive somewhere the age band already told us.
 *
 * The physics are CSS scroll-snap rather than a drag library, so it inherits
 * the platform's own momentum and rubber-banding. Settling is detected with a
 * debounced scroll handler, with `scrollend` used when the browser has it —
 * that event only became Baseline in late 2025 and these are not new phones.
 */

const TODAY = new Date();
const THIS_YEAR = TODAY.getFullYear();

/** Year range and opening position implied by the age band from the who step. */
export function yearRangeForAge(age: string): { min: number; max: number; start: number } {
  const from = (lo: number, hi: number, mid: number) => ({
    min: THIS_YEAR - hi,
    max: THIS_YEAR - lo,
    start: THIS_YEAR - mid,
  });
  switch (age) {
    // Old enough to be filling this in themselves, young enough to still be at school.
    case 'Under 18': return from(4, 17, 15);
    case '19–35': return from(19, 35, 27);
    case '36–44': return from(36, 44, 40);
    case '45+': return from(45, 100, 55);
    // No band given: open on a plausible adult and allow the lot.
    default: return from(4, 100, 30);
  }
}

const pad = (n: number) => String(n).padStart(2, '0');

function daysInMonth(month: number, year: number) {
  return new Date(year, month + 1, 0).getDate();
}

/** Which rail is open. 'set' is all three locked and the date folded away. */
type Stage = 'day' | 'month' | 'year' | 'set';

export default function DateWheel({
  value,
  age,
  lang,
  onChange,
}: {
  /** ISO yyyy-mm-dd, or '' when nothing is set yet. */
  value: string;
  age: string;
  lang: Lang;
  onChange: (iso: string) => void;
}) {
  const s = (txt: Parameters<typeof t>[0]) => t(txt, lang);
  const months = UI.months[lang];
  const range = useMemo(() => yearRangeForAge(age), [age]);

  const parsed = value ? value.split('-').map(Number) : null;
  const [open, setOpen] = useState(false);
  const [touched, setTouched] = useState(!!value);
  const [year, setYear] = useState(parsed ? parsed[0] : range.start);
  const [month, setMonth] = useState(parsed ? parsed[1] - 1 : 5);
  const [day, setDay] = useState(parsed ? parsed[2] : 15);
  const [stage, setStage] = useState<Stage>(parsed ? 'set' : 'day');

  const years = useMemo(() => {
    const out = [];
    for (let y = range.max; y >= range.min; y--) out.push(y);
    return out;
  }, [range]);

  // The day is chosen before the month, so the rail has to offer all 31 and
  // the month's own length is applied once it is known. February losing a day
  // shows up on the locked day line, which is directly above the month rail.
  const maxDay = daysInMonth(month, year);
  const days = useMemo(() => Array.from({ length: 31 }, (_, i) => i + 1), []);
  useEffect(() => {
    if (stage !== 'day' && day > maxDay) setDay(maxDay);
  }, [stage, maxDay, day]);

  // Published only once all three rails are locked in. Sending a date upward
  // while the day rail is still open would hand the screen a birthday nobody
  // has finished choosing, and the question that waits on it would open over
  // the top of the picker still being used.
  useEffect(() => {
    if (!touched || stage !== 'set') return;
    onChange(`${year}-${pad(month + 1)}-${pad(Math.min(day, maxDay))}`);
    // onChange is recreated each render by the parent; depending on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [touched, stage, year, month, day, maxDay]);

  const pick = <T,>(set: (v: T) => void) => (v: T) => { setTouched(true); set(v); };

  const shownDay = Math.min(day, stage === 'day' ? 31 : maxDay);

  // Reopening one rail leaves the ones after it to be confirmed again, which is
  // what makes "change the month" able to clamp the day it was hiding.
  const reopen = (to: Stage) => { setStage(to); setOpen(true); };

  if (!open) {
    return (
      <button type="button" className="dobset" onClick={() => setOpen(true)}>
        {touched ? (
          <>
            <span className="dobvalue">{shownDay} {months[month]} {year}</span>
            <span className="dobchange">{s(UI.dobChange)}</span>
          </>
        ) : (
          <>
            <span className="dobprompt">{s(UI.dobTrigger)}</span>
            <Calendar className="dobcake" size={19} />
          </>
        )}
      </button>
    );
  }

  return (
    <div className="wheels">
      {stage === 'day' ? (
        <OpenRail
          cta={s(UI.dobLock)}
          onLock={() => { setTouched(true); setStage('month'); }}
        >
          <Rail
            label={s(UI.dobDay)}
            items={days.map(d => ({ key: d, label: String(d) }))}
            value={shownDay}
            onPick={pick(setDay)}
          />
        </OpenRail>
      ) : (
        <Locked
          label={s(UI.dobDay)}
          value={String(shownDay)}
          change={s(UI.dobChange)}
          onChange={() => reopen('day')}
        />
      )}

      {stage === 'month' ? (
        <OpenRail
          cta={s(UI.dobLock)}
          onLock={() => { setTouched(true); setStage('year'); }}
        >
          <Rail
            label={s(UI.dobMonth)}
            items={months.map((m, i) => ({ key: i, label: m }))}
            value={month}
            onPick={pick(setMonth)}
            wide
          />
        </OpenRail>
      ) : stage === 'year' || stage === 'set' ? (
        <Locked
          label={s(UI.dobMonth)}
          value={months[month]}
          change={s(UI.dobChange)}
          onChange={() => reopen('month')}
        />
      ) : null}

      {stage === 'year' ? (
        <OpenRail
          cta={s(UI.dobDone)}
          onLock={() => { setTouched(true); setStage('set'); setOpen(false); }}
        >
          <Rail
            label={s(UI.dobYear)}
            items={years.map(y => ({ key: y, label: String(y) }))}
            value={year}
            onPick={pick(setYear)}
          />
        </OpenRail>
      ) : stage === 'set' ? (
        <Locked
          label={s(UI.dobYear)}
          value={String(year)}
          change={s(UI.dobChange)}
          onChange={() => reopen('year')}
        />
      ) : null}

      {stage === 'set' && (
        <button type="button" className="dobdone" onClick={() => setOpen(false)}>
          {s(UI.dobDone)}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

/** The open rail, with the button that locks it in and opens the next. */
function OpenRail({
  cta, onLock, children,
}: {
  cta: string;
  onLock: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="dobstage">
      {children}
      <button type="button" className="doblock" onClick={onLock}>
        {cta}
      </button>
    </div>
  );
}

/** A part already settled: what they chose, and a way back to it. */
function Locked({
  label, value, change, onChange,
}: { label: string; value: string; change: string; onChange: () => void }) {
  return (
    <div className="dobpicked">
      <span className="dpl">{label}</span>
      <span className="dpv">{value}</span>
      <button type="button" className="dpc" onClick={onChange}>{change}</button>
    </div>
  );
}

type Item = { key: number; label: string };

function Rail({
  label, items, value, onPick, wide,
}: {
  label: string;
  items: Item[];
  value: number;
  onPick: (v: number) => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const settling = useRef<ReturnType<typeof setTimeout> | null>(null);
  // While we are scrolling the rail ourselves, ignore the scroll events it
  // emits — otherwise the handler fights the programmatic scroll.
  const silent = useRef(false);

  const centre = useCallback((behavior: ScrollBehavior) => {
    const el = ref.current;
    if (!el) return;
    const i = items.findIndex(it => it.key === value);
    const child = el.children[i] as HTMLElement | undefined;
    if (!child) return;
    const left = child.offsetLeft - (el.clientWidth - child.clientWidth) / 2;
    silent.current = true;
    el.scrollTo({ left, behavior });
    setTimeout(() => { silent.current = false; }, behavior === 'smooth' ? 420 : 60);
  }, [items, value]);

  // Open on the current value without animating into place.
  useEffect(() => { centre('auto'); /* eslint-disable-next-line */ }, []);

  // Bring the value back under the well when it changes from anywhere other
  // than a scroll that has already settled there.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const i = items.findIndex(it => it.key === value);
    const child = el.children[i] as HTMLElement | undefined;
    if (!child) return;
    const offBy = Math.abs(
      child.offsetLeft + child.clientWidth / 2 - (el.scrollLeft + el.clientWidth / 2),
    );
    if (offBy > 2) centre('smooth');
  }, [value, items, centre]);

  const read = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const mid = el.scrollLeft + el.clientWidth / 2;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < el.children.length; i++) {
      const c = el.children[i] as HTMLElement;
      const d = Math.abs(c.offsetLeft + c.clientWidth / 2 - mid);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    const picked = items[best];
    if (picked && picked.key !== value) onPick(picked.key);
  }, [items, value, onPick]);

  const onScroll = () => {
    if (silent.current) return;
    if (settling.current) clearTimeout(settling.current);
    // 90ms of stillness means the flick is over. `scrollend` fires sooner where
    // it exists, but it is too new to depend on.
    settling.current = setTimeout(read, 90);
  };

  useEffect(() => {
    const el = ref.current;
    if (!el || !('onscrollend' in el)) return;
    const h = () => { if (!silent.current) read(); };
    el.addEventListener('scrollend', h);
    return () => el.removeEventListener('scrollend', h);
  }, [read]);

  const step = (dir: number) => {
    const i = items.findIndex(it => it.key === value);
    const next = items[Math.min(items.length - 1, Math.max(0, i + dir))];
    if (next) onPick(next.key);
  };

  return (
    <div className="rail">
      <div className="raillabel">{label}</div>
      <div className="railbox">
        <div className="railwell" aria-hidden />
        <div
          className={`railtrack${wide ? ' wide' : ''}`}
          ref={ref}
          onScroll={onScroll}
          role="listbox"
          aria-label={label}
          tabIndex={0}
          onKeyDown={e => {
            if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
            if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
          }}
        >
          {items.map(it => (
            <button
              key={it.key}
              type="button"
              role="option"
              aria-selected={it.key === value}
              className={`railitem${it.key === value ? ' on' : ''}`}
              onClick={() => onPick(it.key)}
              tabIndex={-1}
            >
              {it.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

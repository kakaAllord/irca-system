'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Sheet from './Sheet';
import { DIAL_CODES, DIAL_BY_CC } from '@/lib/dialCodes';
import { UI, t, type Lang } from '@/lib/flow';
import { ChevronDown } from './icons';

/**
 * Country and dial code.
 *
 * A native <select> cannot show a flag — options render as plain text, and flag
 * emoji have no font on Windows, so the office's desktop would see "TZ" where a
 * phone sees a flag. It is also a poor way to get through 245 options. So this
 * is a sheet with a search box and real SVG flags (a few hundred bytes each,
 * served from /flags and only fetched for rows actually on screen).
 */

export function Flag({ cc, className }: { cc: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/flags/${cc}.svg`}
      alt=""
      width={24}
      height={16}
      loading="lazy"
      decoding="async"
      className={className ?? 'flag'}
    />
  );
}

export default function CountryPicker({
  cc,
  lang,
  onPick,
}: {
  cc: string;
  lang: Lang;
  onPick: (cc: string, dial: string) => void;
}) {
  const s = (txt: Parameters<typeof t>[0]) => t(txt, lang);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const current = DIAL_BY_CC[cc] ?? DIAL_BY_CC.TZ;

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return DIAL_CODES;
    // Match the country name, the dial code with or without its +, and the
    // ISO code, so "255", "+255", "tz" and "tanz" all find Tanzania.
    return DIAL_CODES.filter(
      d =>
        d.name.toLowerCase().includes(needle) ||
        d.dial.includes(needle) ||
        d.dial.slice(1).startsWith(needle.replace(/^\+/, '')) ||
        d.cc.toLowerCase() === needle,
    );
  }, [q]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="dialbtn"
        onClick={() => { setQ(''); setOpen(true); }}
        aria-label={s(UI.pickCountry)}
      >
        <Flag cc={current.cc} />
        <span className="dialcode">{current.dial}</span>
        <ChevronDown className="dialcaret" size={14} />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} label={s(UI.pickCountry)}>
        <div className="sheethead">
          <div className="sheetgrip" aria-hidden />
          <input
            ref={searchRef}
            className="input"
            value={q}
            placeholder={s(UI.searchCountry)}
            onChange={e => setQ(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="sheetlist">
          {matches.map(d => (
            <button
              key={d.cc}
              type="button"
              className={`countryrow${d.cc === cc ? ' on' : ''}`}
              onClick={() => { onPick(d.cc, d.dial); setOpen(false); }}
            >
              <Flag cc={d.cc} />
              <span className="cname">{d.name}</span>
              <span className="cdial">{d.dial}</span>
            </button>
          ))}
          {!matches.length && <div className="nomatch">{s(UI.noMatch)}</div>}
        </div>
      </Sheet>
    </>
  );
}

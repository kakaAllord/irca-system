'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { UI, t, type Lang } from '@irca/shared/registration';
import { switchLanguage } from '@/lib/actions';
import Sheet from './Sheet';
import { ArrowRight, Check } from './icons';

const CHOICES: { code: Lang; label: string; note: string }[] = [
  { code: 'en', label: 'English', note: 'We will continue in English' },
  { code: 'sw', label: 'Kiswahili', note: 'Tutaendelea kwa Kiswahili' },
  { code: 'fr', label: 'Français', note: 'Nous continuerons en français' },
];

const SHORT: Record<Lang, string> = { en: 'EN', sw: 'SW', fr: 'FR' };

/**
 * Change language from anywhere in the flow.
 *
 * The design hides the other two languages once one is chosen, and that is
 * right for the body of the screen. But someone who tapped the wrong one on the
 * first screen should not have to walk back to fix it, so the control lives in
 * the header where it is always in reach and never in the way.
 *
 * Switching refreshes the current screen rather than navigating: the server
 * re-renders it in the new language, while anything half-typed into the
 * question survives, because the step's draft lives in client state.
 */
export default function LanguageSwitch({ token, lang }: { token: string; lang: Lang }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const s = (txt: Parameters<typeof t>[0]) => t(txt, lang);

  const pick = (next: Lang) => {
    setOpen(false);
    if (next === lang) return;
    start(async () => {
      await switchLanguage(token, next);
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        className="langbtn"
        onClick={() => setOpen(true)}
        aria-label={s(UI.changeLangH)}
        disabled={pending}
      >
        <Globe />
        <span>{SHORT[lang]}</span>
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} label={s(UI.changeLangH)}>
        <div className="sheethead">
          <div className="sheetgrip" aria-hidden />
          <div className="sheettitle">{s(UI.changeLangH)}</div>
          <div className="sheetnote">{s(UI.changeLangSub)}</div>
        </div>
        <div className="sheetlist">
          {CHOICES.map(c => (
            <button
              key={c.code}
              type="button"
              className={`langrow${c.code === lang ? ' on' : ''}`}
              onClick={() => pick(c.code)}
            >
              <strong>
                {c.label}
                <small>{c.note}</small>
              </strong>
              <span className="arrow">
                {c.code === lang ? <Check size={17} /> : <ArrowRight size={17} />}
              </span>
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}

function Globe() {
  // Inline rather than an emoji: the globe emoji is another font dependency,
  // and this is two paths.
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden focusable="false">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

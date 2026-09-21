import Link from 'next/link';
import LanguageSwitch from './LanguageSwitch';
import type { Lang } from '@irca/shared/registration';
import { ArrowLeft } from './icons';

/**
 * The app shell. A plain responsive column: the flow fills whatever screen it
 * is on, with a comfortable reading measure on a laptop and nothing pretending
 * to be a handset around it.
 */
export function Device({ children }: { children: React.ReactNode }) {
  return (
    <div className="app">
      <div className="sheetcol">{children}</div>
    </div>
  );
}

/** Just the language switch, for screens with no progress bar. */
export function LangBar({ token, lang }: { token: string; lang: Lang }) {
  return (
    <div className="topbar bare">
      <LanguageSwitch token={token} lang={lang} />
    </div>
  );
}

/**
 * Back arrow, progress, and the language switch.
 *
 * No "6 / 16" counter: seeing how many questions are left is discouraging
 * before you have started. The bar still shows movement, which is the
 * reassuring half of the same information.
 */
export function TopBar({
  backHref,
  pct,
  token,
  lang,
}: {
  backHref?: string;
  pct: number;
  /** Omitted on screens with no registration behind them yet. */
  token?: string;
  lang?: Lang;
}) {
  return (
    <div className="topbar">
      {backHref ? (
        <Link href={backHref} className="back" aria-label="Back">
          <ArrowLeft size={18} />
        </Link>
      ) : (
        <span className="back ghost" aria-hidden><ArrowLeft size={18} /></span>
      )}
      <div
        className="track"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div style={{ width: `${pct}%` }} />
      </div>
      {token && lang && <LanguageSwitch token={token} lang={lang} />}
    </div>
  );
}

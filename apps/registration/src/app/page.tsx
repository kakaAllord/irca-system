import { redirect } from 'next/navigation';
import { Device, TopBar } from '@/components/Device';
import { Logo } from '@/components/Logo';
import { changeLanguage, startRegistration, currentToken } from '@/lib/actions';
import { getByToken } from '@/lib/registration';
import { FIRST_STEP, UI, t, type Lang } from '@irca/shared/registration';
import { ArrowRight, Check } from '@/components/icons';

const CHOICES: { code: Lang; label: string; note: string }[] = [
  { code: 'en', label: 'English', note: 'We will continue in English' },
  { code: 'sw', label: 'Kiswahili', note: 'Tutaendelea kwa Kiswahili' },
  { code: 'fr', label: 'Français', note: 'Nous continuerons en français' },
];

/**
 * Screen 01, in two modes.
 *
 * Arrived at fresh it starts a registration. Reached by walking back from the
 * first question (`?change=<token>`) it changes the language of the one already
 * under way instead: someone who tapped the wrong language has to be able to
 * fix it, and must not lose their answers to a second row in the process.
 */
export default async function LanguagePage({
  searchParams,
}: {
  searchParams: Promise<{ change?: string; from?: string }>;
}) {
  const { change, from } = await searchParams;

  if (change) {
    const reg = await getByToken(change);
    if (reg && reg.status === 'in_progress') {
      const s = (txt: Parameters<typeof t>[0]) => t(txt, reg.lang);
      return (
        <Device>
          <TopBar backHref={`/r/${reg.token}/${from || FIRST_STEP}`} pct={0} />
          <div className="screen">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <Logo size={96} />
              </div>
              <h1 className="q">{s(UI.changeLangH)}</h1>
              <p className="sub">{s(UI.changeLangSub)}</p>

              {CHOICES.map(c => (
                <form action={changeLanguage} key={c.code}>
                  <input type="hidden" name="token" value={reg.token} />
                  <input type="hidden" name="from" value={from ?? ''} />
                  <input type="hidden" name="lang" value={c.code} />
                  <button
                    type="submit"
                    className={`langrow${reg.lang === c.code ? ' on' : ''}`}
                  >
                    <strong>
                      {c.label}
                      <small>{c.note}</small>
                    </strong>
                    <span className="arrow">
                {reg.lang === c.code ? <Check size={17} /> : <ArrowRight size={17} />}
              </span>
                  </button>
                </form>
              ))}
            </div>
          </div>
        </Device>
      );
    }
    // A token that is finished or unknown: fall through and start fresh.
  }

  // Someone who walked away mid-flow on this device gets picked back up rather
  // than made to start over.
  const token = await currentToken();
  if (token) {
    const reg = await getByToken(token);
    if (reg && reg.status === 'in_progress') redirect(`/r/${reg.token}`);
  }

  return (
    <Device>
      <div className="screen">
        <div style={{ paddingTop: 46, display: 'flex', flexDirection: 'column', gap: 15 }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Logo size={128} />
          </div>
          <h1 className="q big" style={{ fontSize: 29, letterSpacing: '-0.5px' }}>
            Karibu IRCA
          </h1>
          <p style={{ margin: 0, font: '16px/1.55 var(--font)', color: 'var(--body)' }}>
            We would love to know who worshipped with us today. Just a short chat, most taps
            very little typing.
          </p>

          {CHOICES.map(c => (
            <form action={startRegistration} key={c.code}>
              <input type="hidden" name="lang" value={c.code} />
              <button type="submit" className="langrow">
                <strong>
                  {c.label}
                  <small>{c.note}</small>
                </strong>
                <span className="arrow"><ArrowRight size={17} /></span>
              </button>
            </form>
          ))}
        </div>
      </div>
    </Device>
  );
}

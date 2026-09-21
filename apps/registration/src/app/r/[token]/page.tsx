import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Device, LangBar } from '@/components/Device';
import { Logo } from '@/components/Logo';
import { UI, applicableSteps, fill, t } from '@/lib/flow';
import { getByToken } from '@/lib/registration';
import { isAnswered } from '@/lib/validate';
import { Check } from '@/components/icons';

/**
 * Design screen 25 — what an admin-sent link opens on.
 *
 * The whole screen exists to answer one question before asking anything:
 * how much is left? So it names them, counts what remains, and the button
 * drops them at the first unanswered question rather than back at the start.
 */
export default async function ResumePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const reg = await getByToken(token);
  if (!reg) notFound();
  if (reg.status === 'submitted') redirect(`/r/${token}/done`);

  const s = (txt: Parameters<typeof t>[0]) => t(txt, reg.lang);
  const steps = applicableSteps(reg.values);

  // Answered, not merely non-blocking — an optional step they never reached is
  // still outstanding. Same helper the office list uses, so the count they see
  // and the count on this screen can never disagree.
  const outstanding = steps.filter(st => !isAnswered(st, reg.values, reg.lang));
  const resumeAt = outstanding[0]?.id ?? steps[steps.length - 1]?.id ?? 'done';

  // Someone who has not answered anything yet has no progress worth reporting;
  // send them straight into the flow rather than showing an empty welcome-back.
  if (!outstanding.length || outstanding.length === steps.length) {
    redirect(`/r/${token}/${resumeAt}`);
  }

  const doneCount = steps.length - outstanding.length;
  const pct = Math.round((doneCount / steps.length) * 100);

  const stoppedName = steps.find(st => st.id === resumeAt);

  // The checklist: the last couple of things behind them, then where they are.
  const behind = steps.filter(st => isAnswered(st, reg.values, reg.lang)).slice(-2);

  return (
    <Device>
      <LangBar token={token} lang={reg.lang} />
      <div className="screen">
        <div style={{ paddingTop: 4, display: 'flex', flexDirection: 'column', gap: 15 }}>
          <Logo size={96} />
          <h1 className="q big">{fill(s(UI.backH), reg.values)}</h1>
          <p style={{ margin: 0, font: '16px/1.55 var(--font)', color: 'var(--body)' }}>
            {s(UI.backSub)}
          </p>

          <div className="resumecard">
            <div className="head">
              <strong>
                {s(UI.backLeft)
                  .replace('{n}', String(outstanding.length))
                  .replace('{total}', String(steps.length))}
              </strong>
              <span>{pct}%</span>
            </div>
            <div className="bar">
              <div style={{ width: `${pct}%` }} />
            </div>
            <div className="where">
              {s(UI.backStopped).replace('{step}', s(stoppedName?.short))}
            </div>
          </div>

          <div className="checklist">
            {behind.map(st => (
              <div className="item" key={st.id}>
                <span className="pip"><Check size={13} /></span>
                <span className="t">{s(st.short)}</span>
              </div>
            ))}
            <div className="item todo">
              <span className="pip">{outstanding.length}</span>
              <span className="t">{s(stoppedName?.short)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="footer">
        <Link href={`/r/${token}/${resumeAt}`} className="cta">
          {s(UI.backCta)}
        </Link>
        <div className="footnote">
          <span>{s(UI.backNote)}</span>
        </div>
      </div>
    </Device>
  );
}

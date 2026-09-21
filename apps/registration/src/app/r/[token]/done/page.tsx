import { notFound } from 'next/navigation';
import { Device, LangBar } from '@/components/Device';
import { UI, fill, firstName, t } from '@irca/shared/registration';
import { getByToken } from '@/lib/registration';
import { registerAnother } from '@/lib/actions';
import { Check } from '@/components/icons';

// The two people a new visitor is most likely to want. Move to a `pastors`
// table when the office wants to edit this without a deploy.
//
// `tel` is E.164, no spaces, because that is what a dialler expects from a
// tel: link. `display` is the same number spaced for reading.
const PASTORS = [
  {
    name: 'Pastor Ndelimbi Ndosi',
    role: { en: 'Senior pastor', sw: 'Mchungaji kiongozi', fr: 'Pasteur principal' },
    tel: '+255762564156',
    display: '+255 762 564 156',
  },
  {
    name: 'Pastor Sarah Ndosi',
    role: { en: 'Senior pastor', sw: 'Mchungaji kiongozi', fr: 'Pasteur principal' },
    tel: '+255656521114',
    display: '+255 656 521 114',
  },
];

export default async function DonePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const reg = await getByToken(token);
  if (!reg) notFound();

  const s = (txt: Parameters<typeof t>[0]) => t(txt, reg.lang);
  const name = firstName(reg.values);

  return (
    <Device>
      <LangBar token={token} lang={reg.lang} />
      <div className="screen">
        <div style={{ paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 15 }}>
          <div className="tickmark"><Check size={30} /></div>
          <h1 className="q big">
            {name ? fill(s(UI.doneTitle), reg.values) : s(UI.doneTitleNo)}
          </h1>
          <p style={{ margin: 0, font: '16px/1.55 var(--font)', color: 'var(--body)' }}>
            {s(UI.doneBody)}
          </p>

          <div className="panel">
            <div className="cap">{s(UI.pastors)}</div>
            {PASTORS.map(p => (
              <div className="person" key={p.tel}>
                <div>
                  <div className="name">{p.name}</div>
                  {/* The number is shown, not just linked: someone on a shared
                      phone, or who would rather write it down, should not have
                      to tap to find out what it is. */}
                  <div className="role">{p.role[reg.lang]}</div>
                  <div className="tel">{p.display}</div>
                </div>
                {/* A tel: link is the shortest path to the number being saved:
                    the phone's own dialler offers "add to contacts" from here. */}
                <a href={`tel:${p.tel}`}>{s(UI.saveNumber)}</a>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="footer">
        <form action={registerAnother}>
          <button type="submit" className="cta ghost">
            {s(UI.another)}
          </button>
        </form>
      </div>
    </Device>
  );
}

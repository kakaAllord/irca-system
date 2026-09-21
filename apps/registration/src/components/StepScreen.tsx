'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  REGIONS, UI, WARDS, faithQuestions, fill, formatDob, labelOf, screenIds, stepById, t,
  type FaithQ, type Lang, type Opt, type Step, type Txt, type Values,
} from '@/lib/flow';
import { checkPhone, validateStep } from '@/lib/validate';
import { saveStep } from '@/lib/actions';
import { useAutosave } from '@/hooks/useAutosave';
import { TopBar } from './Device';
import CountryPicker from './CountryPicker';
import { DIAL_BY_CC } from '@/lib/dialCodes';
import DateWheel from './DateWheel';
import { ArrowRight, Check, ChevronDown, Lock, Minus, Plus } from './icons';

type Props = {
  token: string;
  stepId: string;
  lang: Lang;
  values: Values;
  backHref?: string;
  pct: number;
};

/**
 * One question, one screen. Local state so taps feel instant; the answer goes
 * to the database on Continue, which is what lets every screen honestly say
 * "Saved, you can come back".
 */
export default function StepScreen(props: Props) {
  const { token, stepId, lang, backHref, pct } = props;
  const step = stepById(stepId)!;
  const router = useRouter();
  const [v, setV] = useState<Values>(props.values);
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  const s = (txt: Parameters<typeof t>[0]) => t(txt, lang);
  const set = <K extends keyof Values>(k: K, val: Values[K]) => {
    setV(prev => ({ ...prev, [k]: val }));
    setErr('');
  };
  const setMany = (patch: Partial<Values>) => {
    setV(prev => ({ ...prev, ...patch }));
    setErr('');
  };
  const toggle = (
    k: 'heard' | 'visit' | 'interest' | 'ministries',
    val: string,
    exclusive?: string,
  ) => {
    setV(prev => {
      const arr = prev[k];
      const next = arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];
      const none = exclusive ?? step.exclusive;
      return {
        ...prev,
        [k]: !none ? next
          : val === none ? next.filter(x => x === none)
          : next.filter(x => x !== none),
      };
    });
    setErr('');
  };

  // Keeps whatever they have typed so far, even if they never press Continue.
  const { cancel: cancelDraft } = useAutosave(token, stepId, v);

  const blocked = validateStep(step, v, lang) !== '';

  const onContinue = () => {
    const local = validateStep(step, v, lang);
    if (local) return setErr(local);
    // The validated write supersedes any draft still pending.
    cancelDraft();
    start(async () => {
      const r = await saveStep(token, stepId, v);
      if (r.ok) router.push(r.next);
      else setErr(r.error);
    });
  };

  const ids = screenIds(v);
  const isLast = ids[ids.indexOf(stepId) + 1] === 'done';


  return (
    <>
      <TopBar backHref={backHref} pct={pct} token={token} lang={lang} />

      <div className="screen">
        {step.ack && (
          <div className="ack">
            <span className="text">{fill(s(step.ack), v)}</span>
          </div>
        )}

        <h1 className="q">{fill(s(step.q), v)}</h1>
        {step.sub && <p className="sub">{s(step.sub)}</p>}

        <Body step={step} v={v} set={set} setMany={setMany} toggle={toggle} lang={lang} err={err} />
      </div>

      <div className="footer">
        {err && (
          <div className="err" role="alert">
            <span className="bang">!</span>
            {err}
          </div>
        )}
        <button
          type="button"
          className={`cta${blocked ? ' off' : ''}`}
          onClick={onContinue}
          disabled={pending}
        >
          {isLast ? s(UI.finish) : <>{s(UI.cont)}<ArrowRight size={18} /></>}
        </button>
        <div className="footnote">
          <span>{s(UI.saved)}</span>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

type BodyProps = {
  step: Step;
  v: Values;
  lang: Lang;
  err: string;
  set: <K extends keyof Values>(k: K, val: Values[K]) => void;
  setMany: (patch: Partial<Values>) => void;
  toggle: (
    k: 'heard' | 'visit' | 'interest' | 'ministries',
    val: string,
    exclusive?: string,
  ) => void;
};

function Body({ step, v, lang, err, set, setMany, toggle }: BodyProps) {
  const s = (txt: Parameters<typeof t>[0]) => t(txt, lang);

  switch (step.type) {
    case 'pick': {
      const key = step.key as 'heard' | 'visit' | 'interest';
      const chosen = v[key];
      const otherOpen = step.other && chosen.includes('Other');
      const followOpen = step.follow && chosen.includes(step.follow.on);
      return (
        <>
          <ChipWrap
            opts={step.opts!}
            chosen={chosen}
            lang={lang}
            onPick={val => toggle(key, val)}
            hint={s(UI.pickAny)}
          />
          {otherOpen && (
            <input
              className="input"
              autoFocus
              value={String(v[step.other!])}
              placeholder={s(step.otherPh)}
              onChange={e => set(step.other!, e.target.value as never)}
            />
          )}
          {followOpen && (
            <div className="field reveal">
              <label>{s(step.follow!.label)}</label>
              <input
                className="input"
                value={String(v[step.follow!.key])}
                placeholder={s(step.follow!.ph)}
                onChange={e => set(step.follow!.key, e.target.value as never)}
              />
            </div>
          )}
        </>
      );
    }

    case 'text':
      return (
        <input
          className={`input${err ? ' bad' : ''}`}
          autoFocus
          value={String(v[step.key!])}
          placeholder={s(step.ph)}
          onChange={e => set(step.key!, e.target.value as never)}
        />
      );

    case 'area':
      return (
        <>
          <textarea
            className="input"
            value={String(v[step.key!])}
            placeholder={s(step.ph)}
            onChange={e => set(step.key!, e.target.value as never)}
          />
          {step.note && (
            <div className="note">
              <Lock size={16} />
              <span>{s(step.note)}</span>
            </div>
          )}
        </>
      );

    case 'who':
      return <Who v={v} set={set} setMany={setMany} lang={lang} err={err} />;

    case 'closing':
      return <Closing step={step} v={v} set={set} setMany={setMany} toggle={toggle} lang={lang} />;

    case 'intent':
      return <Intent step={step} v={v} set={set} toggle={toggle} lang={lang} />;

    // The follow-up to the study-or-work tap on the "about you" screen, on the
    // membership path only. Which half it shows is decided by the answer they
    // gave back there, so nobody is asked for both.
    case 'occDetail':
      return v.occ === 'Student' ? (
        <div className="field">
          <label>{s(UI.lblStudy)}</label>
          <input className="input" autoFocus value={v.school} placeholder={s(UI.phSchool)}
            onChange={e => set('school', e.target.value)} />
          <input className="input" value={v.course} placeholder={s(UI.phCourse)}
            onChange={e => set('course', e.target.value)} />
          <input className="input" value={v.year} placeholder={s(UI.phYear)}
            onChange={e => set('year', e.target.value)} />
        </div>
      ) : (
        <div className="field">
          <label>{s(UI.lblWorkQ)}</label>
          <input className="input" autoFocus value={v.profession} placeholder={s(UI.phWork)}
            onChange={e => set('profession', e.target.value)} />
          <div className="hint">{s(UI.workHint)}</div>
        </div>
      );

    // The walk-with-God screen asks one thing at a time: the next question only
    // appears once the one above it has an answer, and someone who is not yet
    // born again is never asked about their baptism.
    case 'faith':
      return <Faith v={v} set={set} lang={lang} />;

    case 'family':
      return <Family v={v} set={set} lang={lang} />;

    case 'serve':
      return (
        <>
          <ChipWrap
            opts={step.opts!}
            chosen={v.ministries}
            lang={lang}
            onPick={val => toggle('ministries', val)}
            hint={s(UI.pickAny)}
          />
          <input
            className="input"
            value={v.otherMinistry}
            placeholder={s(UI.phMinistry)}
            onChange={e => set('otherMinistry', e.target.value)}
          />
        </>
      );

    default:
      return null;
  }
}

// --- one question open at a time -------------------------------------------

/**
 * The shape every multi-question screen in this flow now takes.
 *
 * A screen carrying five questions with all their options on show is a wall,
 * and a wall is what makes someone put the phone down. So a question shows its
 * options only while it is the one being answered; answer it and it folds to
 * its own name with the answer beside it, and the next unanswered question
 * opens in its place. The screen stays about as long as one question however
 * many it is holding, and nothing is hidden — every folded row reopens on a tap.
 */
type Fold = {
  key: string;
  label: string;
  /** Shown in the pill when folded. Empty means show a tick instead. */
  badge?: string;
  /** Whether it counts as answered, for the tick and for what opens next. */
  done: boolean;
  body: React.ReactNode;
};

function Folds({
  folds, open, onOpen,
}: {
  folds: Fold[];
  /** One key, or several while a screen is still showing more than one. */
  open: string | string[] | null;
  onOpen: (k: string | null) => void;
}) {
  const isOpen = (k: string) => (Array.isArray(open) ? open.includes(k) : open === k);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {folds.map(f => (
        <Folding
          key={f.key}
          label={f.label}
          answer={f.badge ?? ''}
          done={f.done}
          open={isOpen(f.key)}
          onToggle={() => onOpen(f.key)}
        >
          {f.body}
        </Folding>
      ))}
    </div>
  );
}

/** A question that folds to its name and its answer once it has one. */
function Folding({
  label, answer, done, open, onToggle, children,
}: {
  label: string;
  answer: string;
  done?: boolean;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const id = useId();
  if (open) {
    return (
      <div className="field">
        <label id={id}>{label}</label>
        <div className="foldbody" role="group" aria-labelledby={id}>{children}</div>
      </div>
    );
  }
  return (
    <button type="button" className="fold" aria-expanded={false} onClick={onToggle}>
      <span className="t">{label}</span>
      {answer ? <span className="badge">{answer}</span>
        : done ? <span className="tick"><Check size={14} /></span> : null}
      <ChevronDown className="chev" size={15} />
    </button>
  );
}

/** Filter chips: options that wrap to their own width, not a column of boxes. */
function ChipWrap({
  opts, chosen, lang, onPick, hint,
}: {
  opts: Opt[];
  chosen: string[];
  lang: Lang;
  onPick: (val: string) => void;
  /** "Select all that apply", for the questions that take more than one. */
  hint?: string;
}) {
  return (
    <>
      <div className="chipwrap">
        {opts.map(o => (
          <button
            key={o.val}
            type="button"
            className={`chip${chosen.includes(o.val) ? ' on' : ''}`}
            aria-pressed={chosen.includes(o.val)}
            onClick={() => onPick(o.val)}
          >
            {t(o.label, lang)}
          </button>
        ))}
      </div>
      {hint && <div className="hint">{hint}</div>}
    </>
  );
}

/** A yes/no question as chips, stored as a boolean. */
function YesNoChips({
  value, lang, no, onPick,
}: {
  value: boolean | null;
  lang: Lang;
  no: Txt;
  onPick: (b: boolean) => void;
}) {
  return (
    <ChipWrap
      opts={[{ val: 'yes', label: UI.yes }, { val: 'no', label: no }]}
      chosen={value === true ? ['yes'] : value === false ? ['no'] : []}
      lang={lang}
      onPick={x => onPick(x === 'yes')}
    />
  );
}

const ynBadge = (b: boolean | null, lang: Lang, no: Txt) =>
  b === true ? t(UI.yes, lang) : b === false ? t(no, lang) : '';

// --- about you -------------------------------------------------------------

type Choice = { key: 'gender' | 'age' | 'occ'; label: Txt; opts: Opt[] };

const CHOICES: Choice[] = [
  { key: 'gender', label: UI.lblGender, opts: [
    { val: 'Male', label: UI.male }, { val: 'Female', label: UI.female },
  ] },
  { key: 'age', label: UI.lblAge, opts: [
    { val: 'Under 18', label: UI.a18 }, { val: '19–35', label: UI.a19 },
    { val: '36–44', label: UI.a36 }, { val: '45+', label: UI.a45 },
  ] },
  { key: 'occ', label: UI.lblOcc, opts: [
    { val: 'Student', label: UI.occStudy }, { val: 'Professional', label: UI.occWork },
  ] },
];

function Who({
  v, set, setMany, lang, err,
}: {
  v: Values;
  lang: Lang;
  err: string;
  set: <K extends keyof Values>(k: K, val: Values[K]) => void;
  setMany: (patch: Partial<Values>) => void;
}) {
  const s = (txt: Parameters<typeof t>[0]) => t(txt, lang);
  const done = (k: string, val: Values) =>
    k === 'phone' ? checkPhone(val.phone, val.dialCc) === 'ok' : !!val[k as keyof Values];
  const order = [...CHOICES.map(c => c.key), 'phone'];
  const [open, setOpen] = useState<string | null>(() => order.find(k => !done(k, v)) ?? null);

  const pick = (c: Choice, val: string) => {
    set(c.key, val);
    const after = { ...v, [c.key]: val };
    setOpen(order.find(k => !done(k, after)) ?? null);
  };

  const folds: Fold[] = [
    ...CHOICES.map(c => ({
      key: c.key,
      label: s(c.label),
      badge: v[c.key] ? labelOf(c.key, v[c.key], lang) : '',
      done: !!v[c.key],
      body: (
        <ChipWrap
          opts={c.opts}
          chosen={v[c.key] ? [v[c.key]] : []}
          lang={lang}
          onPick={x => pick(c, x)}
        />
      ),
    })),
    {
      key: 'phone',
      label: s(UI.lblReach),
      badge: v.phone ? `${v.dial} ${v.phone}` : '',
      done: done('phone', v),
      body: (
        <>
          <div className="phonerow">
            <CountryPicker
              cc={v.dialCc}
              lang={lang}
              onPick={(cc, dial) => setMany({ dialCc: cc, dial })}
            />
            <input
              className={`input${err && v.fullname.trim() && v.gender && v.age && v.occ ? ' bad' : ''}`}
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              value={v.phone}
              placeholder={placeholderFor(v.dialCc)}
              onChange={e => set('phone', e.target.value)}
            />
          </div>
          <div className="hint">{s(UI.phoneHint)}</div>
          <input
            className="input"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={v.email}
            placeholder={s(UI.emailPh)}
            onChange={e => set('email', e.target.value)}
          />
        </>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="field">
        <label htmlFor="fullname">{s(UI.lblName)}</label>
        <input
          id="fullname"
          className={`input${err && !v.fullname.trim() ? ' bad' : ''}`}
          value={v.fullname}
          placeholder={s(UI.phName)}
          autoComplete="name"
          onChange={e => set('fullname', e.target.value)}
        />
      </div>
      <Folds folds={folds} open={open} onOpen={setOpen} />
    </div>
  );
}

// --- your visit -------------------------------------------------------------

/**
 * Why they came, what they would like from us, and whether they live here,
 * with up to three more behind the last of those.
 *
 * Every question folds, including the two that take several answers. The
 * difficulty with those was always knowing when someone had finished choosing,
 * and the answer is that opening the next question says so. A question that
 * takes one answer folds on the tap that answers it; a question that takes
 * several stays open for as long as you are in it and folds when you move on.
 * Nobody has to press anything to say they are done.
 */
function Intent({
  step, v, set, lang, toggle,
}: {
  step: Step;
  v: Values;
  lang: Lang;
  set: <K extends keyof Values>(k: K, val: Values[K]) => void;
  toggle: (
    k: 'heard' | 'visit' | 'interest' | 'ministries',
    val: string,
    exclusive?: string,
  ) => void;
}) {
  const s = (txt: Parameters<typeof t>[0]) => t(txt, lang);
  const groups = step.groups ?? [];

  const done = (k: string, val: Values): boolean => {
    switch (k) {
      case 'visit':
        return val.visit.length > 0
          && (!val.visit.includes('Other') || !!val.visitOtherText.trim());
      case 'interest': return val.interest.length > 0;
      case 'where': return !!val.where;
      case 'ward': return !!val.ward && (val.ward !== 'Other' || !!val.wardOther.trim());
      case 'origin': return val.where === 'region' ? !!val.region : !!val.country.trim();
      case 'often': return !!val.often;
      case 'stay': return !!val.stay;
      default: return true;
    }
  };
  const orderFor = (val: Values) => [
    ...groups.map(g => g.key),
    ...(val.where === 'arusha' ? ['ward']
      : val.where ? ['origin', 'often', 'stay'] : []),
  ];
  // The screen arrives with both questions on show, because two questions with
  // their options out is not a wall — it is what the screen is about, and
  // folding the second one away before anyone has read it only hides it.
  // Answering whether they live here is what starts the folding: from that tap
  // on it is one question at a time, which is what keeps the three or four
  // that the answer opens from running off the bottom of the phone.
  const [open, setOpen] = useState<string | string[] | null>(
    () => (v.where
      ? orderFor(v).find(k => !done(k, v)) ?? null
      : groups.map(g => g.key)),
  );
  const advance = (after: Values) =>
    setOpen(orderFor(after).find(k => !done(k, after)) ?? null);

  /** One answer reads as itself; several read as the first and a count. */
  const many = (key: 'visit' | 'interest', otherText = '') => {
    const chosen = v[key];
    if (!chosen.length) return '';
    const first = chosen[0] === 'Other' ? otherText : labelOf(key, chosen[0], lang);
    return chosen.length > 1 ? `${first} +${chosen.length - 1}` : first;
  };

  const folds: Fold[] = groups.map(g => {
    // One answer, so the tap that gives it is also the tap that ends the
    // question: it folds itself and hands over to the next.
    if (g.single) {
      return {
        key: g.key,
        label: s(g.label),
        badge: v.where ? labelOf('where', v.where, lang) : '',
        done: done('where', v),
        body: (
          <ChipWrap
            opts={g.opts}
            chosen={v.where ? [v.where] : []}
            lang={lang}
            onPick={val => { set('where', val); advance({ ...v, where: val }); }}
          />
        ),
      };
    }
    const key = g.key as 'visit' | 'interest';
    const chosen = v[key];
    const otherOpen = g.other && chosen.includes('Other');
    return {
      key,
      label: s(g.label),
      badge: many(key, g.other ? String(v[g.other]) : ''),
      done: done(key, v),
      body: (
        <>
          <ChipWrap
            opts={g.opts}
            chosen={chosen}
            lang={lang}
            onPick={val => toggle(key, val, g.exclusive)}
            hint={s(UI.pickAny)}
          />
          {otherOpen && (
            <input
              className="input reveal"
              autoFocus
              value={String(v[g.other!])}
              placeholder={s(g.otherPh)}
              onChange={e => set(g.other!, e.target.value as never)}
            />
          )}
        </>
      ),
    };
  });

  if (v.where === 'arusha') {
    folds.push({
      key: 'ward',
      label: s(UI.lblWard),
      badge: v.ward === 'Other' ? v.wardOther : v.ward,
      done: done('ward', v),
      body: (
        <>
          <select
            className="input"
            required
            value={v.ward}
            onChange={e => {
              set('ward', e.target.value);
              if (e.target.value !== 'Other') advance({ ...v, ward: e.target.value });
            }}
          >
            <option value="" disabled>{s(UI.phWard)}</option>
            {WARDS.map(w => <option key={w} value={w}>{w}</option>)}
            <option value="Other">{s(UI.wardOther)}</option>
          </select>
          {v.ward === 'Other' && (
            <input
              className="input reveal"
              autoFocus
              value={v.wardOther}
              placeholder={s(UI.phWardOther)}
              onChange={e => set('wardOther', e.target.value)}
            />
          )}
        </>
      ),
    });
  }

  if (v.where === 'region' || v.where === 'country') {
    folds.push({
      key: 'origin',
      label: v.where === 'country' ? s(UI.lblCountry) : s(UI.lblRegion),
      badge: v.where === 'country' ? v.country : v.region,
      done: done('origin', v),
      body: v.where === 'country' ? (
        <input
          className="input"
          autoFocus
          value={v.country}
          placeholder={s(UI.phCountry)}
          autoComplete="country-name"
          onChange={e => set('country', e.target.value)}
        />
      ) : (
        <select
          className="input"
          required
          value={v.region}
          onChange={e => { set('region', e.target.value); advance({ ...v, region: e.target.value }); }}
        >
          <option value="" disabled>{s(UI.phRegion)}</option>
          {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      ),
    });
    folds.push({
      key: 'often',
      label: s(UI.lblOften),
      badge: v.often ? labelOf('often', v.often, lang) : '',
      done: !!v.often,
      body: (
        <ChipWrap
          opts={[
            { val: 'First time', label: UI.o1 }, { val: 'Every week', label: UI.o2 },
            { val: 'Monthly', label: UI.o3 }, { val: 'Few times a year', label: UI.o4 },
          ]}
          chosen={v.often ? [v.often] : []}
          lang={lang}
          onPick={x => { set('often', x); advance({ ...v, often: x }); }}
        />
      ),
    });
    folds.push({
      key: 'stay',
      label: s(UI.lblStay),
      badge: v.stay ? labelOf('stay', v.stay, lang) : '',
      done: !!v.stay,
      body: (
        <ChipWrap
          opts={[
            { val: 'Just today', label: UI.s1 }, { val: 'A few days', label: UI.s2 },
            { val: 'A week or so', label: UI.s3 }, { val: 'A few weeks', label: UI.s4 },
            { val: 'Months', label: UI.s5 }, { val: 'Moving here', label: UI.s6 },
          ]}
          chosen={v.stay ? [v.stay] : []}
          lang={lang}
          onPick={x => { set('stay', x); advance({ ...v, stay: x }); }}
        />
      ),
    });
  }

  return <Folds folds={folds} open={open} onOpen={setOpen} />;
}

// --- the closing screen ----------------------------------------------------

/**
 * What they made of today, and then the question that decides whether the form
 * asks them anything else.
 *
 * Someone who does not want to hear more from us has no business being asked
 * what they would like from the church or what we should pray about: those two
 * questions are the start of a conversation, and the gate is where they say
 * whether they want one. Answer no and the two never appear, the screen thanks
 * them, and Finish is the only thing left to do.
 *
 * Nothing folds here. This is the last screen and the shortest, and the three
 * or four questions on it are the ones nobody has to answer — a question behind
 * a tap is a question fewer people bother with, and these are the ones we would
 * most like them to bother with.
 */
function Closing({
  step, v, set, setMany, toggle, lang,
}: {
  step: Step;
  v: Values;
  lang: Lang;
  set: <K extends keyof Values>(k: K, val: Values[K]) => void;
  setMany: (patch: Partial<Values>) => void;
  toggle: (
    k: 'heard' | 'visit' | 'interest' | 'ministries',
    val: string,
    exclusive?: string,
  ) => void;
}) {
  const s = (txt: Parameters<typeof t>[0]) => t(txt, lang);
  const interest = step.groups?.find(g => g.key === 'interest');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="field">
        <label>{s(UI.lblLiked)}</label>
        <textarea
          className="input"
          value={v.liked}
          onChange={e => set('liked', e.target.value)}
        />
        <div className="hint">{s(UI.likedHint)}</div>
      </div>

      <div className="field">
        <label>{s(UI.lblWantMore)}</label>
        <YesNoChips
          value={v.wantMore}
          lang={lang}
          no={UI.no}
          onPick={b => setMany(
            // No means no: the two questions it was gating go away, and
            // anything already typed into them goes with them, so the office is
            // never left reading an answer to a question this person declined.
            b ? { wantMore: true } : { wantMore: false, interest: [], prayer: '' },
          )}
        />
      </div>

      {v.wantMore === false && <div className="hint">{s(UI.noMoreThanks)}</div>}

      {v.wantMore && interest && (
        <>
          <div className="field reveal">
            <label>{s(interest.label)}</label>
            <ChipWrap
              opts={interest.opts}
              chosen={v.interest}
              lang={lang}
              onPick={val => toggle('interest', val, interest.exclusive)}
              hint={s(UI.pickAny)}
            />
          </div>

          <div className="field reveal">
            <label>{s(UI.lblPrayer)}</label>
            <textarea
              className="input"
              value={v.prayer}
              placeholder={s(step.ph)}
              onChange={e => set('prayer', e.target.value)}
            />
            {step.note && (
              <div className="note">
                <Lock size={16} />
                <span>{s(step.note)}</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// --- walk with God ---------------------------------------------------------

function Faith({
  v, set, lang,
}: {
  v: Values;
  lang: Lang;
  set: <K extends keyof Values>(k: K, val: Values[K]) => void;
}) {
  const s = (txt: Parameters<typeof t>[0]) => t(txt, lang);

  const done = (q: FaithQ, val: Values): boolean => {
    switch (q) {
      case 'dob': return !!val.dob;
      case 'saved': return val.saved !== null;
      case 'bapt': return val.bapt !== null;
      case 'holy': return val.holy !== null;
      case 'prevChurch': return val.prevChurch !== null;
      case 'savedYear': return !!val.savedYear.trim();
      case 'baptYear': return !!val.baptYear.trim();
      case 'prevChurchName': return !!val.prevChurchName.trim();
    }
  };
  const [open, setOpen] = useState<string | null>(
    () => faithQuestions(v).find(q => !done(q, v)) ?? null,
  );
  const advance = (after: Values) =>
    setOpen(faithQuestions(after).find(q => !done(q, after)) ?? null);

  const text = (key: 'savedYear' | 'baptYear' | 'prevChurchName', ph: Txt) => (
    <input
      className="input"
      autoFocus
      inputMode={key === 'prevChurchName' ? 'text' : 'numeric'}
      value={v[key]}
      placeholder={s(ph)}
      onChange={e => set(key, e.target.value)}
    />
  );

  const build = (q: FaithQ): Fold => {
    switch (q) {
      case 'dob':
        return {
          key: q, label: s(UI.lblDob), badge: v.dob ? formatDob(v.dob, lang) : '',
          done: !!v.dob,
          body: (
            <DateWheel
              value={v.dob}
              age={v.age}
              lang={lang}
              onChange={iso => { set('dob', iso); advance({ ...v, dob: iso }); }}
            />
          ),
        };
      case 'saved':
        return {
          key: q, label: s(UI.qSaved), badge: ynBadge(v.saved, lang, UI.notYet),
          done: v.saved !== null,
          body: (
            <YesNoChips value={v.saved} lang={lang} no={UI.notYet}
              onPick={b => { set('saved', b); advance({ ...v, saved: b }); }} />
          ),
        };
      case 'savedYear':
        return { key: q, label: s(UI.lblSavedYear), badge: v.savedYear,
          done: done(q, v), body: text('savedYear', UI.phSavedYear) };
      case 'bapt':
        return {
          key: q, label: s(UI.qBapt), badge: ynBadge(v.bapt, lang, UI.notYet),
          done: v.bapt !== null,
          body: (
            <YesNoChips value={v.bapt} lang={lang} no={UI.notYet}
              onPick={b => { set('bapt', b); advance({ ...v, bapt: b }); }} />
          ),
        };
      case 'baptYear':
        return { key: q, label: s(UI.lblBaptYear), badge: v.baptYear,
          done: done(q, v), body: text('baptYear', UI.phBaptYear) };
      case 'holy':
        return {
          key: q, label: s(UI.qHoly), badge: ynBadge(v.holy, lang, UI.notYet),
          done: v.holy !== null,
          body: (
            <YesNoChips value={v.holy} lang={lang} no={UI.notYet}
              onPick={b => { set('holy', b); advance({ ...v, holy: b }); }} />
          ),
        };
      case 'prevChurch':
        return {
          key: q, label: s(UI.qPrev), badge: ynBadge(v.prevChurch, lang, UI.no),
          done: v.prevChurch !== null,
          body: (
            <YesNoChips value={v.prevChurch} lang={lang} no={UI.no}
              onPick={b => { set('prevChurch', b); advance({ ...v, prevChurch: b }); }} />
          ),
        };
      case 'prevChurchName':
        return { key: q, label: s(UI.lblPrevChurchName), badge: v.prevChurchName,
          done: done(q, v), body: text('prevChurchName', UI.phChurch) };
    }
  };

  // Someone not yet born again is never asked about their baptism: the chain
  // itself decides which questions exist, and it is recomputed on every answer.
  //
  // Only as far as the first unanswered one, so the screen grows a question at
  // a time. Being born again is not put to anyone while the date of birth above
  // it is still being rolled, and the questions that a "not yet" would take
  // away again never appear in the first place.
  const chain = faithQuestions(v);
  const next = chain.findIndex(q => !done(q, v));
  const shown = next < 0 ? chain : chain.slice(0, next + 1);
  return <Folds folds={shown.map(build)} open={open} onOpen={setOpen} />;
}

// --- family ----------------------------------------------------------------

function Family({
  v, set, lang,
}: {
  v: Values;
  lang: Lang;
  set: <K extends keyof Values>(k: K, val: Values[K]) => void;
}) {
  const s = (txt: Parameters<typeof t>[0]) => t(txt, lang);
  const kids = v.children.length ? v.children : [''];

  const done = (k: string, val: Values): boolean => {
    switch (k) {
      case 'marital': return !!val.marital;
      case 'marriedYear': return !!val.marriedYear.trim();
      case 'kids': return val.kids !== null;
      case 'children': return val.children.some(c => c.trim() !== '');
      default: return true;
    }
  };
  const orderFor = (val: Values) => [
    'marital',
    ...(val.marital === 'Married' ? ['marriedYear'] : []),
    ...(val.marital ? ['kids'] : []),
    ...(val.kids === true ? ['children'] : []),
  ];
  const [open, setOpen] = useState<string | null>(
    () => orderFor(v).find(k => !done(k, v)) ?? null,
  );
  const advance = (after: Values) =>
    setOpen(orderFor(after).find(k => !done(k, after)) ?? null);

  const folds: Fold[] = [{
    key: 'marital',
    label: s(UI.lblMarital),
    badge: v.marital ? labelOf('marital', v.marital, lang) : '',
    done: !!v.marital,
    body: (
      <ChipWrap
        opts={[
          { val: 'Single', label: UI.m1 }, { val: 'Married', label: UI.m2 },
          { val: 'Widowed', label: UI.m3 }, { val: 'Separated', label: UI.m4 },
        ]}
        chosen={v.marital ? [v.marital] : []}
        lang={lang}
        onPick={x => { set('marital', x); advance({ ...v, marital: x }); }}
      />
    ),
  }];

  if (v.marital === 'Married') {
    folds.push({
      key: 'marriedYear',
      label: s(UI.lblMarriedYear),
      badge: v.marriedYear,
      done: done('marriedYear', v),
      body: (
        <input
          className="input"
          autoFocus
          inputMode="numeric"
          value={v.marriedYear}
          placeholder={s(UI.phMarriedYear)}
          onChange={e => set('marriedYear', e.target.value)}
        />
      ),
    });
  }

  if (v.marital) {
    folds.push({
      key: 'kids',
      label: s(UI.lblKids),
      badge: ynBadge(v.kids, lang, UI.no),
      done: v.kids !== null,
      body: (
        <YesNoChips value={v.kids} lang={lang} no={UI.no}
          onPick={b => { set('kids', b); advance({ ...v, kids: b }); }} />
      ),
    });
  }

  if (v.kids === true) {
    folds.push({
      key: 'children',
      label: s(UI.lblChildren),
      badge: v.children.filter(c => c.trim()).join(', '),
      done: done('children', v),
      body: (
        <>
          {kids.map((c, i) => (
            <div className="childrow" key={i}>
              <input
                className="input"
                value={c}
                placeholder={s(UI.phChild)}
                onChange={e => {
                  const next = [...kids];
                  next[i] = e.target.value;
                  set('children', next);
                }}
              />
              {kids.length > 1 && (
                <button
                  type="button"
                  className="minus"
                  aria-label="Remove"
                  onClick={() => {
                    const next = kids.filter((_, j) => j !== i);
                    set('children', next.length ? next : ['']);
                  }}
                >
                  <Minus size={16} />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="addchild"
            onClick={() => set('children', [...kids, ''])}
          >
            <Plus size={16} /> {s(UI.addChild)}
          </button>
        </>
      ),
    });
  }

  return <Folds folds={folds} open={open} onOpen={setOpen} />;
}

// --- small pieces ----------------------------------------------------------

/** A real example number for that country beats a made-up "7XX XXX XXX". */
function placeholderFor(cc: string): string {
  return DIAL_BY_CC[cc]?.ex ?? '';
}

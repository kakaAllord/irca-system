import { DIAL_BY_CC } from './dialCodes';
import { faithQuestions, t, UI, type Lang, type Step, type Txt, type Values } from './flow';

/**
 * Is this a usable national number for that country?
 *
 * Lengths come from Google's libphonenumber data, extracted per country at
 * build time (see scripts/gen-dial-codes.mjs). A single global "at least seven
 * digits" rule would be wrong almost everywhere: Tanzania is exactly 9, Kenya
 * accepts 7 to 10, the UK 7, 9, 10, 11 or 12.
 */
export function checkPhone(phone: string, cc: string): 'ok' | 'empty' | 'short' | 'long' {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return 'empty';

  const country = DIAL_BY_CC[cc];
  if (!country || !country.len.length) return digits.length >= 7 ? 'ok' : 'short';

  if (country.len.includes(digits.length)) return 'ok';

  // Valid lengths are not always contiguous: the UK takes 7, 9, 10, 11 or 12,
  // so 8 digits is neither too short nor too long but sits in a gap. Only call
  // it long once it is past every valid length; below that, "keep going" is the
  // more useful thing to say to someone still typing.
  return digits.length > Math.max(...country.len) ? 'long' : 'short';
}

/**
 * What is still missing, said in the words of the question that is missing it.
 *
 * "This one we do need" is true of every unanswered question on the form and
 * therefore of no use to someone looking at a screen holding four of them.
 * These two name the question instead, and both come out of the rules below —
 * the same rules that decide whether Continue is greyed — so the message under
 * the button can never disagree with the button.
 */
function need(how: 'pick' | 'fill', q: Txt | undefined, lang: Lang): string {
  const label = q ? t(q, lang) : '';
  return t(how === 'pick' ? UI.eStillPick : UI.eStillFill, lang).replace('{q}', label);
}

/**
 * One rule set, run in two places: the client calls it on every keystroke to
 * decide whether the Continue button is live, and the server calls it again on
 * submit. The greyed button is a courtesy, not enforcement — anyone can POST.
 *
 * Returns the message to show, or '' when the step is answerable. Questions are
 * checked in the order they appear on the screen, so the message always names
 * the first thing still outstanding rather than the last.
 */
export function validateStep(step: Step, v: Values, lang: Lang): string {
  const s = (txt: Parameters<typeof t>[0]) => t(txt, lang);
  if (!step.req) return '';

  switch (step.type) {
    // The name, the three taps, and the number, in the order they appear so the
    // message always names the first thing still missing.
    case 'who': {
      if (!v.fullname.trim()) return s(UI.eName);
      if (!v.gender) return need('pick', UI.lblGender, lang);
      if (!v.age) return need('pick', UI.lblAge, lang);
      if (!v.occ) return need('pick', UI.lblOcc, lang);
      const country = DIAL_BY_CC[v.dialCc];
      const name = country ? country.name : v.dial;
      // Ifs rather than a switch: the switch was exhaustive, but only
      // TypeScript could see that, and lint read it as falling through to the
      // next question.
      const phone = checkPhone(v.phone, v.dialCc);
      if (phone === 'empty') return s(UI.ePhone);
      if (phone === 'short') return s(UI.ePhoneShort).replace('{country}', name);
      if (phone === 'long') return s(UI.ePhoneLong).replace('{country}', name);
      return '';
    }

    case 'occDetail':
      if (v.occ === 'Student' && !v.school.trim()) return need('fill', UI.lblStudy, lang);
      if (v.occ === 'Professional' && !v.profession.trim()) return need('fill', UI.lblWorkQ, lang);
      return '';

    // Every question on the screen, then whichever follow-ups the answer to
    // "do you live here in Arusha" opened.
    case 'intent': {
      for (const g of step.groups ?? []) {
        const label = g.label ?? step.q;
        if (g.single) {
          if (!v[g.key]) return need('pick', label, lang);
          continue;
        }
        const chosen = v[g.key] as string[];
        if (!chosen.length) return need('pick', label, lang);
        if (g.other && chosen.includes('Other') && !String(v[g.other]).trim()) {
          return need('fill', g.otherPh ?? label, lang);
        }
      }
      if (v.where === 'arusha') {
        if (!v.ward) return need('pick', UI.lblWard, lang);
        if (v.ward === 'Other' && !v.wardOther.trim()) return need('fill', UI.phWardOther, lang);
      } else if (v.where) {
        if (v.where === 'region' && !v.region) return need('pick', UI.lblRegion, lang);
        if (v.where === 'country' && !v.country.trim()) return need('fill', UI.lblCountry, lang);
        if (!v.often) return need('pick', UI.lblOften, lang);
        if (!v.stay) return need('pick', UI.lblStay, lang);
      }
      return '';
    }

    // Only the gate question blocks. What they liked and what to pray about are
    // theirs to give or not, and the interest question is only asked of the
    // people who said they wanted to hear more.
    case 'closing': {
      if (v.wantMore === null) return need('pick', UI.lblWantMore, lang);
      if (v.wantMore && !v.interest.length) {
        const g = step.groups?.find((x) => x.key === 'interest');
        return need('pick', g?.label ?? step.q, lang);
      }
      return '';
    }

    default: {
      if (!step.key) return '';
      const asks = step.type === 'text' || step.type === 'area' ? 'fill' : 'pick';
      if (step.multi) {
        const chosen = v[step.key] as string[];
        if (!chosen.length) return need('pick', step.q, lang);
        if (step.other && chosen.includes('Other') && !String(v[step.other]).trim()) {
          return need('fill', step.otherPh ?? step.q, lang);
        }
        return '';
      }
      const val = v[step.key];
      if (val === '' || val === null || val === undefined) return need(asks, step.q, lang);
      if (step.other && val === 'Other' && !String(v[step.other]).trim()) {
        return need('fill', step.otherPh ?? step.q, lang);
      }
      return '';
    }
  }
}

function hasValue(v: Values, k: keyof Values): boolean {
  const val = v[k];
  if (Array.isArray(val)) return val.some((x) => String(x).trim() !== '');
  if (typeof val === 'boolean') return true;
  return val !== null && val !== undefined && String(val).trim() !== '';
}

/**
 * Whether this step has actually been answered — a different question from
 * whether it blocks. An optional step never fails validation, so counting
 * "does not block" as "answered" would tell someone with five screens left
 * that they were finished.
 *
 * Used for the resume screen's "3 of 16 left" and for the office's progress
 * column, so the two can never disagree.
 */
export function isAnswered(step: Step, v: Values, lang: Lang): boolean {
  if (step.req) return validateStep(step, v, lang) === '';

  // The walk-with-God screen is answered once every question it currently
  // shows has been answered — which is fewer questions for someone who is not
  // yet born again.
  if (step.type === 'faith') {
    return (
      faithQuestions(v).every((q) => {
        switch (q) {
          case 'saved':
            return v.saved !== null;
          case 'bapt':
            return v.bapt !== null;
          case 'holy':
            return v.holy !== null;
          case 'prevChurch':
            return v.prevChurch !== null;
          default:
            return true;
        }
      }) && v.saved !== null
    );
  }

  return keysForStep(step).some((k) => hasValue(v, k));
}

/** The Values keys a given step is allowed to write. */
export function keysForStep(step: Step): (keyof Values)[] {
  switch (step.type) {
    case 'who':
      return ['fullname', 'gender', 'age', 'occ', 'dialCc', 'dial', 'phone', 'email'];
    case 'intent':
      return [
        ...(step.groups ?? []).flatMap(
          (g) => (g.other ? [g.key, g.other] : [g.key]) as (keyof Values)[],
        ),
        'ward',
        'wardOther',
        'region',
        'country',
        'stay',
        'often',
      ];
    case 'occDetail':
      return ['school', 'course', 'year', 'profession'];
    case 'closing':
      return ['liked', 'wantMore', 'interest', 'prayer'];
    case 'faith':
      return [
        'dob',
        'saved',
        'savedYear',
        'bapt',
        'baptYear',
        'holy',
        'prevChurch',
        'prevChurchName',
      ];
    case 'family':
      return ['marital', 'marriedYear', 'kids', 'children'];
    case 'serve':
      return ['ministries', 'otherMinistry'];
    default: {
      const keys: (keyof Values)[] = [];
      if (step.key) keys.push(step.key);
      if (step.other) keys.push(step.other);
      if (step.follow) keys.push(step.follow.key);
      return keys;
    }
  }
}

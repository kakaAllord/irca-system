/**
 * Text messages, counted the way the carriers count them, and written the way
 * the church writes them (D22, D25). Shared, so the composer's "about 4,290
 * TZS" and what the API charges are the same sum.
 */

/** The GSM 03.38 basic alphabet: one of these costs one of 160 characters. */
const GSM_BASIC = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà',
);
/** The extension table: each of these takes two places (an escape, then itself). */
const GSM_EXTENDED = new Set('^{}\\[~]|€\f');

export type SmsEncoding = 'GSM-7' | 'UCS-2';

export type SegmentCount = {
  encoding: SmsEncoding;
  /** How many the carrier bills. Never less than one. */
  segments: number;
  /** Characters (GSM places, or UTF-16 units) the text uses. */
  length: number;
  /** How many more fit before the next segment starts. */
  charsLeft: number;
};

/**
 * How many segments a text is.
 *
 * All GSM-7: 160 for one segment, 153 each when there are several (the rest
 * of each goes on the header that joins them). Anything else — an emoji, or a
 * curly apostrophe pasted from Word — makes the whole message UCS-2: 70 for
 * one, 67 each for several. Swahili is GSM-7, so its reminders stay cheap
 * until someone pastes a ’.
 */
export function segments(text: string): SegmentCount {
  let gsm = 0;
  let isGsm = true;
  for (const ch of text) {
    if (GSM_BASIC.has(ch)) gsm += 1;
    else if (GSM_EXTENDED.has(ch)) gsm += 2;
    else {
      isGsm = false;
      break;
    }
  }
  if (isGsm) return count('GSM-7', gsm, 160, 153);
  // UCS-2 counts UTF-16 code units: an emoji outside the basic plane is two.
  return count('UCS-2', text.length, 70, 67);
}

function count(encoding: SmsEncoding, length: number, single: number, multi: number): SegmentCount {
  if (length <= single) return { encoding, segments: 1, length, charsLeft: single - length };
  const n = Math.ceil(length / multi);
  return { encoding, segments: n, length, charsLeft: n * multi - length };
}

export const SMS_LANGS = ['en', 'sw', 'fr'] as const;
export type SmsLang = (typeof SMS_LANGS)[number];

/**
 * The way out, which every message carries and which cannot be switched off
 * (D22). Added by the renderer when the body does not already say it, and
 * counted into the segments so the cost shown is the cost paid.
 */
export const OPT_OUT: Record<SmsLang, string> = {
  sw: 'Jibu ACHA kuacha.',
  en: 'Reply STOP to stop.',
  fr: 'Répondez STOP pour arrêter.',
};

/** The words a reply may be, trimmed and in any case, to stop every message. */
export const STOP_WORDS = ['stop', 'acha', 'simama', 'unsubscribe', 'toka'] as const;

/** Whether a reply means "stop": the whole reply, not a word inside a sentence. */
export const isStop = (reply: string): boolean =>
  (STOP_WORDS as readonly string[]).includes(
    reply
      .trim()
      .toLowerCase()
      .replace(/[.!]+$/, ''),
  );

/**
 * The blanks a template may use. The first four are filled for each person
 * from who they are; the rest the sender types when sending.
 */
export const BLANKS = {
  first_name: { label: 'First name', from: 'recipient' },
  full_name: { label: 'Full name', from: 'recipient' },
  church_name: { label: "The church's name", from: 'system' },
  department_name: { label: "The department's name", from: 'system' },
  event_name: { label: 'What it is', from: 'sender' },
  date: { label: 'Date', from: 'sender' },
  time: { label: 'Time', from: 'sender' },
  venue: { label: 'Where', from: 'sender' },
} as const;
export type Blank = keyof typeof BLANKS;

const BLANK = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

/** The blanks a body uses, in the order they first appear. */
export function blanksOf(body: string): string[] {
  const seen: string[] = [];
  for (const m of body.matchAll(BLANK)) {
    const name = m[1]!.toLowerCase();
    if (!seen.includes(name)) seen.push(name);
  }
  return seen;
}

/** The blanks the sender has to type in, for a template using these. */
export const senderBlanks = (fields: string[]): Blank[] =>
  fields.filter((f): f is Blank => f in BLANKS && BLANKS[f as Blank].from === 'sender');

/** The body with its blanks filled; a blank with no value is left empty. */
export function fillBlanks(body: string, values: Record<string, string>): string {
  return body.replace(BLANK, (_, name: string) => values[name.toLowerCase()] ?? '');
}

/**
 * Exactly what one person receives: the blanks filled, the whitespace tidied,
 * and the way to stop added in their language if the body does not already
 * carry it.
 */
export function renderSms(body: string, lang: SmsLang, values: Record<string, string>): string {
  const text = fillBlanks(body, values)
    .replace(/[ \t]+/g, ' ')
    .trim();
  const out = OPT_OUT[lang];
  return text.toLowerCase().includes(out.toLowerCase()) ? text : `${text} ${out}`;
}

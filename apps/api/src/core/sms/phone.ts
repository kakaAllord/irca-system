import { parsePhoneNumberFromString } from 'libphonenumber-js';

/**
 * A phone number as a carrier wants it, E.164 ('+255712345678'), from how the
 * church recorded it: a dialling code and the rest, as the form asks for them.
 * Null when it is not a number anything could be sent to.
 *
 * A leading 0 on the national part is the trunk prefix people type out of
 * habit (0712 345 678), not part of the number, so it goes.
 */
export function toE164(dial: string, phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  const parsed = phone.trim().startsWith('+')
    ? parsePhoneNumberFromString(`+${digits}`)
    : parsePhoneNumberFromString(`${dial.trim()}${digits.replace(/^0+/, '')}`);
  return parsed?.isValid() ? parsed.number : null;
}

'use client';

import { useId } from 'react';
import { BLANKS, OPT_OUT, segments, type SmsLang } from '@irca/shared';
import { LANG_LABEL } from './types';

/**
 * One language's words, with the count the carrier will bill. The way to
 * stop is added to every message, so it is counted here too: the number shown
 * is the number paid for (D25).
 */
export function BodyField({
  lang,
  value,
  onChange,
  error,
}: {
  lang: SmsLang;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const id = useId();
  const count = value.trim() ? segments(`${value.trim()} ${OPT_OUT[lang]}`) : null;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[12px] font-medium text-fg2">
        {LANG_LABEL[lang]}
      </label>
      <textarea
        id={id}
        rows={3}
        value={value}
        maxLength={918}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        className={`rounded-[7px] border bg-input px-3 py-2 text-[13px] text-fg focus:border-accent focus:ring-2 focus:ring-accent-br focus:outline-none ${error ? 'border-danger' : 'border-border'}`}
      />
      <p
        className={`text-[11.5px] ${error ? 'text-danger' : count?.encoding === 'UCS-2' ? 'text-warn-fg' : 'text-fg3'}`}
      >
        {error ??
          (count
            ? `${count.segments} ${count.segments === 1 ? 'segment' : 'segments'} with the way to stop, ${count.charsLeft} characters before the next.${count.encoding === 'UCS-2' ? ' A character outside the basic alphabet (an emoji, or a curly ’) halves the room: use a straight apostrophe.' : ''}`
            : `Left empty, people who read ${LANG_LABEL[lang]} get the church's default language.`)}
      </p>
    </div>
  );
}

/** The blanks a template may use, for the hint under the bodies. */
export const BLANK_HINT = Object.entries(BLANKS)
  .map(([k, v]) => `{{${k}}} ${v.label.toLowerCase()}`)
  .join(' · ');

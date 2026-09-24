import { describe, expect, it } from 'vitest';
import { OPT_OUT, blanksOf, isStop, renderSms, segments, senderBlanks } from './sms';

describe('counting SMS segments the way the carriers do', () => {
  it('fits 160 plain characters in one, and splits at 153 after that', () => {
    expect(segments('a'.repeat(160))).toMatchObject({
      encoding: 'GSM-7',
      segments: 1,
      charsLeft: 0,
    });
    expect(segments('a'.repeat(161))).toMatchObject({ segments: 2 });
    expect(segments('a'.repeat(306)).segments).toBe(2);
    expect(segments('a'.repeat(307)).segments).toBe(3);
  });

  it('counts an extension character such as € as two places', () => {
    expect(segments('€'.repeat(80)).segments).toBe(1);
    expect(segments(`${'€'.repeat(80)}a`).segments).toBe(2);
  });

  it('turns the whole message into UCS-2 for one character outside the alphabet', () => {
    // An emoji is two UTF-16 units: 68 letters and one emoji fill exactly 70.
    expect(segments(`${'a'.repeat(68)}🙏`)).toMatchObject({ encoding: 'UCS-2', segments: 1 });
    expect(segments(`${'a'.repeat(69)}🙏`)).toMatchObject({ encoding: 'UCS-2', segments: 2 });
  });

  it('keeps Swahili cheap, until someone pastes a curly apostrophe', () => {
    const plain = 'Karibu kanisani Jumapili saa nne asubuhi. Mungu akubariki!';
    expect(segments(plain).encoding).toBe('GSM-7');
    expect(segments(plain.replace('Mungu', 'Mungu’')).encoding).toBe('UCS-2');
  });
});

describe('writing each person their own message', () => {
  it('fills the blanks and adds the way to stop, once, in their language', () => {
    const body = 'Habari {{first_name}}, mazoezi ni {{ date }} saa {{time}}.';
    const text = renderSms(body, 'sw', { first_name: 'Neema', date: 'Ijumaa', time: '18:00' });
    expect(text).toBe(`Habari Neema, mazoezi ni Ijumaa saa 18:00. ${OPT_OUT.sw}`);
    // Already said: not said twice.
    expect(renderSms(`Hello. ${OPT_OUT.en}`, 'en', {})).toBe(`Hello. ${OPT_OUT.en}`);
  });

  it('finds the blanks a body uses, and which the sender must type', () => {
    const fields = blanksOf('{{first_name}}: {{event_name}} on {{date}}, {{first_name}}.');
    expect(fields).toEqual(['first_name', 'event_name', 'date']);
    expect(senderBlanks(fields)).toEqual(['event_name', 'date']);
  });

  it('hears STOP in every language the church writes in, and only as the whole reply', () => {
    for (const word of ['STOP', ' acha ', 'Simama.', 'toka', 'Unsubscribe'])
      expect(isStop(word)).toBe(true);
    expect(isStop('please do not stop the choir')).toBe(false);
  });
});

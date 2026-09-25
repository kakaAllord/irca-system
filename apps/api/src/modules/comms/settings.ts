import { SMS_LANGS, type SmsLang } from '@irca/shared';
import type { Tx } from '../../core/database/db.service.js';

/**
 * Communications' own numbers, in the settings table, with their defaults
 * here. There is deliberately no default daily cap: the budget is not decided
 * (comms brief, 24 Sept 2026), and a made-up figure is worse than none, so
 * nothing is sent until Communications saves one.
 */
export type CommsSettings = {
  /** TZS per segment, from Beem's price list. */
  pricePerSegment: string;
  /** TZS per day, or null: nothing is sent until one is saved. */
  dailyCap: string | null;
  /** For people with no language recorded, and bodies left empty. */
  defaultLang: SmsLang;
  /** No beat sends inside it: 'HH:MM-HH:MM', church time. */
  quietHours: string;
};

export const DEFAULTS: CommsSettings = {
  pricePerSegment: '30.00',
  dailyCap: null,
  defaultLang: 'sw',
  quietHours: '21:00-07:00',
};

const KEYS = {
  pricePerSegment: 'comms.pricePerSegment',
  dailyCap: 'comms.dailyCap',
  defaultLang: 'comms.defaultLang',
  quietHours: 'comms.quietHours',
} as const;

const MONEY = /^\d{1,10}(\.\d{1,2})?$/;
export const QUIET = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/;

/** Read through any client or transaction, falling back to the defaults. */
export async function commsSettings(tx: Pick<Tx, 'setting'>): Promise<CommsSettings> {
  const rows = await tx.setting.findMany({ where: { key: { in: Object.values(KEYS) } } });
  const value = (key: string) => rows.find((r) => r.key === key)?.value;
  const money = (v: unknown) =>
    typeof v === 'string' && MONEY.test(v) ? Number(v).toFixed(2) : null;
  const lang = value(KEYS.defaultLang);
  const quiet = value(KEYS.quietHours);
  return {
    pricePerSegment: money(value(KEYS.pricePerSegment)) ?? DEFAULTS.pricePerSegment,
    dailyCap: money(value(KEYS.dailyCap)),
    defaultLang: (SMS_LANGS as readonly unknown[]).includes(lang)
      ? (lang as SmsLang)
      : DEFAULTS.defaultLang,
    quietHours: typeof quiet === 'string' && QUIET.test(quiet) ? quiet : DEFAULTS.quietHours,
  };
}

/** Writes the settings given; each is stored only once it differs from nothing. */
export async function saveCommsSettings(
  tx: Pick<Tx, 'setting'>,
  next: CommsSettings,
): Promise<void> {
  for (const [field, key] of Object.entries(KEYS) as [keyof CommsSettings, string][]) {
    const value = next[field];
    if (value === null) {
      await tx.setting.deleteMany({ where: { key } });
    } else {
      await tx.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
    }
  }
}

import type { Tx } from '../../core/database/db.service.js';

/**
 * A church's own numbers, with the defaults the church started with. Stored
 * only when a church changes one, so a new church needs no rows at all.
 */
export const DEFAULTS = {
  /** How long an approved application waits before it can be confirmed. */
  'membership.probationDays': 30,
  /** How many sessions the foundation class has. */
  'membership.foundationSessions': 6,
} as const;

export type SettingKey = keyof typeof DEFAULTS;

export async function setting(tx: Tx, churchId: string, key: SettingKey): Promise<number> {
  const row = await tx.churchSetting.findUnique({ where: { key } });
  const value = typeof row?.value === 'number' ? row.value : Number(row?.value);
  return Number.isFinite(value) && value > 0 ? value : DEFAULTS[key];
}

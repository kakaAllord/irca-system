import type { Tx } from '../database/db.service.js';

/**
 * What the alerts compare against (docs/plan/10, step 10.4), in the settings
 * table with the defaults here. Only the database's storage size is set in
 * the portal (Dev → Settings), because only it differs by deployment: it is
 * the size of the plan the church pays for, which the system cannot ask. The
 * percentages are the plan's, and a row in `settings` overrides them if a
 * church ever needs to.
 */
export type AlertSettings = {
  /** More than this share of requests failing over ten minutes. */
  errorRatePercent: number;
  /** More than this share of a day's texts failing. */
  smsFailurePercent: number;
  /** The database's storage, in bytes, as the plan allows; null: not watched. */
  dbStorageBytes: number | null;
  /** Past this share of `dbStorageBytes`. */
  storagePercent: number;
};

export const ALERT_DEFAULTS: AlertSettings = {
  errorRatePercent: 2,
  smsFailurePercent: 10,
  dbStorageBytes: null,
  storagePercent: 80,
};

const KEYS: Record<keyof AlertSettings, string> = {
  errorRatePercent: 'alerts.errorRatePercent',
  smsFailurePercent: 'alerts.smsFailurePercent',
  dbStorageBytes: 'alerts.dbStorageBytes',
  storagePercent: 'alerts.storagePercent',
};

const positive = (v: unknown) => (typeof v === 'number' && v > 0 ? v : null);

/** Read through any client or transaction, falling back to the defaults. */
export async function alertSettings(tx: Pick<Tx, 'setting'>): Promise<AlertSettings> {
  const rows = await tx.setting.findMany({ where: { key: { in: Object.values(KEYS) } } });
  const value = (field: keyof AlertSettings) =>
    positive(rows.find((r) => r.key === KEYS[field])?.value);
  return {
    errorRatePercent: value('errorRatePercent') ?? ALERT_DEFAULTS.errorRatePercent,
    smsFailurePercent: value('smsFailurePercent') ?? ALERT_DEFAULTS.smsFailurePercent,
    dbStorageBytes: value('dbStorageBytes'),
    storagePercent: value('storagePercent') ?? ALERT_DEFAULTS.storagePercent,
  };
}

/** The storage size, from Dev → Settings; null stops watching it. */
export async function saveStorageSize(
  tx: Pick<Tx, 'setting'>,
  bytes: number | null,
): Promise<void> {
  const key = KEYS.dbStorageBytes;
  if (bytes === null) await tx.setting.deleteMany({ where: { key } });
  else
    await tx.setting.upsert({
      where: { key },
      update: { value: bytes },
      create: { key, value: bytes },
    });
}

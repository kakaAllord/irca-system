/**
 * The number printed on every entry: IRCA-EXP-2026-09-000001.
 *
 * It is the church's code, what kind of entry it is, the year and month of the
 * *transaction date*, and a counter that restarts every month. Once written it
 * never changes, which is why the church's code is frozen as soon as the
 * church has entries.
 */
export type FinanceKind = 'INCOME' | 'EXPENSE';
export type FinanceKindCode = 'INC' | 'EXP';

export const kindCode = (kind: FinanceKind): FinanceKindCode => (kind === 'INCOME' ? 'INC' : 'EXP');

export const kindOfCode = (code: FinanceKindCode): FinanceKind =>
  code === 'INC' ? 'INCOME' : 'EXPENSE';

/** Past 999,999 entries in one month the counter simply grows a digit. */
export function formatTransactionCode(p: {
  churchCode: string;
  kind: FinanceKind;
  year: number;
  month: number;
  seq: number;
}): string {
  return [
    p.churchCode,
    kindCode(p.kind),
    String(p.year),
    String(p.month).padStart(2, '0'),
    String(p.seq).padStart(6, '0'),
  ].join('-');
}

const CODE_RE = /^([A-Z][A-Z0-9]{1,9})-(INC|EXP)-(\d{4})-(\d{2})-(\d{6,})$/;

export type ParsedTransactionCode = {
  churchCode: string;
  kind: FinanceKind;
  year: number;
  month: number;
  seq: number;
};

/** The parts of a number, or null when it is not one. Nothing is looked up. */
export function parseTransactionCode(code: string): ParsedTransactionCode | null {
  const m = CODE_RE.exec(code);
  if (!m) return null;
  const month = Number(m[4]);
  if (month < 1 || month > 12) return null;
  return {
    churchCode: m[1]!,
    kind: kindOfCode(m[2] as FinanceKindCode),
    year: Number(m[3]),
    month,
    seq: Number(m[5]),
  };
}

/** The counter this entry takes its number from: 'finance:EXP:2026-09'. */
export const sequenceKey = (kind: FinanceKind, year: number, month: number) =>
  `finance:${kindCode(kind)}:${year}-${String(month).padStart(2, '0')}`;

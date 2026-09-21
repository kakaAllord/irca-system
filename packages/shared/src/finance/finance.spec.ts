import { describe, expect, it } from 'vitest';
import { formatTransactionCode, parseTransactionCode, sequenceKey } from './code';
import { nameKey, tidyName } from './names';
import { AmountSchema, formatMoney } from './money';
import { CreateTransactionSchema } from './schemas';

const base = { churchCode: 'IRCA', kind: 'EXPENSE' as const, year: 2026, month: 9 };

describe('entry numbers', () => {
  it('pads the counter to six digits and the month to two', () => {
    expect(formatTransactionCode({ ...base, seq: 1 })).toBe('IRCA-EXP-2026-09-000001');
    expect(formatTransactionCode({ ...base, month: 12, seq: 14 })).toBe('IRCA-EXP-2026-12-000014');
  });

  it('lets the counter grow past six digits rather than wrapping', () => {
    expect(formatTransactionCode({ ...base, seq: 1234567 })).toBe('IRCA-EXP-2026-09-1234567');
  });

  it('reads back exactly what it wrote', () => {
    const code = formatTransactionCode({ ...base, kind: 'INCOME', seq: 31 });
    expect(parseTransactionCode(code)).toEqual({
      churchCode: 'IRCA',
      kind: 'INCOME',
      year: 2026,
      month: 9,
      seq: 31,
    });
  });

  it('refuses anything that is not a number of ours', () => {
    for (const bad of [
      'irca-exp-2026-09-000001',
      'IRCA-FOO-2026-09-000001',
      'IRCA-EXP-2026-13-000001',
      'IRCA-EXP-2026-09-1',
      '',
    ]) {
      expect(parseTransactionCode(bad)).toBeNull();
    }
  });

  it('counts each kind and month separately', () => {
    expect(sequenceKey('EXPENSE', 2026, 9)).toBe('finance:EXP:2026-09');
    expect(sequenceKey('INCOME', 2026, 9)).toBe('finance:INC:2026-09');
    expect(sequenceKey('EXPENSE', 2026, 10)).toBe('finance:EXP:2026-10');
  });
});

describe('item names', () => {
  it('keeps the capitals it was given but not the extra spaces', () => {
    expect(tidyName('  Electricity   BILL ')).toBe('Electricity BILL');
  });

  it('matches two spellings of the same item', () => {
    expect(nameKey('  Electricity   BILL ')).toBe(nameKey('electricity bill'));
  });
});

describe('amounts', () => {
  it('accepts what people type, commas included', () => {
    expect(AmountSchema.parse('150,000')).toBe('150000');
    expect(AmountSchema.parse(' 150000.50 ')).toBe('150000.50');
  });

  it('refuses nothing, zero, three decimals and letters', () => {
    for (const bad of ['', '0', '0.00', '10.123', '1e5', '-5']) {
      expect(AmountSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('shows cents only when there are any', () => {
    expect(formatMoney('150000')).toBe('TZS 150,000');
    expect(formatMoney('150000.5')).toBe('TZS 150,000.50');
  });
});

describe('an entry as the form sends it', () => {
  const common = {
    txnDate: '2026-09-21',
    amount: '150,000',
    method: 'CASH',
    clientRequestId: '0199b0f2-0000-7000-8000-000000000001',
  };

  it('needs an expense item for an expense and a source for income', () => {
    expect(CreateTransactionSchema.safeParse({ ...common, kind: 'EXPENSE' }).success).toBe(false);
    expect(
      CreateTransactionSchema.safeParse({
        ...common,
        kind: 'EXPENSE',
        expenseItemId: '0199b0f2-0000-7000-8000-000000000002',
      }).success,
    ).toBe(true);
  });

  it('cleans the amount on the way in', () => {
    const parsed = CreateTransactionSchema.parse({
      ...common,
      kind: 'INCOME',
      incomeSourceId: '0199b0f2-0000-7000-8000-000000000003',
    });
    expect(parsed.amount).toBe('150000');
  });
});

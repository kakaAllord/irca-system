'use client';

import { PAYMENT_METHODS, type PaymentMethod } from '@irca/shared';
import { Input } from '@/components/ui/Input';
import { RequiredMark } from '@/components/ui/RequiredMark';
import { CatalogCombobox, type CatalogValue } from './CatalogCombobox';
import { cn } from '@/lib/cn';

export type EntryValues = {
  txnDate: string;
  item: CatalogValue;
  amount: string;
  method: PaymentMethod;
  reference: string;
  counterparty: string;
  notes: string;
};

/**
 * The fields of an entry, shared by recording one and by asking for one to be
 * corrected, so the two forms can never drift apart.
 */
export function EntryFields({
  kind,
  values,
  onChange,
  errors,
  currency,
}: {
  kind: 'income' | 'expense';
  values: EntryValues;
  /**
   * Takes an updater, not a value: creating an item answers from the network,
   * and by then the amount may already have been typed. Merging into whatever
   * is current is what stops that answer from wiping it.
   */
  onChange: (update: (previous: EntryValues) => EntryValues) => void;
  errors: Record<string, string[] | undefined>;
  currency: string;
}) {
  const set = <K extends keyof EntryValues>(key: K, value: EntryValues[K]) =>
    onChange((previous) => ({ ...previous, [key]: value }));

  return (
    <div className="flex flex-col gap-4">
      <Input
        label="Date"
        required
        type="date"
        value={values.txnDate}
        max={new Date().toISOString().slice(0, 10)}
        error={errors.txnDate?.[0]}
        onChange={(e) => set('txnDate', e.target.value)}
      />

      <CatalogCombobox
        kind={kind}
        value={values.item}
        onChange={(item) => set('item', item)}
        error={errors.item?.[0] ?? errors.incomeSourceId?.[0] ?? errors.expenseItemId?.[0]}
      />

      <Input
        label={`Amount (${currency})`}
        required
        inputMode="decimal"
        value={values.amount}
        error={errors.amount?.[0]}
        onChange={(e) => set('amount', e.target.value.replace(/[^\d.,]/g, ''))}
        onBlur={(e) => set('amount', tidyAmount(e.target.value))}
      />

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-[12px] font-medium text-fg2">
          {kind === 'income' ? 'Received by' : 'Paid by'}
          <RequiredMark />
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(PAYMENT_METHODS).map(([value, label]) => (
            <label
              key={value}
              className={cn(
                'cursor-pointer rounded-full border px-3 py-1 text-[12px]',
                values.method === value
                  ? 'border-accent-br bg-chip text-fg'
                  : 'border-border text-fg2 hover:bg-hover',
              )}
            >
              <input
                type="radio"
                name="method"
                className="sr-only"
                checked={values.method === value}
                onChange={() => set('method', value as PaymentMethod)}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <Input
        label="Reference"
        hint="Optional. M-Pesa code, receipt or cheque number."
        value={values.reference}
        error={errors.reference?.[0]}
        onChange={(e) => set('reference', e.target.value)}
      />
      <Input
        label={kind === 'income' ? 'Received from' : 'Paid to'}
        hint="Optional."
        value={values.counterparty}
        error={errors.counterparty?.[0]}
        onChange={(e) => set('counterparty', e.target.value)}
      />
      <Input
        label="Notes"
        hint="Optional."
        value={values.notes}
        error={errors.notes?.[0]}
        onChange={(e) => set('notes', e.target.value)}
      />
    </div>
  );
}

/** 150000 typed, "150,000" shown, once the field is left. */
function tidyAmount(value: string): string {
  const plain = value.replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(plain)) return value;
  const [whole, cents] = plain.split('.');
  return Number(whole).toLocaleString('en-GB') + (cents ? `.${cents}` : '');
}

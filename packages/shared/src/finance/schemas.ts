import { z } from 'zod';
import { AmountSchema } from './money';
import { tidyName } from './names';

/** How the money moved. The labels are what the portal shows. */
export const PAYMENT_METHODS = {
  CASH: 'Cash',
  MOBILE_MONEY: 'Mobile money',
  BANK_TRANSFER: 'Bank transfer',
  CHEQUE: 'Cheque',
  CARD: 'Card',
  OTHER: 'Other',
} as const;

export type PaymentMethod = keyof typeof PAYMENT_METHODS;

export const PaymentMethodSchema = z.enum(
  Object.keys(PAYMENT_METHODS) as [PaymentMethod, ...PaymentMethod[]],
);

const DateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date')
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), 'Choose a real date');

const shared = {
  txnDate: DateSchema,
  amount: AmountSchema,
  method: PaymentMethodSchema,
  reference: z.string().trim().max(80).optional(),
  counterparty: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(1000).optional(),
};

/**
 * An entry as the form sends it. Income needs a source and expenses need an
 * item, which is why this is one schema per kind rather than two optional
 * fields nobody checks.
 */
export const CreateTransactionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('INCOME'),
    incomeSourceId: z.uuid('Choose an income source from the list, or create it'),
    clientRequestId: z.uuid(),
    ...shared,
  }),
  z.object({
    kind: z.literal('EXPENSE'),
    expenseItemId: z.uuid('Choose an expense item from the list, or create it'),
    clientRequestId: z.uuid(),
    ...shared,
  }),
]);

export type CreateTransactionInput = z.infer<typeof CreateTransactionSchema>;

/** What a change request may ask for. The kind of an entry is never proposable. */
export const ProposedTransactionSchema = z
  .object({
    txnDate: DateSchema,
    incomeSourceId: z.uuid(),
    expenseItemId: z.uuid(),
    amount: AmountSchema,
    method: PaymentMethodSchema,
    reference: z.string().trim().max(80),
    counterparty: z.string().trim().max(120),
    notes: z.string().trim().max(1000),
  })
  .partial();

export type ProposedTransaction = z.infer<typeof ProposedTransactionSchema>;

export const ChangeRequestSchema = z.object({
  action: z.enum(['EDIT', 'VOID']),
  proposed: ProposedTransactionSchema.default({}),
  reason: z
    .string()
    .trim()
    .min(5, 'Say what was wrong, in a few words')
    .max(500, 'Use at most 500 characters'),
});

export type ChangeRequestInput = z.infer<typeof ChangeRequestSchema>;

export const DecideRequestSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

export const RejectRequestSchema = z.object({
  note: z.string().trim().min(3, 'Say why, so the person knows').max(500),
});

export const CreateCatalogItemSchema = z.object({
  name: z
    .string()
    .transform(tidyName)
    .pipe(z.string().min(2, 'Use at least 2 characters').max(80, 'Use at most 80 characters')),
  description: z.string().trim().max(300).optional(),
  /** Set when the person has seen the similar names and means a new item anyway. */
  confirmDistinct: z.boolean().optional(),
});

export type CreateCatalogItemInput = z.infer<typeof CreateCatalogItemSchema>;

export const UpdateCatalogItemSchema = z
  .object({
    name: z
      .string()
      .transform(tidyName)
      .pipe(z.string().min(2, 'Use at least 2 characters').max(80, 'Use at most 80 characters'))
      .optional(),
    description: z.string().trim().max(300).optional(),
    confirmDistinct: z.boolean().optional(),
  })
  .refine((v) => v.name !== undefined || v.description !== undefined, 'Change something');

import { z } from 'zod';
import { AmountSchema } from './money';
import { tidyName } from './names';
import { PaymentMethodSchema, type PaymentMethod } from './schemas';

/**
 * Pledges (Phase 9): what someone promised towards a campaign, and what they
 * have paid. The one place the church names a giver against an amount, so
 * who may read what is decided in the API, never here
 * (docs/modules/pledges-brief.md).
 */

export const PLEDGE_RHYTHMS = {
  ONE_OFF: 'All at once',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
} as const;
export type PledgeRhythm = keyof typeof PLEDGE_RHYTHMS;

export type PledgeStatus = 'OPEN' | 'COMPLETED' | 'CANCELLED';

export const PLEDGE_STATUS_LABEL: Record<PledgeStatus, string> = {
  OPEN: 'Open',
  COMPLETED: 'Paid in full',
  CANCELLED: 'Cancelled',
};

/** Which pledges a campaign's list shows. Overdue: open, and past its date. */
export const PLEDGE_FILTERS = ['open', 'overdue', 'completed', 'cancelled', 'all'] as const;
export type PledgeFilter = (typeof PLEDGE_FILTERS)[number];

const DateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date')
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), 'Choose a real date');

const CampaignName = z
  .string()
  .transform(tidyName)
  .pipe(z.string().min(2, 'Use at least 2 characters').max(80, 'Use at most 80 characters'));

export const CreateCampaignSchema = z.object({
  name: CampaignName,
  /** Blank: no target, and no progress bar against one. */
  targetAmount: AmountSchema.nullable().optional(),
  startsOn: DateSchema,
  endsOn: DateSchema.nullable().optional(),
});
export type CreateCampaignInput = z.infer<typeof CreateCampaignSchema>;

export const UpdateCampaignSchema = z
  .object({
    name: CampaignName,
    targetAmount: AmountSchema.nullable(),
    startsOn: DateSchema,
    endsOn: DateSchema.nullable(),
    /** Closed: no new pledges. Its pledges can still be paid. */
    isActive: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Change something');
export type UpdateCampaignInput = z.infer<typeof UpdateCampaignSchema>;

export const CreatePledgeSchema = z.object({
  campaignId: z.uuid('Choose a campaign'),
  personId: z.uuid('Choose who made the promise'),
  amount: AmountSchema,
  rhythm: z.enum(Object.keys(PLEDGE_RHYTHMS) as [PledgeRhythm, ...PledgeRhythm[]]),
  promisedOn: DateSchema,
  dueOn: DateSchema.nullable().optional(),
  note: z.string().trim().max(300).optional(),
  clientRequestId: z.uuid(),
});
export type CreatePledgeInput = z.infer<typeof CreatePledgeSchema>;

export const CancelPledgeSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, 'Say why, in a few words')
    .max(300, 'Use at most 300 characters'),
});

export const RecordPaymentSchema = z.object({
  amount: AmountSchema,
  paidOn: DateSchema,
  method: PaymentMethodSchema,
  /** The income entry that recorded the same money, when there is one. */
  transactionId: z.uuid().nullable().optional(),
  note: z.string().trim().max(200).optional(),
  clientRequestId: z.uuid(),
});
export type RecordPaymentInput = z.infer<typeof RecordPaymentSchema>;

/** What a request to correct a payment may propose. '' unlinks the entry. */
export const ProposedPaymentSchema = z
  .object({
    amount: AmountSchema,
    paidOn: DateSchema,
    method: PaymentMethodSchema,
    transactionId: z.union([z.uuid(), z.literal('')]),
    note: z.string().trim().max(200),
  })
  .partial();

export const PaymentChangeRequestSchema = z.object({
  action: z.enum(['EDIT', 'VOID']),
  proposed: ProposedPaymentSchema.default({}),
  reason: z
    .string()
    .trim()
    .min(5, 'Say what was wrong, in a few words')
    .max(500, 'Use at most 500 characters'),
});
export type PaymentChangeRequestInput = z.infer<typeof PaymentChangeRequestSchema>;

/** A campaign with its sums. Amounts are decimal strings, summed in SQL. */
export type PledgeCampaignView = {
  id: string;
  name: string;
  targetAmount: string | null;
  startsOn: string;
  endsOn: string | null;
  isActive: boolean;
  /** Everything promised, cancelled pledges left out. */
  promised: string;
  /** Every payment still standing, whatever became of its pledge. */
  received: string;
  /** What the open pledges still owe. */
  outstanding: string;
  counts: { open: number; overdue: number; completed: number; cancelled: number };
};

export type PledgePaymentView = {
  id: string;
  amount: string;
  paidOn: string;
  method: PaymentMethod;
  note: string;
  status: 'POSTED' | 'VOIDED';
  transaction: { id: string; code: string } | null;
  recordedBy: string | null;
  recordedAt: string;
  voidReason: string | null;
  revision: number;
  /** A correction waiting for an administrator, if there is one. */
  openRequest: { id: string; isMine: boolean; requestedBy: string } | null;
};

/** One pledge, with what is left. Balance below zero means they gave more. */
export type PledgeView = {
  id: string;
  campaign: { id: string; name: string };
  /** Null once the person was erased. */
  person: { id: string; name: string; phoneTail: string } | null;
  amount: string;
  paid: string;
  balance: string;
  rhythm: PledgeRhythm;
  promisedOn: string;
  dueOn: string | null;
  overdue: boolean;
  note: string;
  status: PledgeStatus;
  cancelReason: string | null;
};

export type PledgeDetail = PledgeView & {
  payments: PledgePaymentView[];
  recordedBy: string | null;
};

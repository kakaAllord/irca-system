import type { PaymentMethod } from './schemas';

/** An entry as every page and the API pass it around. Amounts are strings. */
export type FinanceTransaction = {
  id: string;
  code: string;
  kind: 'INCOME' | 'EXPENSE';
  status: 'POSTED' | 'VOIDED';
  txnDate: string;
  amount: string;
  currency: string;
  item: { id: string; name: string } | null;
  method: PaymentMethod;
  reference: string | null;
  counterparty: string | null;
  notes: string | null;
  revision: number;
  recordedBy: { id: string; fullName: string } | null;
  recordedAt: string;
  voidedAt: string | null;
  voidedBy: { id: string; fullName: string } | null;
  voidReason: string | null;
  replacesCode: string | null;
  replacedByCode: string | null;
};

export type CatalogItem = {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  uses: number;
  lastUsedOn: string | null;
};

export type CatalogSuggestion = {
  id: string;
  name: string;
  description: string;
  uses: number;
};

export type CatalogSuggestResponse = {
  items: CatalogSuggestion[];
  /** Whether what was typed already names an item, which hides "Create". */
  exact: { id: string; name: string; isActive: boolean } | null;
};

export type ChangeRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

/** A request to change a record that may not be changed directly (D17). */
export type ChangeRequestView = {
  id: string;
  moduleKey: string;
  moduleName: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  /** Where the record can be read, e.g. /finance/transactions/IRCA-EXP-2026-09-000001. */
  entityHref: string | null;
  action: 'EDIT' | 'VOID';
  reason: string;
  status: ChangeRequestStatus;
  /** Only the fields that would change, already in words: "Amount 150,000 → 105,000". */
  changes: { field: string; label: string; from: string; to: string }[];
  /** Set when approving would move the entry into another month, and so renumber it. */
  warning: string | null;
  requestedBy: { id: string; fullName: string; roles: string[] };
  requestedAt: string;
  decidedBy: { id: string; fullName: string } | null;
  decidedAt: string | null;
  decisionNote: string | null;
  result: { newCode?: string } | null;
  /** Whether the person reading this asked for it: they may cancel, never decide. */
  isMine: boolean;
};

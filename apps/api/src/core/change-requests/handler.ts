import type { ChangeRequest } from '../../generated/prisma/client.js';
import type { TenantTx } from '../database/db.service.js';

/** What a request asks for. A void is a change like any other (D17). */
export type ChangeAction = 'EDIT' | 'VOID';

/** One line of the before → after table an approver reads. */
export type ChangeLine = { field: string; label: string; from: string; to: string };

export type DescribedEntity = {
  /** What it is called in the inbox, e.g. IRCA-EXP-2026-09-000014. */
  label: string;
  /** Where to read it, or null when the module has no page for it. */
  href: string | null;
  /** The values a proposal may change, as they are now. */
  before: Record<string, unknown>;
};

/**
 * How a module lets its records be changed by approval.
 *
 * Core knows nothing about finance, membership or anything else: it stores the
 * request, decides who may decide, and calls the handler. A module registers
 * one handler per kind of record, and everything module-specific — what may be
 * proposed, what it means in words, and how it is applied — lives there.
 */
export interface ChangeRequestHandler {
  readonly moduleKey: string;
  readonly entityType: string;

  /** The record as it is now, or null when it does not exist in this church. */
  describe(tx: TenantTx, entityId: string): Promise<DescribedEntity | null>;

  /**
   * Refuses a proposal that cannot be applied. Called when the request is
   * made and again when it is approved, because the world moves in between.
   */
  validate(
    tx: TenantTx,
    input: {
      action: ChangeAction;
      proposed: Record<string, unknown>;
      before: Record<string, unknown>;
    },
  ): Promise<void>;

  /** Applies an approved request, inside the approver's transaction. */
  apply(tx: TenantTx, request: ChangeRequest): Promise<Record<string, unknown> | null>;

  /** The before → after table, in words, plus a warning worth reading twice. */
  explain(
    tx: TenantTx,
    input: {
      action: ChangeAction;
      proposed: Record<string, unknown>;
      before: Record<string, unknown>;
    },
  ): Promise<{ changes: ChangeLine[]; warning: string | null }>;
}

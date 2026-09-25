import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  formatMoney,
  type CreateCampaignInput,
  type CreatePledgeInput,
  type PaymentMethod,
  type PledgeCampaignView,
  type PledgeDetail,
  type PledgeFilter,
  type PledgePaymentView,
  type PledgeRhythm,
  type PledgeStatus,
  type PledgeView,
  type RecordPaymentInput,
  type UpdateCampaignInput,
} from '@irca/shared';
import type { PersonStage } from '../../generated/prisma/client.js';
import { Db, type Tx } from '../../core/database/db.service.js';
import { empty, join, sql, type Sql } from '../../core/database/sql.js';
import { RequestAuth } from '../../core/context/request-auth.js';
import { AppError, notFound } from '../../core/http/app-error.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { UsageService } from '../../core/usage/usage.service.js';
import { recordInteraction } from '../membership/timeline.js';

const unprocessable = (message: string, details?: unknown) =>
  new AppError(422, ErrorCode.VALIDATION_FAILED, message, details);

const phoneTail = (phone: string) => (phone.length >= 3 ? `…${phone.slice(-3)}` : '');
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const asDate = (s: string) => new Date(`${s}T00:00:00Z`);

/** Today where the church is: what "overdue" and "not in the future" are measured against. */
export async function today(tx: Pick<Tx, 'church'>): Promise<string> {
  const church = await tx.church.findFirst({ select: { timezone: true } });
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: church?.timezone ?? 'Africa/Dar_es_Salaam',
  }).format(new Date());
}

type PledgeRow = {
  id: string;
  campaign_id: string;
  campaign_name: string;
  person_id: string | null;
  full_name: string | null;
  phone: string | null;
  amount: string;
  paid: string;
  balance: string;
  rhythm: PledgeRhythm;
  promised_on: Date;
  due_on: Date | null;
  overdue: boolean;
  note: string;
  status: PledgeStatus;
  cancel_reason: string | null;
};

/**
 * Pledges: what a person promised towards a campaign, what they have paid,
 * and what is left (09 step 9.1).
 *
 * The balance is never stored. It is the promise less the payments still
 * standing, summed in SQL every time it is read, so two clerks recording at
 * the same moment cannot leave it wrong. A payment is written once, under a
 * lock on its pledge; correcting one is a request an administrator approves
 * (D17), handled by PledgePaymentChangeHandler.
 *
 * Who may read names against amounts is decided by the routes: the lists
 * need `finance.pledges.read_sensitive`, and a clerk reaches one pledge by
 * looking up the person in front of them (docs/modules/pledges-brief.md).
 */
@Injectable()
export class PledgesService {
  constructor(
    private readonly db: Db,
    private readonly auth: RequestAuth,
    private readonly audit: AuditService,
    private readonly usage: UsageService,
  ) {}

  // ── Campaigns ─────────────────────────────────────────────────────────

  async campaigns(): Promise<PledgeCampaignView[]> {
    return this.campaignRows(empty);
  }

  async campaign(id: string): Promise<PledgeCampaignView> {
    const [row] = await this.campaignRows(sql`where c.id = ${id}::uuid`);
    if (!row) throw notFound('No such campaign.');
    return row;
  }

  async createCampaign(input: CreateCampaignInput): Promise<{ id: string }> {
    this.checkDates(input.startsOn, input.endsOn ?? null);
    const made = await this.db.tx(async (tx) => {
      await this.requireUniqueName(tx, input.name);
      const row = await tx.pledgeCampaign.create({
        data: {
          name: input.name,
          targetAmount: input.targetAmount ?? null,
          startsOn: asDate(input.startsOn),
          endsOn: input.endsOn ? asDate(input.endsOn) : null,
          createdById: this.auth.userId!,
        },
      });
      await this.audit.recordIn(tx, {
        action: 'finance.pledge_campaign.created',
        entityType: 'pledge_campaign',
        entityId: row.id,
        summary: `Opened the campaign "${row.name}"`,
        after: { name: row.name, targetAmount: input.targetAmount ?? null },
      });
      return row;
    });
    this.usage.inc('finance.pledges.campaigns');
    return { id: made.id };
  }

  async updateCampaign(id: string, input: UpdateCampaignInput): Promise<void> {
    await this.db.tx(async (tx) => {
      const current = await tx.pledgeCampaign.findUnique({ where: { id } });
      if (!current) throw notFound('No such campaign.');
      const startsOn = input.startsOn ?? day(current.startsOn)!;
      const endsOn = input.endsOn !== undefined ? input.endsOn : day(current.endsOn);
      this.checkDates(startsOn, endsOn);
      if (input.name && input.name !== current.name) await this.requireUniqueName(tx, input.name);
      const updated = await tx.pledgeCampaign.update({
        where: { id },
        data: {
          ...(input.name ? { name: input.name } : {}),
          ...(input.targetAmount !== undefined ? { targetAmount: input.targetAmount } : {}),
          ...(input.startsOn ? { startsOn: asDate(input.startsOn) } : {}),
          ...(input.endsOn !== undefined
            ? { endsOn: input.endsOn ? asDate(input.endsOn) : null }
            : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });
      await this.audit.recordIn(tx, {
        action:
          input.isActive === false && current.isActive
            ? 'finance.pledge_campaign.closed'
            : 'finance.pledge_campaign.changed',
        entityType: 'pledge_campaign',
        entityId: id,
        summary:
          input.isActive === false && current.isActive
            ? `Closed the campaign "${updated.name}" to new pledges`
            : `Changed the campaign "${updated.name}"`,
        before: campaignValues(current),
        after: campaignValues(updated),
      });
    });
  }

  // ── Pledges ───────────────────────────────────────────────────────────

  /** A campaign's pledges, largest owed first. Names against amounts: read_sensitive only. */
  async pledgesOf(campaignId: string, filter: PledgeFilter, q: string): Promise<PledgeView[]> {
    await this.campaign(campaignId);
    const now = await today(this.db.client);
    const conditions: Sql[] = [sql`p.campaign_id = ${campaignId}::uuid`];
    if (filter === 'open') conditions.push(sql`p.status = 'OPEN'`);
    if (filter === 'completed') conditions.push(sql`p.status = 'COMPLETED'`);
    if (filter === 'cancelled') conditions.push(sql`p.status = 'CANCELLED'`);
    if (filter === 'overdue') {
      conditions.push(sql`p.status = 'OPEN' and p.due_on < ${now}::date`);
    }
    const term = q.trim();
    if (term) conditions.push(sql`pe.full_name ilike ${`%${term}%`}`);
    return this.pledgeRows(sql`where ${join(conditions, ' and ')}`, now);
  }

  /** Someone to record a promise for: anyone in People, found by name or number. */
  async personCandidates(q: string) {
    const term = q.trim();
    if (term.length < 2) return [];
    const people = await this.db.client.person.findMany({
      where: {
        OR: [
          { fullName: { contains: term, mode: 'insensitive' } },
          { phone: { contains: term.replace(/\s/g, '') } },
        ],
      },
      orderBy: { fullName: 'asc' },
      take: 20,
    });
    return people.map((p) => ({
      personId: p.id,
      name: p.fullName,
      stage: p.stage as PersonStage,
      phoneTail: phoneTail(p.phone),
    }));
  }

  async createPledge(input: CreatePledgeInput): Promise<{ id: string; created: boolean }> {
    const existing = await this.db.client.pledge.findUnique({
      where: { clientRequestId: input.clientRequestId },
    });
    if (existing) return { id: existing.id, created: false };

    const now = await today(this.db.client);
    if (input.promisedOn > now) {
      throw unprocessable('That date is in the future.', {
        promisedOn: ['A promise cannot be dated later than today'],
      });
    }
    if (input.dueOn && input.dueOn < input.promisedOn) {
      throw unprocessable('It is due before it was promised.', {
        dueOn: ['On or after the day it was promised'],
      });
    }

    const made = await this.db.tx(async (tx) => {
      const campaign = await tx.pledgeCampaign.findUnique({ where: { id: input.campaignId } });
      if (!campaign) throw notFound('No such campaign.');
      if (!campaign.isActive) {
        throw new AppError(409, ErrorCode.CONFLICT, `"${campaign.name}" is closed to new pledges.`);
      }
      const person = await tx.person.findUnique({ where: { id: input.personId } });
      if (!person) throw notFound('No such person in People.');

      const row = await tx.pledge.create({
        data: {
          campaignId: campaign.id,
          personId: person.id,
          amount: input.amount,
          rhythm: input.rhythm,
          promisedOn: asDate(input.promisedOn),
          dueOn: input.dueOn ? asDate(input.dueOn) : null,
          note: input.note ?? '',
          recordedById: this.auth.userId!,
          clientRequestId: input.clientRequestId,
        },
      });
      // No amount on the timeline: every portal that may see the person
      // reads it, and only a few may see what they promised.
      await recordInteraction(tx, {
        personId: person.id,
        kind: 'PLEDGE_PROMISED',
        moduleKey: 'finance',
        byId: this.auth.userId,
        summary: `Made a pledge towards ${campaign.name}`,
        at: asDate(input.promisedOn),
        meta: { pledgeId: row.id },
      });
      // The log names the campaign and the amount, never the person with it.
      await this.audit.recordIn(tx, {
        action: 'finance.pledge.created',
        entityType: 'pledge',
        entityId: row.id,
        summary: `Recorded a pledge of ${formatMoney(input.amount)} towards "${campaign.name}"`,
        after: { amount: input.amount, rhythm: input.rhythm, dueOn: input.dueOn ?? null },
        meta: { personId: person.id, campaignId: campaign.id },
      });
      return row;
    });
    this.usage.inc('finance.pledges.created');
    return { id: made.id, created: true };
  }

  /** A promise that will not be kept. It stays, with any payments already made. */
  async cancel(id: string, reason: string): Promise<void> {
    await this.db.tx(async (tx) => {
      const pledge = await this.lock(tx, id);
      if (pledge.status !== 'OPEN') {
        throw new AppError(
          409,
          ErrorCode.CONFLICT,
          pledge.status === 'CANCELLED'
            ? 'This pledge is already cancelled.'
            : 'This pledge is paid in full, so there is nothing to cancel.',
        );
      }
      await tx.pledge.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledById: this.auth.userId!,
          cancelReason: reason,
        },
      });
      await this.audit.recordIn(tx, {
        action: 'finance.pledge.cancelled',
        entityType: 'pledge',
        entityId: id,
        summary: `Cancelled a pledge towards "${pledge.campaign.name}": ${reason}`,
        meta: { personId: pledge.personId, campaignId: pledge.campaignId },
      });
    });
    this.usage.inc('finance.pledges.cancelled');
  }

  /**
   * The clerk's way in: the open pledges of the person paying, found by
   * name or number, never the list of everyone who owes.
   */
  async lookup(q: string): Promise<PledgeView[]> {
    const term = q.trim();
    if (term.length < 2) return [];
    const now = await today(this.db.client);
    return this.pledgeRows(
      sql`where p.status = 'OPEN' and (pe.full_name ilike ${`%${term}%`}
            or pe.phone like ${`%${term.replace(/\s/g, '')}%`})`,
      now,
      10,
    );
  }

  /** Everything one person promised, with its payments, for their page in Membership. */
  async forPerson(personId: string): Promise<PledgeDetail[]> {
    const now = await today(this.db.client);
    const rows = await this.pledgeRows(sql`where p.person_id = ${personId}::uuid`, now);
    return Promise.all(rows.map((row) => this.withPayments(row)));
  }

  async detail(id: string): Promise<PledgeDetail> {
    const now = await today(this.db.client);
    const [row] = await this.pledgeRows(sql`where p.id = ${id}::uuid`, now);
    if (!row) throw notFound('No such pledge.');
    return this.withPayments(row);
  }

  // ── Payments ──────────────────────────────────────────────────────────

  /**
   * Money in against a pledge, in one transaction: the pledge is locked, so
   * two payments at once are taken one after the other; the payment is
   * written; and a pledge whose balance reaches zero is marked paid in full.
   */
  async recordPayment(
    pledgeId: string,
    input: RecordPaymentInput,
  ): Promise<{ id: string; created: boolean; status: PledgeStatus; balance: string }> {
    const existing = await this.db.client.pledgePayment.findUnique({
      where: { clientRequestId: input.clientRequestId },
    });
    if (existing) {
      const pledge = await this.detail(existing.pledgeId);
      return { id: existing.id, created: false, status: pledge.status, balance: pledge.balance };
    }
    const now = await today(this.db.client);
    if (input.paidOn > now) {
      throw unprocessable('That date is in the future.', {
        paidOn: ['A payment cannot be dated later than today'],
      });
    }

    const result = await this.db.tx(async (tx) => {
      const pledge = await this.lock(tx, pledgeId);
      if (pledge.status === 'CANCELLED') {
        throw new AppError(409, ErrorCode.CONFLICT, 'This pledge was cancelled.');
      }
      if (pledge.status === 'COMPLETED') {
        throw new AppError(409, ErrorCode.CONFLICT, 'This pledge is already paid in full.');
      }
      if (input.transactionId) await checkLink(tx, input.transactionId, input.amount, null);

      const payment = await tx.pledgePayment.create({
        data: {
          pledgeId,
          amount: input.amount,
          paidOn: asDate(input.paidOn),
          method: input.method,
          transactionId: input.transactionId ?? null,
          note: input.note ?? '',
          recordedById: this.auth.userId!,
          clientRequestId: input.clientRequestId,
        },
      });
      const settled = await settle(tx, pledgeId);

      if (pledge.personId) {
        await recordInteraction(tx, {
          personId: pledge.personId,
          kind: 'PLEDGE_PAID',
          moduleKey: 'finance',
          byId: this.auth.userId,
          summary:
            settled.status === 'COMPLETED'
              ? `Paid their pledge towards ${pledge.campaign.name} in full`
              : `Paid towards their pledge for ${pledge.campaign.name}`,
          at: asDate(input.paidOn),
          meta: { pledgeId, paymentId: payment.id },
        });
      }
      await this.audit.recordIn(tx, {
        action: 'finance.pledge.payment_recorded',
        entityType: 'pledge',
        entityId: pledgeId,
        summary:
          `Recorded a payment of ${formatMoney(input.amount)} towards "${pledge.campaign.name}"` +
          (settled.status === 'COMPLETED' ? ', paying the pledge in full' : ''),
        after: {
          paymentId: payment.id,
          amount: input.amount,
          paidOn: input.paidOn,
          method: input.method,
          transactionId: input.transactionId ?? null,
        },
        meta: { personId: pledge.personId },
      });
      return { id: payment.id, ...settled };
    });
    this.usage.inc('finance.pledges.payments');
    return { ...result, created: true };
  }

  // ── Reading ───────────────────────────────────────────────────────────

  private async campaignRows(where: Sql): Promise<PledgeCampaignView[]> {
    const now = await today(this.db.client);
    const rows = await this.db.client.$queryRaw<
      {
        id: string;
        name: string;
        target_amount: string | null;
        starts_on: Date;
        ends_on: Date | null;
        is_active: boolean;
        promised: string;
        received: string;
        outstanding: string;
        open: number;
        overdue: number;
        completed: number;
        cancelled: number;
      }[]
    >(sql`
      with pl as (
        select p.campaign_id, p.amount, p.status, p.due_on,
               coalesce((select sum(pp.amount) from pledge_payments pp
                         where pp.pledge_id = p.id and pp.status = 'POSTED'), 0) as paid
        from pledges p
      )
      select c.id, c.name, c.target_amount::text as target_amount, c.starts_on, c.ends_on,
             c.is_active,
             coalesce(sum(pl.amount) filter (where pl.status <> 'CANCELLED'), 0)::text as promised,
             coalesce(sum(pl.paid), 0)::text as received,
             coalesce(sum(greatest(pl.amount - pl.paid, 0))
                      filter (where pl.status = 'OPEN'), 0)::text as outstanding,
             count(pl.status) filter (where pl.status = 'OPEN')::int as open,
             count(pl.status) filter (where pl.status = 'OPEN' and pl.due_on < ${now}::date)::int
               as overdue,
             count(pl.status) filter (where pl.status = 'COMPLETED')::int as completed,
             count(pl.status) filter (where pl.status = 'CANCELLED')::int as cancelled
      from pledge_campaigns c
      left join pl on pl.campaign_id = c.id
      ${where}
      group by c.id
      order by c.is_active desc, c.starts_on desc, c.name`);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      targetAmount: r.target_amount,
      startsOn: day(r.starts_on)!,
      endsOn: day(r.ends_on),
      isActive: r.is_active,
      promised: r.promised,
      received: r.received,
      outstanding: r.outstanding,
      counts: {
        open: r.open,
        overdue: r.overdue,
        completed: r.completed,
        cancelled: r.cancelled,
      },
    }));
  }

  private async pledgeRows(where: Sql, now: string, limit = 2000): Promise<PledgeView[]> {
    const rows = await this.db.client.$queryRaw<PledgeRow[]>(sql`
      select p.id, p.campaign_id, c.name as campaign_name, p.person_id, pe.full_name, pe.phone,
             p.amount::text as amount, x.paid::text as paid, (p.amount - x.paid)::text as balance,
             p.rhythm, p.promised_on, p.due_on,
             (p.status = 'OPEN' and p.due_on < ${now}::date) as overdue,
             p.note, p.status, p.cancel_reason
      from pledges p
      join pledge_campaigns c on c.id = p.campaign_id
      left join people pe on pe.id = p.person_id
      cross join lateral (
        select coalesce(sum(pp.amount), 0) as paid from pledge_payments pp
        where pp.pledge_id = p.id and pp.status = 'POSTED'
      ) x
      ${where}
      order by (p.status = 'OPEN') desc, (p.amount - x.paid) desc, pe.full_name, p.id
      limit ${limit}`);
    return rows.map((r) => ({
      id: r.id,
      campaign: { id: r.campaign_id, name: r.campaign_name },
      person:
        r.person_id && r.full_name !== null
          ? { id: r.person_id, name: r.full_name, phoneTail: phoneTail(r.phone ?? '') }
          : null,
      amount: r.amount,
      paid: r.paid,
      balance: r.balance,
      rhythm: r.rhythm,
      promisedOn: day(r.promised_on)!,
      dueOn: day(r.due_on),
      overdue: r.overdue,
      note: r.note,
      status: r.status,
      cancelReason: r.cancel_reason,
    }));
  }

  private async withPayments(row: PledgeView): Promise<PledgeDetail> {
    const [pledge, payments] = await Promise.all([
      this.db.client.pledge.findUniqueOrThrow({
        where: { id: row.id },
        select: { recordedById: true },
      }),
      this.db.client.pledgePayment.findMany({
        where: { pledgeId: row.id },
        include: { transaction: { select: { id: true, code: true } } },
        orderBy: [{ paidOn: 'desc' }, { id: 'desc' }],
      }),
    ]);
    const requests = payments.length
      ? await this.db.client.changeRequest.findMany({
          where: {
            entityType: 'pledge_payment',
            status: 'PENDING',
            entityId: { in: payments.map((p) => p.id) },
          },
        })
      : [];
    const names = await this.userNames([
      pledge.recordedById,
      ...payments.map((p) => p.recordedById),
      ...requests.map((r) => r.requestedById),
    ]);
    return {
      ...row,
      recordedBy: names.get(pledge.recordedById) ?? null,
      payments: payments.map((p): PledgePaymentView => {
        const request = requests.find((r) => r.entityId === p.id);
        return {
          id: p.id,
          amount: p.amount.toFixed(2),
          paidOn: day(p.paidOn)!,
          method: p.method as PaymentMethod,
          note: p.note,
          status: p.status,
          transaction: p.transaction,
          recordedBy: names.get(p.recordedById) ?? null,
          recordedAt: p.createdAt.toISOString(),
          voidReason: p.voidReason,
          revision: p.revision,
          openRequest: request
            ? {
                id: request.id,
                isMine: request.requestedById === this.auth.userId,
                requestedBy: names.get(request.requestedById) ?? 'Someone',
              }
            : null,
        };
      }),
    };
  }

  private async userNames(ids: string[]): Promise<Map<string, string>> {
    const users = await this.db.client.user.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, fullName: true },
    });
    return new Map(users.map((u) => [u.id, u.fullName]));
  }

  // ── Checks ────────────────────────────────────────────────────────────

  /** Holds the pledge for the rest of the transaction: payments on it queue behind this one. */
  private async lock(tx: Tx, id: string) {
    await tx.$executeRaw`select 1 from pledges where id = ${id}::uuid for update`;
    const pledge = await tx.pledge.findUnique({
      where: { id },
      include: { campaign: { select: { name: true } } },
    });
    if (!pledge) throw notFound('No such pledge.');
    return pledge;
  }

  private checkDates(startsOn: string, endsOn: string | null) {
    if (endsOn && endsOn < startsOn) {
      throw unprocessable('It ends before it starts.', { endsOn: ['On or after the start'] });
    }
  }

  private async requireUniqueName(tx: Tx, name: string) {
    const clash = await tx.pledgeCampaign.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
    if (clash) {
      throw new AppError(409, ErrorCode.CONFLICT, `There is already a campaign called "${name}".`, {
        name: ['Choose another name'],
      });
    }
  }
}

/**
 * Marks a pledge paid in full when what stands against it reaches its
 * amount, and open again when a correction takes it back below. Worked out
 * in SQL, from the payments as they are now, inside the caller's transaction
 * and under its lock on the pledge.
 */
export async function settle(
  tx: Tx,
  pledgeId: string,
): Promise<{ status: PledgeStatus; balance: string }> {
  const [row] = await tx.$queryRaw<{ status: PledgeStatus; balance: string; paid_up: boolean }[]>(
    sql`select p.status, (p.amount - x.paid)::text as balance, x.paid >= p.amount as paid_up
        from pledges p
        cross join lateral (
          select coalesce(sum(pp.amount), 0) as paid from pledge_payments pp
          where pp.pledge_id = p.id and pp.status = 'POSTED'
        ) x
        where p.id = ${pledgeId}::uuid`,
  );
  if (!row) throw notFound('No such pledge.');
  if (row.status === 'OPEN' && row.paid_up) {
    await tx.pledge.update({
      where: { id: pledgeId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    return { status: 'COMPLETED', balance: row.balance };
  }
  if (row.status === 'COMPLETED' && !row.paid_up) {
    await tx.pledge.update({
      where: { id: pledgeId },
      data: { status: 'OPEN', completedAt: null },
    });
    return { status: 'OPEN', balance: row.balance };
  }
  return { status: row.status, balance: row.balance };
}

/**
 * A payment may point at the income entry that recorded the same money, so
 * the books and the pledge agree. The payments pointing at one entry may not
 * add up to more than it: that would be the same money counted twice.
 */
export async function checkLink(
  tx: Tx,
  transactionId: string,
  amount: string,
  exceptPaymentId: string | null,
): Promise<void> {
  const entry = await tx.financeTransaction.findUnique({ where: { id: transactionId } });
  if (!entry || entry.kind !== 'INCOME') {
    throw unprocessable('Choose an income entry.', { transactionId: ['Not an income entry'] });
  }
  if (entry.status === 'VOIDED') {
    throw unprocessable(`${entry.code} was voided.`, { transactionId: ['That entry was voided'] });
  }
  // Two clerks linking to the same Sunday's entry at once are taken in turn.
  await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${`irca:pledge-link:${transactionId}`}))`;
  const [row] = await tx.$queryRaw<{ linked: string; over: boolean }[]>(sql`
    select coalesce(sum(amount), 0)::text as linked,
           coalesce(sum(amount), 0) + ${amount}::numeric > ${entry.amount.toFixed(2)}::numeric as over
    from pledge_payments
    where transaction_id = ${transactionId}::uuid and status = 'POSTED'
      and (${exceptPaymentId}::uuid is null or id <> ${exceptPaymentId}::uuid)`);
  if (row?.over) {
    throw unprocessable(
      `${entry.code} is ${formatMoney(entry.amount.toFixed(2))}, and payments already linked to it come to ${formatMoney(row.linked)}.`,
      { transactionId: ['This would count more than the entry holds'] },
    );
  }
}

function campaignValues(row: {
  name: string;
  targetAmount: { toFixed(n: number): string } | null;
  startsOn: Date;
  endsOn: Date | null;
  isActive: boolean;
}) {
  return {
    name: row.name,
    targetAmount: row.targetAmount?.toFixed(2) ?? null,
    startsOn: day(row.startsOn),
    endsOn: day(row.endsOn),
    isActive: row.isActive,
  };
}

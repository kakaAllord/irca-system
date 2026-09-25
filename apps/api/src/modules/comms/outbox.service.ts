import { Injectable, Logger } from '@nestjs/common';
import { PrismaDb } from '../../core/database/prisma-clients.js';
import { UsageService } from '../../core/usage/usage.service.js';
import { SmsGateway } from '../../core/sms/sms.gateway.js';

/** The email outbox's back-off: a provider having a bad minute should not lose a message. */
const BACKOFF_MINUTES = [1, 5, 30, 120, 360];
const MAX_ATTEMPTS = 6;
const BATCH = 20;

/**
 * Delivers what sending wrote down, a batch at a time, as email does
 * (07 step 7.10). The application may change only the sending columns of a
 * recipient, and only the status and times of a message, so this is all it
 * ever writes.
 *
 * A number is checked against the blocked list once more just before it is
 * sent: a STOP may have come in since a scheduled message was written.
 */
@Injectable()
export class OutboxService {
  private readonly logger = new Logger('SmsOutbox');

  constructor(
    private readonly db: PrismaDb,
    private readonly gateway: SmsGateway,
    private readonly usage: UsageService,
  ) {}

  async sendDue(): Promise<{ sent: number; failed: number; leftAlone: number }> {
    // Anything left mid-send by a crash is due again.
    await this.db.$executeRaw`
      update comms_recipients set status = 'PENDING'
      where status = 'SENDING' and next_attempt_at < now() - interval '10 minutes'`;

    const due = await this.db.$queryRaw<{ id: string }[]>`
      select r.id from comms_recipients r
      join comms_messages m on m.id = r.message_id and m.status in ('SCHEDULED', 'SENDING')
      where r.status = 'PENDING' and r.next_attempt_at <= now()
      order by r.next_attempt_at
      limit ${BATCH}`;
    if (!due.length) return { sent: 0, failed: 0, leftAlone: 0 };

    const claimed = await this.db.commsRecipient.updateManyAndReturn({
      where: { id: { in: due.map((d) => d.id) }, status: 'PENDING' },
      data: { status: 'SENDING', attempts: { increment: 1 } },
    });
    const messageIds = [...new Set(claimed.map((r) => r.messageId))];
    await this.db.commsMessage.updateMany({
      where: { id: { in: messageIds }, status: 'SCHEDULED' },
      data: { status: 'SENDING' },
    });
    await this.db.commsMessage.updateMany({
      where: { id: { in: messageIds }, startedAt: null },
      data: { startedAt: new Date() },
    });

    const blocked = new Set(
      (
        await this.db.commsBlockedNumber.findMany({
          where: { phone: { in: claimed.map((r) => r.phone) } },
          select: { phone: true },
        })
      ).map((b) => b.phone),
    );
    const { provider, senderId } = await this.gateway.current();

    let sent = 0;
    let failed = 0;
    let leftAlone = 0;
    for (const row of claimed) {
      if (blocked.has(row.phone)) {
        await this.db.commsRecipient.update({
          where: { id: row.id },
          data: { status: 'SKIPPED_OPT_OUT' },
        });
        leftAlone++;
        continue;
      }
      const result = await provider.send({ to: row.phone, body: row.body, senderId });
      if (result.accepted) {
        await this.db.commsRecipient.update({
          where: { id: row.id },
          data: {
            status: 'SENT',
            sentAt: new Date(),
            providerMessageId: result.providerMessageId,
            lastError: null,
          },
        });
        sent++;
        continue;
      }
      failed++;
      if (result.permanent || row.attempts >= MAX_ATTEMPTS) {
        await this.db.commsRecipient.update({
          where: { id: row.id },
          data: { status: 'FAILED', lastError: result.error.slice(0, 500) },
        });
        if (result.permanent)
          await this.block(row.phone, 'invalid number', row.personId, result.error);
        this.usage.inc('sms.failed');
        continue;
      }
      const minutes = BACKOFF_MINUTES[Math.min(row.attempts - 1, BACKOFF_MINUTES.length - 1)]!;
      await this.db.commsRecipient.update({
        where: { id: row.id },
        data: {
          status: 'PENDING',
          nextAttemptAt: new Date(Date.now() + minutes * 60_000),
          lastError: result.error.slice(0, 500),
        },
      });
      this.logger.warn({ msg: 'sms not sent, will try again', minutes, id: row.id });
    }
    if (sent) this.usage.inc('sms.sent', sent);
    await this.finish(messageIds);
    return { sent, failed, leftAlone };
  }

  /**
   * Beem reports delivery when asked, not by calling us (docs.beem.africa,
   * 24 Sept 2026), no sooner than five minutes after sending. Asked for two
   * days; after that a message is left as sent.
   */
  async pollDelivery(): Promise<{ delivered: number; undelivered: number }> {
    const { provider } = await this.gateway.current();
    const rows = await this.db.commsRecipient.findMany({
      where: {
        status: 'SENT',
        providerMessageId: { not: null },
        sentAt: {
          lt: new Date(Date.now() - 5 * 60_000),
          gt: new Date(Date.now() - 2 * 86_400_000),
        },
      },
      orderBy: { sentAt: 'asc' },
      take: 50,
    });
    let delivered = 0;
    let undelivered = 0;
    for (const row of rows) {
      const status = await provider.delivery(row.providerMessageId!, row.phone).catch(() => null);
      if (status === 'DELIVERED') {
        await this.db.commsRecipient.update({
          where: { id: row.id },
          data: { status: 'DELIVERED', deliveredAt: new Date() },
        });
        delivered++;
      } else if (status === 'UNDELIVERED') {
        // A phone that is off for a day is not a dead number, so it is not
        // blocked; the sender sees it failed and can try again.
        await this.db.commsRecipient.update({
          where: { id: row.id },
          data: { status: 'FAILED', lastError: 'The carrier could not deliver it.' },
        });
        undelivered++;
      }
    }
    if (delivered) this.usage.inc('sms.delivered', delivered);
    if (undelivered) this.usage.inc('sms.failed', undelivered);
    return { delivered, undelivered };
  }

  /** The credit left, for the dev console and the alert before a Sunday (D25). */
  async readBalance(): Promise<{ credit: string | null }> {
    const { provider } = await this.gateway.current();
    const balance = await provider.balance();
    if (balance) this.usage.gauge('sms.balance', Math.round(Number(balance.amount)));
    return { credit: balance?.amount ?? null };
  }

  /** A message with nothing left to send is finished: sent, partly sent, or failed. */
  private async finish(messageIds: string[]) {
    for (const id of messageIds) {
      const counts = await this.db.commsRecipient.groupBy({
        by: ['status'],
        where: { messageId: id },
        _count: { _all: true },
      });
      const n = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
      if (n('PENDING') || n('SENDING')) continue;
      const ok = n('SENT') + n('DELIVERED');
      const bad = n('FAILED');
      await this.db.commsMessage.updateMany({
        where: { id, status: 'SENDING' },
        data: {
          status: bad === 0 ? 'SENT' : ok === 0 ? 'FAILED' : 'PARTIAL',
          finishedAt: new Date(),
        },
      });
    }
  }

  private async block(phone: string, reason: string, personId: string | null, note: string) {
    await this.db.commsBlockedNumber.upsert({
      where: { phone },
      update: {},
      create: { phone, reason, personId, note: note.slice(0, 200) },
    });
  }
}

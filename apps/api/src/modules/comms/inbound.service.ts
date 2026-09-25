import { timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ErrorCode, isStop } from '@irca/shared';
import { AppConfig } from '../../config/app-config.js';
import { Db } from '../../core/database/db.service.js';
import { AppError } from '../../core/http/app-error.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { UsageService } from '../../core/usage/usage.service.js';
import { toE164 } from '../../core/sms/phone.js';
import { sql } from '../../core/database/sql.js';

/** What Beem sends when someone replies (docs.beem.africa, two-way SMS, 24 Sept 2026). */
export type BeemReply = {
  from?: string;
  to?: string;
  transaction_id?: string;
  message?: { text?: string };
  [key: string]: unknown;
};

/**
 * Replies, passed on by Beem (07 step 7.12).
 *
 * Whatever arrives is written down exactly as it came before anything else
 * is done with it, so a shape nobody expected can be read later instead of
 * lost. A reply that says STOP, in any of the church's languages, blocks the
 * number for good and marks the person or staff account as not wanting
 * messages; nothing is sent back. Any other reply is kept for Communications
 * to read: someone answering a reminder deserves to be read.
 */
@Injectable()
export class InboundService {
  private readonly logger = new Logger('SmsInbound');

  constructor(
    private readonly db: Db,
    private readonly config: AppConfig,
    private readonly audit: AuditService,
    private readonly usage: UsageService,
  ) {}

  /** The secret in the URL given to Beem, compared without leaking its length or content by timing. */
  checkSecret(given: string | undefined): void {
    const secret = this.config.get('BEEM_INBOUND_SECRET');
    const a = Buffer.from(given ?? '');
    const b = Buffer.from(secret ?? '');
    if (!secret || a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new AppError(401, ErrorCode.UNAUTHENTICATED, 'Not a reply from our SMS provider.');
    }
  }

  async reply(payload: BeemReply) {
    const text = String(payload.message?.text ?? '').slice(0, 1000);
    const from = String(payload.from ?? '').replace(/\D/g, '');
    const phone = from ? (toE164('', `+${from}`) ?? `+${from}`) : '';
    const stop = isStop(text);
    const action = !phone ? 'not understood' : stop ? 'opted out' : 'kept';

    // Written first, on its own, so it is kept even if what follows fails.
    await this.db.client.commsInbound.create({
      data: {
        kind: 'reply',
        phone: phone.slice(0, 20),
        body: text,
        action,
        raw: payload as object,
      },
    });

    if (stop && phone) await this.optOut(phone);
    this.usage.inc(stop ? 'sms.replies.stop' : 'sms.replies');
    return { transaction_id: payload.transaction_id ?? null, successful: true };
  }

  /** Blocks the number, and says so on every person and account that has it. */
  private async optOut(phone: string) {
    const tail = phone.slice(-9);
    await this.db.tx(async (tx) => {
      // Numbers are kept as typed ("0713 000 111"), so they are matched on
      // their digits, then checked exactly.
      const people = (
        await tx.$queryRaw<{ id: string; dial: string; phone: string }[]>(
          sql`select id, dial, phone from people
              where regexp_replace(phone, '\\D', '', 'g') like ${`%${tail}`}`,
        )
      ).filter((p) => toE164(p.dial, p.phone) === phone);
      const users = (
        await tx.$queryRaw<{ id: string; phone: string }[]>(
          sql`select id, phone from users
              where regexp_replace(coalesce(phone, ''), '\\D', '', 'g') like ${`%${tail}`}`,
        )
      ).filter((u) => toE164('+255', u.phone) === phone);

      await tx.commsBlockedNumber.upsert({
        where: { phone },
        update: {},
        create: { phone, reason: 'replied STOP', personId: people[0]?.id ?? null },
      });
      if (people.length) {
        await tx.person.updateMany({
          where: { id: { in: people.map((p) => p.id) }, smsOptOut: false },
          data: { smsOptOut: true, smsOptOutAt: new Date(), smsOptOutSource: 'reply' },
        });
      }
      if (users.length) {
        await tx.user.updateMany({
          where: { id: { in: users.map((u) => u.id) } },
          data: { smsOptOut: true },
        });
      }
      // Who, without the number: the log is read more widely than People.
      await this.audit.recordIn(tx, {
        action: 'comms.opted_out',
        entityType: people[0] ? 'person' : 'comms',
        entityId: people[0]?.id ?? 'inbound',
        summary: `A reply of STOP: ${people.length + users.length || 'no'} record${people.length + users.length === 1 ? '' : 's'} with that number will not be messaged again`,
      });
    });
    this.logger.log({ msg: 'number opted out by reply', number: `…${phone.slice(-3)}` });
  }
}

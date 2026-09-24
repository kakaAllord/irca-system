import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaDb } from '../database/prisma-clients.js';
import { UsageService } from '../usage/usage.service.js';
import { EMAIL_PROVIDER, type EmailProvider } from './email.types.js';
import { TEMPLATES, type TemplateName } from './templates/index.js';

/** Grows with each try: a provider having a bad minute should not lose a message. */
const BACKOFF_MINUTES = [1, 5, 30, 120, 360];
const MAX_ATTEMPTS = 6;
/** At most this many a round, so a long queue is sent in steps rather than all at once. */
const BATCH = 20;

type Enqueue = {
  to: string;
  template: TemplateName;
  payload: Record<string, unknown>;
};

/** The parts of a transaction this service needs, so callers can pass theirs. */
type TxLike = { emailOutbox: { create: (args: { data: never }) => Promise<unknown> } };

/**
 * Email, written down first and sent afterwards.
 *
 * An invitation and its email are written in one transaction, so the
 * invitation can never exist without the email being owed, or the other way
 * round. A worker sends what is owed, retries what fails, and gives up loudly
 * rather than quietly.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger('Email');

  constructor(
    private readonly db: PrismaDb,
    private readonly usage: UsageService,
    @Inject(EMAIL_PROVIDER) private readonly provider: EmailProvider,
  ) {}

  /** Queue an email as part of the change that causes it. */
  async enqueue(tx: TxLike, email: Enqueue): Promise<void> {
    await tx.emailOutbox.create({
      data: {
        toEmail: email.to,
        template: email.template,
        payload: email.payload,
      } as never,
    });
  }

  /** Queue an email that belongs to no particular change. */
  async enqueueNow(email: Enqueue): Promise<void> {
    await this.enqueue(this.db as unknown as TxLike, email);
  }

  /** Sends what is due, oldest first, a batch at a time. */
  async sendDue(): Promise<{ sent: number; failed: number }> {
    // Anything left mid-send by a crash is due again.
    await this.db.$executeRaw`
      update email_outbox set status = 'PENDING'
      where status = 'SENDING' and next_attempt_at < now() - interval '10 minutes'`;

    const due = await this.db.$queryRaw<{ id: string }[]>`
      select id from email_outbox
      where status = 'PENDING' and next_attempt_at <= now()
      order by created_at
      limit ${BATCH}`;
    if (!due.length) return { sent: 0, failed: 0 };

    const claimed = await this.db.emailOutbox.updateManyAndReturn({
      where: { id: { in: due.map((d) => d.id) }, status: 'PENDING' },
      data: { status: 'SENDING', attempts: { increment: 1 } },
    });

    let sent = 0;
    let failed = 0;
    for (const row of claimed) {
      const render = TEMPLATES[row.template as TemplateName];
      if (!render) {
        await this.giveUp(row.id, `no template called ${row.template}`);
        failed++;
        continue;
      }
      // Types are checked where the email is queued; here the payload is data.
      const message = render(row.payload as never);
      try {
        const { messageId } = await this.provider.send({ to: row.toEmail, ...message });
        await this.db.emailOutbox.update({
          where: { id: row.id },
          data: {
            status: 'SENT',
            sentAt: new Date(),
            subject: message.subject,
            providerMessageId: messageId,
            // One-time links must not sit in the database after they are sent.
            payload: scrubLinks(row.payload),
          },
        });
        this.usage.inc('email.sent', 1);
        sent++;
      } catch (err) {
        failed++;
        const attempts = row.attempts;
        if (attempts >= MAX_ATTEMPTS) {
          await this.giveUp(row.id, (err as Error).message);
          this.usage.inc('email.failed', 1);
          continue;
        }
        const minutes = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)]!;
        await this.db.emailOutbox.update({
          where: { id: row.id },
          data: {
            status: 'PENDING',
            nextAttemptAt: new Date(Date.now() + minutes * 60_000),
            lastError: (err as Error).message.slice(0, 500),
          },
        });
        this.usage.inc('email.retries', 1);
        this.logger.warn({ msg: 'email not sent, will try again', minutes, id: row.id });
      }
    }
    return { sent, failed };
  }

  private async giveUp(id: string, error: string) {
    await this.db.emailOutbox.update({
      where: { id },
      data: { status: 'FAILED', lastError: error.slice(0, 500) },
    });
    this.logger.error({ msg: 'email given up on', id, error });
  }
}

function scrubLinks(payload: unknown): object {
  if (!payload || typeof payload !== 'object') return {};
  return Object.fromEntries(
    Object.entries(payload as Record<string, unknown>).map(([k, v]) => [
      k,
      k.toLowerCase().includes('link') ? '[sent]' : v,
    ]),
  );
}

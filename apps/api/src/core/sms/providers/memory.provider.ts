import { Injectable } from '@nestjs/common';
import type { DeliveryStatus, SmsProvider, SmsResult, SmsSend } from '../sms.types.js';

/**
 * Tests: kept in memory for the test to read, never sent. A test can make the
 * next sends fail, and say what the carrier will report about delivery.
 */
@Injectable()
export class MemorySmsProvider implements SmsProvider {
  readonly name = 'memory' as const;
  readonly sent: (SmsSend & { id: string })[] = [];
  /** Consumed one per send: the next sends fail with these. */
  readonly failures: { error: string; permanent: boolean }[] = [];
  /** What delivery() answers, by provider id. */
  readonly deliveries = new Map<string, DeliveryStatus>();
  credit = '100000.00';

  async send(message: SmsSend): Promise<SmsResult> {
    const failure = this.failures.shift();
    if (failure) return { accepted: false, ...failure };
    const id = `memory-${this.sent.length + 1}`;
    this.sent.push({ ...message, id });
    return { accepted: true, providerMessageId: id };
  }

  async balance() {
    return { amount: this.credit };
  }

  async delivery(providerMessageId: string): Promise<DeliveryStatus | null> {
    return this.deliveries.get(providerMessageId) ?? null;
  }

  reset() {
    this.sent.length = 0;
    this.failures.length = 0;
    this.deliveries.clear();
  }
}

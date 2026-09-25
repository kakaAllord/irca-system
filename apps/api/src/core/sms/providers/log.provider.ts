import { Injectable, Logger } from '@nestjs/common';
import type { SmsProvider, SmsResult, SmsSend } from '../sms.types.js';

/**
 * Development, and production until Communications saves a Beem account:
 * nothing leaves the building. A laptop running the app must never be able
 * to text a real church member by accident. The number is shortened in the
 * log, which is read in the dev console.
 */
@Injectable()
export class LogSmsProvider implements SmsProvider {
  readonly name = 'log' as const;
  private readonly logger = new Logger('Sms');

  async send(message: SmsSend): Promise<SmsResult> {
    this.logger.log(`sms to …${message.to.slice(-3)} from ${message.senderId}: ${message.body}`);
    return {
      accepted: true,
      providerMessageId: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
  }

  async balance() {
    return null;
  }

  async delivery() {
    return null;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import type { EmailMessage, EmailProvider } from '../email.types.js';

/**
 * Development: nothing is sent. The subject, the recipient and every link in
 * the message are printed, so an invitation can be followed from the terminal.
 */
@Injectable()
export class LogEmailProvider implements EmailProvider {
  readonly name = 'log';
  private readonly logger = new Logger('Email');

  async send(message: EmailMessage): Promise<{ messageId: string }> {
    const links = [...message.text.matchAll(/https?:\/\/\S+/g)].map((m) => m[0]);
    this.logger.log(`email to ${message.to}: ${message.subject}`);
    for (const link of links) this.logger.log(`  link: ${link}`);
    return { messageId: `log-${Date.now()}` };
  }
}

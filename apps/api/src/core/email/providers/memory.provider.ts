import { Injectable } from '@nestjs/common';
import type { EmailMessage, EmailProvider } from '../email.types.js';

/** Tests: kept in memory and read back through the test-only endpoint. */
@Injectable()
export class MemoryEmailProvider implements EmailProvider {
  readonly name = 'memory';
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<{ messageId: string }> {
    this.sent.push(message);
    return { messageId: `memory-${this.sent.length}` };
  }
}

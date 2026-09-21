import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../../config/app-config.js';
import type { EmailMessage, EmailProvider } from '../email.types.js';

/** Production. Failures throw, and the outbox retries with growing delays. */
@Injectable()
export class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend';

  constructor(private readonly config: AppConfig) {}

  async send(message: EmailMessage): Promise<{ messageId: string }> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.config.get('RESEND_API_KEY')}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: this.config.get('EMAIL_FROM'),
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });
    if (!res.ok) throw new Error(`resend refused the message: ${res.status} ${await res.text()}`);
    const body = (await res.json()) as { id?: string };
    return { messageId: body.id ?? 'unknown' };
  }
}

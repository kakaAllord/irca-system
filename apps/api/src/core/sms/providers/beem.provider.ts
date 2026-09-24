import type { DeliveryStatus, SmsProvider, SmsResult, SmsSend } from '../sms.types.js';

/**
 * Beem Africa, the church's one SMS account (D26). Made afresh for every use
 * from the account in the database, so a key Communications changed a minute
 * ago is the one used now.
 *
 * Checked against docs.beem.africa on 24 Sept 2026: send is POST
 * apisms.beem.africa/v1/send with Basic auth (key:secret), the number in
 * international form without the '+', and `code: 100` meaning accepted;
 * delivery is asked for, at dlrapi.beem.africa, not pushed to us; the credit
 * is at /public/v1/vendors/balance.
 */
export class BeemSmsProvider implements SmsProvider {
  readonly name = 'beem' as const;
  private readonly auth: string;

  constructor(
    key: string,
    secret: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.auth = `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`;
  }

  async send(message: SmsSend): Promise<SmsResult> {
    let res: Response;
    try {
      res = await this.fetchImpl('https://apisms.beem.africa/v1/send', {
        method: 'POST',
        headers: { authorization: this.auth, 'content-type': 'application/json' },
        body: JSON.stringify({
          source_addr: message.senderId,
          encoding: 0,
          schedule_time: '',
          message: message.body,
          recipients: [{ recipient_id: 1, dest_addr: message.to.replace(/^\+/, '') }],
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      return {
        accepted: false,
        error: `Beem did not answer: ${(err as Error).message}`,
        permanent: false,
      };
    }
    const body = (await res.json().catch(() => ({}))) as {
      successful?: boolean;
      request_id?: string | number;
      code?: number;
      message?: string;
      invalid?: number;
    };
    if (res.ok && body.successful && body.code === 100 && body.request_id !== undefined) {
      return { accepted: true, providerMessageId: String(body.request_id) };
    }
    const error = `Beem ${res.status}${body.code ? ` (${body.code})` : ''}: ${body.message ?? 'refused'}`;
    // An invalid number stays invalid. Bad credentials or a bad sender name do
    // not get better by themselves either, but they are the church's to fix,
    // not the number's, so they are retried until someone does.
    return { accepted: false, error, permanent: (body.invalid ?? 0) > 0 };
  }

  async balance() {
    const res = await this.fetchImpl('https://apisms.beem.africa/public/v1/vendors/balance', {
      headers: { authorization: this.auth },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Beem answered ${res.status} for the balance`);
    const body = (await res.json()) as { data?: { credit_balance?: number } };
    const credit = body.data?.credit_balance;
    return typeof credit === 'number' ? { amount: credit.toFixed(2) } : null;
  }

  async delivery(providerMessageId: string, to: string): Promise<DeliveryStatus | null> {
    const url = new URL('https://dlrapi.beem.africa/public/v1/delivery-reports');
    url.searchParams.set('dest_addr', to.replace(/^\+/, ''));
    url.searchParams.set('request_id', providerMessageId);
    const res = await this.fetchImpl(url, {
      headers: { authorization: this.auth },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const rows = (await res.json().catch(() => [])) as { status?: string }[];
    const status = (Array.isArray(rows) ? rows[0]?.status : undefined)?.toUpperCase();
    return status === 'DELIVERED' || status === 'UNDELIVERED' || status === 'PENDING'
      ? status
      : null;
  }
}

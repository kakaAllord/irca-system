/** One text to one number. `to` is E.164. */
export type SmsSend = { to: string; body: string; senderId: string };

export type SmsResult =
  | { accepted: true; providerMessageId: string }
  /** `permanent`: trying again will not help (a barred or impossible number). */
  | { accepted: false; error: string; permanent: boolean };

/** What the carrier last said about one message. */
export type DeliveryStatus = 'PENDING' | 'DELIVERED' | 'UNDELIVERED';

export interface SmsProvider {
  readonly name: 'memory' | 'log' | 'beem';
  send(message: SmsSend): Promise<SmsResult>;
  /** Credit left, or null when the provider cannot say. */
  balance(): Promise<{ amount: string } | null>;
  /** Beem reports delivery when asked, not by calling us. Null: cannot say. */
  delivery(providerMessageId: string, to: string): Promise<DeliveryStatus | null>;
}

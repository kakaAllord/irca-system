export type EmailMessage = {
  to: string;
  subject: string;
  /** Always sent: some people, and some clients, never see the HTML. */
  text: string;
  html: string;
};

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<{ messageId: string }>;
}

export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');

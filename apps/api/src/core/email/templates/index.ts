import type { EmailMessage } from '../email.types.js';

type Rendered = Omit<EmailMessage, 'to'>;

/**
 * One centred column, inline styles only, because email clients ignore
 * stylesheets, and always a plain-text version beside the HTML.
 */
function layout(title: string, lines: string[], action?: { label: string; url: string }): string {
  const paragraphs = lines.map((l) => `<p style="margin:0 0 14px">${l}</p>`).join('');
  const button = action
    ? `<p style="margin:22px 0"><a href="${action.url}" style="background:#1C1C1C;color:#FAF8F4;text-decoration:none;padding:11px 18px;border-radius:7px;display:inline-block">${action.label}</a></p>
       <p style="margin:0 0 14px;font-size:12px;color:#8A8578">If the button does not work, copy this link:<br>${action.url}</p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#FAF8F4;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1C1C1C">
  <div style="max-width:520px;margin:0 auto;padding:28px 20px">
    <h1 style="font-size:18px;margin:0 0 16px">${title}</h1>
    <div style="font-size:14px;line-height:1.55">${paragraphs}${button}</div>
  </div></body></html>`;
}

export type InvitationPayload = {
  churchName: string;
  inviterName: string;
  personName: string;
  roleSummary: string;
  link: string;
  expiresOn: string;
  needsPassword: boolean;
};

export type PasswordResetPayload = { personName: string; link: string; hours: number };

export type DecisionPayload = {
  personName: string;
  what: string;
  decision: 'approved' | 'rejected';
  note?: string;
  link: string;
};

export type RequestSubmittedPayload = {
  requesterName: string;
  what: string;
  change: string;
  reason: string;
  link: string;
};

export const TEMPLATES = {
  invitation: (p: InvitationPayload): Rendered => ({
    subject: `You've been given access to ${p.churchName}`,
    text: [
      `Hello ${p.personName},`,
      '',
      `${p.inviterName} has given you access to ${p.churchName} as ${p.roleSummary}.`,
      '',
      p.needsPassword ? 'Set your password to get started:' : 'Open the portal to get started:',
      p.link,
      '',
      `This link works once and expires on ${p.expiresOn}.`,
      "If you weren't expecting this, you can ignore this email and nothing will happen.",
    ].join('\n'),
    html: layout(
      `Hello ${p.personName},`,
      [
        `<strong>${p.inviterName}</strong> has given you access to <strong>${p.churchName}</strong> as ${p.roleSummary}.`,
        `This link works once and expires on ${p.expiresOn}. If you weren't expecting this, you can ignore this email and nothing will happen.`,
      ],
      { label: p.needsPassword ? 'Set your password' : 'Open the portal', url: p.link },
    ),
  }),

  'password-reset': (p: PasswordResetPayload): Rendered => ({
    subject: 'Reset your IRCA Admin password',
    text: [
      `Hello ${p.personName},`,
      '',
      'Use this link to choose a new password:',
      p.link,
      '',
      `It works once and expires in ${p.hours} hour${p.hours === 1 ? '' : 's'}.`,
      'If you did not ask for this, ignore this email. Your password stays as it is.',
    ].join('\n'),
    html: layout(
      `Hello ${p.personName},`,
      [
        `This link works once and expires in ${p.hours} hour${p.hours === 1 ? '' : 's'}.`,
        'If you did not ask for this, ignore this email. Your password stays as it is.',
      ],
      { label: 'Choose a new password', url: p.link },
    ),
  }),

  'change-request-submitted': (p: RequestSubmittedPayload): Rendered => ({
    subject: `${p.requesterName} asks to change ${p.what}`,
    text: [
      `${p.requesterName} asks to change ${p.what}.`,
      '',
      p.change,
      `Reason: ${p.reason}`,
      '',
      'Review it here:',
      p.link,
    ].join('\n'),
    html: layout(`${p.requesterName} asks to change ${p.what}`, [p.change, `Reason: ${p.reason}`], {
      label: 'Review the request',
      url: p.link,
    }),
  }),

  'change-request-decided': (p: DecisionPayload): Rendered => ({
    subject: `Your change to ${p.what} was ${p.decision}`,
    text: [
      `Hello ${p.personName},`,
      '',
      `Your change to ${p.what} was ${p.decision}.`,
      p.note ? `Note: ${p.note}` : '',
      '',
      p.link,
    ]
      .filter(Boolean)
      .join('\n'),
    html: layout(
      `Your change to ${p.what} was ${p.decision}`,
      [p.note ? `Note: ${p.note}` : 'No note was left.'],
      { label: 'Open it', url: p.link },
    ),
  }),
} as const;

export type TemplateName = keyof typeof TEMPLATES;

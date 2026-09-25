import type { SmsLang } from '@irca/shared';

/** What the Communications API sends, as the portal reads it. */

export const LANG_LABEL: Record<SmsLang, string> = {
  sw: 'Kiswahili',
  en: 'English',
  fr: 'Français',
};

export type AudienceChoice = {
  key: string;
  label: string;
  description: string;
  scope: 'church' | 'department';
};

export type AudienceOptions = {
  audiences: AudienceChoice[];
  departments: { id: string; name: string }[];
  groups: { id: string; name: string }[];
};

export type Audience = { key: string; params: Record<string, unknown> };

export type TemplateStatus = 'DRAFT' | 'PENDING' | 'ACTIVE' | 'REJECTED' | 'RETIRED';

export type Template = {
  id: string;
  familyId: string;
  version: number;
  name: string;
  status: TemplateStatus;
  department: { id: string; name: string } | null;
  fields: string[];
  bodies: Partial<Record<SmsLang, string>>;
  createdAt: string;
  submittedAt: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdById: string;
  submittedById: string | null;
};

export type Preview = {
  audienceName: string;
  reach: number;
  leftAlone: { optedOut: number; noPhone: number; duplicate: number; recent: number };
  segments: number;
  pricePerSegment: string;
  cost: string;
  costText: string;
  spentToday: string;
  dailyCap: string | null;
  scheduledFor: string | null;
  samples: {
    lang: SmsLang;
    people: number;
    text: string;
    segments: number;
    encoding: string | null;
  }[];
  problem: string | null;
};

export type MessageStatus = 'SCHEDULED' | 'SENDING' | 'SENT' | 'PARTIAL' | 'FAILED' | 'CANCELLED';

export type MessageRow = {
  id: string;
  department: { id: string; name: string } | null;
  audienceName: string;
  template: { id: string; name: string; version: number } | null;
  status: MessageStatus;
  createdAt: string;
  scheduledFor: string | null;
  recipientCount: number;
  skippedCount: number;
  segments: number;
  cost: string;
  byStatus: Record<string, number>;
  fromBeat: boolean;
};

export type MessageDetail = Omit<MessageRow, 'recipientCount' | 'skippedCount' | 'fromBeat'> & {
  bodies: Partial<Record<SmsLang, string>>;
  fields: Record<string, string>;
  createdBy: string | null;
  finishedAt: string | null;
  recipients: {
    id: string;
    name: string;
    phone: string;
    lang: SmsLang;
    status: string;
    segments: number;
    error: string | null;
    sentAt: string | null;
    deliveredAt: string | null;
  }[];
};

export type Schedule = {
  id: string;
  name: string;
  department: { id: string; name: string } | null;
  audienceName: string;
  audience: Audience;
  templates: { id: string; name: string; status: TemplateStatus }[];
  templateIds: string[];
  fields: Record<string, string>;
  daysOfWeek: number[];
  /** Empty: every week. [1]: the first of those days in each month. */
  weeksOfMonth: number[];
  timeOfDay: string;
  jitterMinutes: number;
  startsOn: string;
  endsOn: string | null;
  isActive: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastError: string | null;
  lastMessage: { id: string; at: string; status: MessageStatus } | null;
};

export const MESSAGE_STATUS: Record<
  MessageStatus,
  { label: string; tone: 'accent' | 'positive' | 'danger' | 'muted' | 'neutral' }
> = {
  SCHEDULED: { label: 'Scheduled', tone: 'accent' },
  SENDING: { label: 'Sending', tone: 'accent' },
  SENT: { label: 'Sent', tone: 'positive' },
  PARTIAL: { label: 'Partly sent', tone: 'danger' },
  FAILED: { label: 'Failed', tone: 'danger' },
  CANCELLED: { label: 'Stopped', tone: 'muted' },
};

export const RECIPIENT_STATUS: Record<string, string> = {
  PENDING: 'Waiting',
  SENDING: 'Sending',
  SENT: 'Sent',
  DELIVERED: 'Delivered',
  FAILED: 'Failed',
  CANCELLED: 'Stopped',
  SKIPPED_OPT_OUT: 'Left alone: asked not to be messaged',
  SKIPPED_NO_PHONE: 'Left alone: no usable number',
  SKIPPED_DUPLICATE: 'Left alone: same number as someone above',
  SKIPPED_RECENT: 'Left alone: this reminder reached them lately',
};

/** "25 Sept, 18:04", in the church's own time. */
export const when = (iso: string, timeZone?: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  });

/** "4,290" from "4290.00". */
export const money = (value: string | number) =>
  Number(value).toLocaleString('en-GB', { maximumFractionDigits: 2 });

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Which of a month's weeks a beat sends in: 'first' for [1]. */
export const WEEKS = ['first', 'second', 'third', 'fourth'];

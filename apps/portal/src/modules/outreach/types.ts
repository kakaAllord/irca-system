import type { Stage } from '../membership/types';

/** What the Outreach API sends, as the portal reads it (Phase 8). */

export type TeamPerson = {
  personId: string;
  name: string;
  stage: Stage;
  phoneTail: string;
  /** Their title when they lead the department; null for a member. */
  title: string | null;
  since: string;
  group: string | null;
  /** Saturdays out in the last three months. */
  saturdays: number;
  training: { attended: number; of: number };
};

export type PartnerGroup = {
  id: string;
  name: string;
  active: boolean;
  people: { personId: string; name: string }[];
};

export type Team = {
  department: { id: string; name: string };
  youLead: boolean;
  people: TeamPerson[];
  groups: PartnerGroup[];
};

export type SessionStatus = 'PLANNED' | 'COMPLETED' | 'CANCELLED';

export const STATUS_LABEL: Record<SessionStatus, string> = {
  PLANNED: 'Planned',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export type SessionRow = {
  id: string;
  heldOn: string;
  title: string;
  status: SessionStatus;
  areas: string[];
  teams: number;
  people: number;
  reached: number;
  spokenToOnly: number;
};

export type SessionTeam = {
  id: string;
  area: string;
  group: { id: string; name: string } | null;
  notes: string;
  spokenToOnly: number;
  reached: number;
  people: { personId: string; name: string }[];
};

export type Session = {
  id: string;
  heldOn: string;
  title: string;
  status: SessionStatus;
  notes: string;
  createdBy: string | null;
  reached: number;
  teams: SessionTeam[];
};

export type ReachedRow = {
  id: string;
  personId: string;
  name: string;
  phone: string;
  area: string;
  reachedOn: string;
  reachedBy: string[];
  needsFollowUp: boolean;
  note: string;
  session: { id: string; title: string; heldOn: string } | null;
  thin: { phone: boolean; area: boolean };
};

export type ReachedPage = { total: number; pageSize: number; rows: ReachedRow[] };

/** "Sat 26 Sep 2026", from '2026-09-26', without the browser's timezone moving the day. */
export const longDay = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

/** "26 Sep", for lists. */
export const shortDay = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

/** Today where the church is, as '2026-09-26': a Saturday evening in Arusha is not Sunday. */
export const churchToday = (timezone = 'Africa/Dar_es_Salaam') =>
  new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());

export type ReachedPerson = {
  id: string;
  name: string;
  phone: string;
  stage: import('../membership/types').Stage;
  lang: string;
  optedOut: boolean;
  needsFollowUp: boolean;
  reaches: {
    id: string;
    reachedOn: string;
    area: string;
    note: string;
    needsFollowUp: boolean;
    reachedBy: string[];
    session: { id: string; title: string; heldOn: string } | null;
  }[];
  timeline: import('../membership/Timeline').TimelineLine[];
};

export type PendingFollowUp = {
  personId: string;
  name: string;
  phone: string;
  reachedOn: string;
  area: string;
  followups: number;
  last: { summary: string; at: string } | null;
};

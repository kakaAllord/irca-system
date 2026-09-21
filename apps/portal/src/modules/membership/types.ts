/** What the Membership API sends, as the portal reads it. */

export type Stage =
  | 'VISITOR'
  | 'NEW_CONVERT'
  | 'FOUNDATION_CLASS'
  | 'AWAITING_BAPTISM'
  | 'MEMBERSHIP_REVIEW'
  | 'CONFIRMED_MEMBER';

export const STAGE_LABEL: Record<Stage, string> = {
  VISITOR: 'Visitor',
  NEW_CONVERT: 'New convert',
  FOUNDATION_CLASS: 'Foundation class',
  AWAITING_BAPTISM: 'Awaiting baptism',
  MEMBERSHIP_REVIEW: 'Membership review',
  CONFIRMED_MEMBER: 'Confirmed member',
};

export const STAGE_ORDER: Stage[] = [
  'VISITOR',
  'NEW_CONVERT',
  'FOUNDATION_CLASS',
  'AWAITING_BAPTISM',
  'MEMBERSHIP_REVIEW',
  'CONFIRMED_MEMBER',
];

export type Flag = { value: boolean; source: 'office' | 'form' | 'none' };

export type PersonRow = {
  id: string;
  fullName: string;
  initials: string;
  phone: string;
  registeredAt: string;
  gender: string;
  ageGroup: string;
  livesIn: string;
  interestedIn: string[];
  heardVia: string[];
  stage: Stage;
  saved: Flag;
  baptised: Flag;
  complete: boolean;
  progress: { answered: number; of: number } | null;
  hasRegistration: boolean;
};

export type PersonDetail = PersonRow & {
  occupation: { kind: string; detail: string };
  visit: string[];
  registration: {
    token: string;
    lang: 'en' | 'sw' | 'fr';
    status: 'in_progress' | 'submitted';
    submittedAt: string | null;
  } | null;
  savedBy: string | null;
  baptisedBy: string | null;
  memberNumber: number | null;
  history: { at: string; from: Stage | null; to: Stage; by: string; note: string | null }[];
  sensitive?: {
    email: string;
    dob: string;
    faith: {
      saved: boolean | null;
      savedYear: string;
      baptised: boolean | null;
      baptisedYear: string;
      holySpirit: boolean | null;
      previousChurch: string | null;
    };
    family: { marital: string; marriedYear: string; children: string[] };
    ministries: string[];
    liked: string;
    prayer: string;
  };
  notes?: { id: string; kind: 'NOTE' | 'VISIT' | 'CALL'; body: string; at: string; by: string }[];
};

export type Group = { id: string; name: string; isActive: boolean };

/** "2 hours ago", "yesterday", "3 Sept". */
export function when(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  return day(iso);
}

export const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** How a saved or baptised flag reads, with where it came from. */
export function flagLabel(flag: Flag, by: string | null, word: string): string {
  if (!flag.value)
    return flag.source === 'office'
      ? `Not ${word.toLowerCase()} · checked`
      : `Not ${word.toLowerCase()}`;
  if (flag.source === 'office') return `${word} · confirmed${by ? ` by ${by}` : ''}`;
  return `${word} · said on the form`;
}

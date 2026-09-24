import type { Stage } from '../membership/types';

/** What the departments API sends, as the portal reads it (D28). */

export type Portal = { key: string; name: string; enabled: boolean };

export type DepartmentRow = {
  id: string;
  name: string;
  description: string;
  portal: Portal | null;
  archived: boolean;
  leaders: { id: string; name: string; title: string }[];
  memberCount: number;
};

export type MyDepartment = {
  id: string;
  name: string;
  description: string;
  title: string;
  memberCount: number;
};

export type Leader = {
  id: string;
  personId: string;
  name: string;
  title: string;
  since: string;
  /** Only an administrator is told. */
  account: { status: 'ACTIVE' | 'INVITED' | 'DISABLED' } | null;
};

export type Member = {
  id: string;
  personId: string;
  name: string;
  stage: Stage;
  phoneTail: string;
  since: string;
};

export type DepartmentDetail = {
  id: string;
  name: string;
  description: string;
  portal: Portal | null;
  archived: boolean;
  leaders: Leader[];
  members: Member[];
};

export type MemberCandidate = { personId: string; name: string; stage: Stage; phoneTail: string };

export type LeaderCandidate = {
  personId: string;
  name: string;
  phoneTail: string;
  emailOnRecord: boolean;
  account: { email: string; status: 'ACTIVE' | 'INVITED' | 'DISABLED' } | null;
};

export const since = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

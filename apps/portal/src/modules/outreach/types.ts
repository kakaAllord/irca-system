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

import type { Lang, Values } from './flow';

/**
 * One person's answers, whichever store they came from.
 *
 * `id` is a number while the registration app still reads its own database
 * (a bigserial) and a uuid once it reads the API; nothing here cares which,
 * and the old id is kept as `legacyId` on the new row so a row can always be
 * traced back.
 */
export type Registration = {
  id: string | number;
  token: string;
  lang: Lang;
  status: 'in_progress' | 'submitted';
  currentStep: string | null;
  furthestStep: string | null;
  values: Values;
  createdAt: Date;
  updatedAt: Date;
  submittedAt: Date | null;
};

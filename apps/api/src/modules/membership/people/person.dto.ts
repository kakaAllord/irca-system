import { initialsOf } from '@irca/shared';
import { applicableSteps, isAnswered, type Lang, type Values } from '@irca/shared/registration';
import type { Person, PersonStage, Registration } from '../../../generated/prisma/client.js';
import { valuesOf } from '../public-registration/values.js';

/**
 * What anyone who may see people sees: enough to recognise and reach someone,
 * and where they are on the journey. Nothing they wrote in confidence.
 */
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
  stage: PersonStage;
  saved: { value: boolean; source: 'office' | 'form' | 'none' };
  baptised: { value: boolean; source: 'office' | 'form' | 'none' };
  /** Finished the form, or has no form at all (added by the office). */
  complete: boolean;
  /** How far an unfinished form got: questions answered of those they were shown. */
  progress: { answered: number; of: number } | null;
  hasRegistration: boolean;
};

/**
 * What only pastors and the office see. These keys are not in the DTO at all
 * for anyone else — not blanked, not null, absent — so nothing on the page can
 * give them away by accident.
 */
export type PersonSensitive = {
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

export type PersonDetail = PersonRow & {
  occupation: { kind: string; detail: string };
  visit: string[];
  registration: {
    token: string;
    lang: Lang;
    status: 'in_progress' | 'submitted';
    submittedAt: string | null;
  } | null;
  sensitive?: PersonSensitive;
};

type WithRegistration = Person & { registration: Registration | null };

/** Where they live, in words: the ward in Arusha, otherwise region or country. */
export function livesIn(values: Values): string {
  if (values.where === 'arusha') return values.ward || values.wardOther || 'Arusha';
  if (values.where === 'region') return values.region || 'Another region';
  if (values.where === 'country') return values.country || 'Another country';
  return '';
}

/** The office's word wins; otherwise what they said on the form. */
function effective(
  office: boolean | null,
  form: boolean | null | undefined,
): { value: boolean; source: 'office' | 'form' | 'none' } {
  if (office !== null) return { value: office, source: 'office' };
  if (form !== null && form !== undefined) return { value: form, source: 'form' };
  return { value: false, source: 'none' };
}

/** Answered of shown, counting only the questions this person was actually put. */
export function progressOf(values: Values, lang: Lang): { answered: number; of: number } {
  const steps = applicableSteps(values);
  return {
    answered: steps.filter((step) => isAnswered(step, values, lang)).length,
    of: steps.length,
  };
}

export function toPersonRow(person: WithRegistration): PersonRow {
  const registration = person.registration;
  const values = registration ? valuesOf(registration) : null;
  const complete = !registration || registration.status === 'submitted';
  const name = person.fullName.trim();

  return {
    id: person.id,
    fullName: name,
    initials: name ? initialsOf(name) : '?',
    phone: person.phone ? `${person.dial} ${person.phone}` : '',
    registeredAt: (registration?.createdAt ?? person.createdAt).toISOString(),
    gender: person.gender,
    ageGroup: person.ageGroup,
    livesIn: values ? livesIn(values) : '',
    interestedIn: values?.interest ?? [],
    heardVia: values?.heard ?? [],
    stage: person.stage,
    saved: effective(person.saved, registration?.saved),
    baptised: effective(person.baptised, registration?.bapt),
    complete,
    progress: values && !complete ? progressOf(values, (registration!.lang as Lang) ?? 'en') : null,
    hasRegistration: !!registration,
  };
}

/**
 * The whole record. `sensitive` is only added when the caller may read it;
 * build every person response through here so that stays true.
 */
export function toPersonDetail(person: WithRegistration, canReadSensitive: boolean): PersonDetail {
  const row = toPersonRow(person);
  const registration = person.registration;
  const values = registration ? valuesOf(registration) : null;

  const detail: PersonDetail = {
    ...row,
    occupation: {
      kind: values?.occ ?? '',
      detail: values
        ? [values.profession, values.school, values.course].filter(Boolean).join(' · ')
        : '',
    },
    visit: values?.visit ?? [],
    registration: registration && {
      token: registration.token,
      lang: registration.lang as Lang,
      status: registration.status as 'in_progress' | 'submitted',
      submittedAt: registration.submittedAt?.toISOString() ?? null,
    },
  };

  if (canReadSensitive) {
    detail.sensitive = {
      email: person.email,
      dob: values?.dob ?? '',
      faith: {
        saved: values?.saved ?? null,
        savedYear: values?.savedYear ?? '',
        baptised: values?.bapt ?? null,
        baptisedYear: values?.baptYear ?? '',
        holySpirit: values?.holy ?? null,
        previousChurch: values?.prevChurch ? values.prevChurchName || 'Yes' : null,
      },
      family: {
        marital: values?.marital ?? '',
        marriedYear: values?.marriedYear ?? '',
        children: (values?.children ?? []).filter((c) => c.trim()),
      },
      ministries: values?.ministries ?? [],
      liked: values?.liked ?? '',
      prayer: values?.prayer ?? '',
    };
  }
  return detail;
}

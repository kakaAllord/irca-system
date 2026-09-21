import { EMPTY_VALUES, type Lang, type Values } from '@irca/shared/registration';
import type { Registration } from '../../../generated/prisma/client.js';

/**
 * The answers as the form knows them, and as the table stores them.
 *
 * One difference, and only one: the form's key `where` is `whereAt` in the
 * table, because `where` is what every query builder calls its filter. Keeping
 * the rest identical is what makes the copy from the first database one for
 * one.
 */
const KEYS = Object.keys(EMPTY_VALUES) as (keyof Values)[];

const field = (key: keyof Values): string => (key === 'where' ? 'whereAt' : key);

/** A row's answers, in the shape the form expects. */
export function valuesOf(row: Registration): Values {
  const values = {} as Values;
  for (const key of KEYS) {
    const raw = (row as unknown as Record<string, unknown>)[field(key)];
    const fallback = EMPTY_VALUES[key];
    // A fresh copy of the fallback, never the shared constant: these objects
    // are handed to a step that will mutate them.
    (values as Record<string, unknown>)[key] =
      raw ?? (Array.isArray(fallback) ? [...fallback] : fallback);
  }
  // The form always wants at least one empty box to type a child's name into.
  if (!values.children.length) values.children = [''];
  return values;
}

/** Only the answers given, as columns. */
export function columnsOf(patch: Partial<Values>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const key of Object.keys(patch) as (keyof Values)[]) {
    data[field(key)] = patch[key];
  }
  return data;
}

/** What the form reads back after every call. */
export type RegistrationDto = {
  token: string;
  lang: Lang;
  status: 'in_progress' | 'submitted';
  currentStep: string | null;
  furthestStep: string | null;
  values: Values;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
};

export const dtoOf = (row: Registration): RegistrationDto => ({
  token: row.token,
  lang: row.lang as Lang,
  status: row.status as 'in_progress' | 'submitted',
  currentStep: row.currentStep,
  furthestStep: row.furthestStep,
  values: valuesOf(row),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  submittedAt: row.submittedAt?.toISOString() ?? null,
});

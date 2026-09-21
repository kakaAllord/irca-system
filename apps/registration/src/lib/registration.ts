import 'server-only';
import { randomBytes } from 'node:crypto';
import { query } from './db';
import {
  EMPTY_VALUES,
  FIRST_STEP,
  screenIds,
  type Lang,
  type Registration,
  type Values,
} from '@irca/shared/registration';

export type { Registration };

// Answer key -> column. Everything is a plain camel/snake swap except `where`,
// which is a reserved word in SQL.
const OVERRIDES: Partial<Record<keyof Values, string>> = { where: 'where_at' };

function column(key: keyof Values): string {
  return OVERRIDES[key] ?? key.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
}

const KEYS = Object.keys(EMPTY_VALUES) as (keyof Values)[];

// Aliased back to the camelCase answer keys, so a row drops straight into Values.
const COLS = `
  id, token, lang, status, current_step, furthest_step,
  created_at, updated_at, submitted_at,
  ${KEYS.map(k => `${column(k)} as "${k}"`).join(', ')}
`;

const SELECT = `select ${COLS} from registrations`;

type Row = Record<string, unknown>;

function toRegistration(row: Row): Registration {
  const values = { ...EMPTY_VALUES };
  for (const k of KEYS) {
    const raw = row[k];
    // A fresh copy of the fallback, never the shared constant: these objects
    // are handed to a step that will mutate them.
    const fallback = EMPTY_VALUES[k];
    (values as Record<string, unknown>)[k] =
      raw ?? (Array.isArray(fallback) ? [...fallback] : fallback);
  }
  // The form always wants at least one empty box to type a child's name into.
  if (!values.children.length) values.children = [''];

  return {
    id: Number(row.id),
    token: String(row.token),
    lang: row.lang as Lang,
    status: row.status as Registration['status'],
    currentStep: (row.current_step as string) ?? null,
    furthestStep: (row.furthest_step as string) ?? null,
    values,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
    submittedAt: (row.submitted_at as Date) ?? null,
  };
}

/** 32 hex chars from a CSPRNG — this is the only thing guarding the row. */
function newToken() {
  return randomBytes(16).toString('hex');
}

// Note on the shape of these queries: each one writes and reads in a single
// statement via RETURNING, not a data-modifying CTE feeding an outer SELECT.
// Postgres runs every part of a statement against the same snapshot, so a CTE
// that inserts is invisible to a SELECT beside it (zero rows), and a CTE that
// updates hands back the row as it was *before* the write.

export async function createRegistration(lang: Lang): Promise<Registration> {
  const { rows } = await query<Row>(
    `insert into registrations (token, lang, current_step)
     values ($1, $2, $3)
     returning ${COLS}`,
    [newToken(), lang, FIRST_STEP],
  );
  return toRegistration(rows[0]);
}

export async function getByToken(token: string): Promise<Registration | null> {
  const { rows } = await query<Row>(`${SELECT} where token = $1`, [token]);
  return rows[0] ? toRegistration(rows[0]) : null;
}

export class PhoneTakenError extends Error {}

/**
 * Writes one step's answers and records how far the visitor got. Only the keys
 * that step owns are sent, so an edit from the review screen cannot blank out a
 * neighbouring answer.
 */
export async function saveValues(
  token: string,
  patch: Partial<Values>,
  step: string | null,
  opts: {
    /** Answers as they stand after this write, used to order the steps. */
    merged?: Values;
    /** The furthest step already recorded, so it can only move forwards. */
    furthestSoFar?: string | null;
  } = {},
): Promise<Registration | null> {
  const keys = Object.keys(patch) as (keyof Values)[];

  const sets = keys.map((k, i) => `${column(k)} = $${i + 4}`);
  sets.push('current_step = $2', 'furthest_step = $3');

  try {
    const { rows } = await query<Row>(
      `update registrations set ${sets.join(', ')}
       where token = $1 and status = 'in_progress'
       returning ${COLS}`,
      [
        token,
        step,
        furthest(step, opts.furthestSoFar ?? null, opts.merged),
        ...keys.map(k => patch[k]),
      ],
    );
    return rows[0] ? toRegistration(rows[0]) : null;
  } catch (err) {
    // registrations_phone_idx: someone already registered with this number.
    if ((err as { code?: string }).code === '23505') throw new PhoneTakenError();
    throw err;
  }
}

/**
 * The deepest step reached so far.
 *
 * It only ever moves forwards: walking back to change an answer is not giving
 * up, and a drop-off figure measured off the current step would report it as
 * though it were.
 */
function furthest(step: string | null, soFar: string | null, merged?: Values): string | null {
  if (!step) return soFar;
  if (!soFar) return step;
  if (!merged) return soFar;

  const order = screenIds(merged);
  const now = order.indexOf(step);
  const before = order.indexOf(soFar);

  // A step that is no longer on their path (a branch they backed out of) has
  // no index here, so the one we can place wins.
  if (before < 0) return step;
  if (now < 0) return soFar;
  return now > before ? step : soFar;
}

export async function submit(token: string): Promise<Registration | null> {
  const { rows } = await query<Row>(
    `update registrations
     set status = 'submitted', submitted_at = now(), current_step = 'done'
     where token = $1
     returning ${COLS}`,
    [token],
  );
  return rows[0] ? toRegistration(rows[0]) : null;
}

/** The office list: unfinished files first, newest first. */
export async function listRegistrations(limit = 100): Promise<Registration[]> {
  const { rows } = await query<Row>(
    `${SELECT} order by (status = 'in_progress') desc, updated_at desc limit $1`,
    [limit],
  );
  return rows.map(toRegistration);
}

/** Changing the language of a registration already under way. */
export async function setLanguage(token: string, lang: Lang): Promise<void> {
  await query(`update registrations set lang = $2 where token = $1`, [token, lang]);
}

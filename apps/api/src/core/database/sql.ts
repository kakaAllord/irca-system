import { Prisma } from '../../generated/prisma/client.js';

/**
 * Raw SQL that cannot be built out of strings.
 *
 * Most queries go through Prisma's models. A few — the suggestion boxes with
 * their trigram similarity, the finance reports, the counts behind the tabs —
 * are plainer as SQL. Those use `sql` here, which is a tagged template: every
 * `${value}` becomes a bound parameter, and a query cannot be assembled by
 * concatenation even by accident. `$queryRawUnsafe` and `$executeRawUnsafe`
 * are banned by the lint rules, so this is the only way in.
 *
 * Raw SQL must still run inside `db.tx()`: the tenant extension cannot see
 * inside a raw query, and the transaction is what tells Postgres which church
 * is asking.
 */
export const sql = Prisma.sql;
export const join = Prisma.join;
export const empty = Prisma.empty;
export type Sql = Prisma.Sql;

/**
 * A table or column name, for the few queries that read from one of two
 * tables. Only a plain lowercase name is allowed, and it is quoted, so a value
 * that ever came from a request cannot become SQL.
 */
export function identifier(name: string): Prisma.Sql {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(name)) {
    throw new Error(`Not a table or column name: ${name}`);
  }
  return Prisma.raw(`"${name}"`);
}

import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaDb } from './prisma-clients.js';

/** What a transaction hands feature code: the client, minus transaction control. */
export type Tx = Omit<PrismaDb, '$transaction' | '$connect' | '$disconnect' | '$extends'>;

/**
 * How feature code reaches the database.
 *
 * Thin on purpose. It used to scope every query to a church and tell Postgres
 * which one, because the same database held several; now it holds one, so a
 * query is just a query. What may not be done — rewriting the activity log,
 * deleting a finance entry — is enforced by the grants in the migration, not
 * by anything this class remembers to do.
 */
@Injectable()
export class Db {
  constructor(private readonly prisma: PrismaDb) {}

  /** For single queries. Anything with several statements, or raw SQL, uses tx(). */
  get client(): PrismaDb {
    return this.prisma;
  }

  /** Several statements as one unit. Raw SQL belongs here too. */
  async tx<T>(
    fn: (tx: Tx) => Promise<T>,
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel; timeout?: number },
  ): Promise<T> {
    return this.prisma.$transaction((tx) => fn(tx as unknown as Tx), options);
  }
}

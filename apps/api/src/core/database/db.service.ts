import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import type { RequestContext } from '../context/request-context.js';
import { PrismaDb, PrismaRo } from './prisma-clients.js';

/** What a transaction hands feature code: the client, minus transaction control. */
export type Tx = Omit<PrismaClient, '$transaction' | '$connect' | '$disconnect' | '$extends'>;

/**
 * How feature code reaches the database.
 *
 * It picks the role and nothing else: the read-only one while the request is
 * viewing as someone, which is the database's half of "viewing as someone is
 * read-only" — a GET that writes by mistake fails there even though every
 * guard let it through. Otherwise a query is just a query; what may never be
 * done at all, rewriting the activity log or deleting a finance entry, is
 * enforced by the grants in the migrations, not by anything this class
 * remembers to do.
 *
 * Core code (sessions, the activity log, usage counters) injects PrismaDb
 * directly, because it must still record that a page was viewed while the
 * request itself may change nothing.
 */
@Injectable()
export class Db {
  constructor(
    private readonly rw: PrismaDb,
    private readonly ro: PrismaRo,
    private readonly cls: ClsService<RequestContext>,
  ) {}

  private get base(): PrismaClient {
    return this.cls.isActive() && this.cls.get('impersonationId') ? this.ro : this.rw;
  }

  /** For single queries. Anything with several statements, or raw SQL, uses tx(). */
  get client(): PrismaClient {
    return this.base;
  }

  /** Several statements as one unit. Raw SQL belongs here too. */
  async tx<T>(
    fn: (tx: Tx) => Promise<T>,
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel; timeout?: number },
  ): Promise<T> {
    return this.base.$transaction((tx) => fn(tx as unknown as Tx), options);
  }
}

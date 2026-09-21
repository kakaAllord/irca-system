import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Prisma } from '../../generated/prisma/client.js';
import type { RequestContext } from '../context/request-context.js';
import { PrismaRo, PrismaRw } from './prisma-clients.js';
import { tenantExtension } from './tenant.extension.js';

function tenantScoped(client: PrismaRw | PrismaRo, churchId: () => string | null) {
  return client.$extends(tenantExtension(churchId));
}

type ScopedClient = ReturnType<typeof tenantScoped>;

/**
 * Sets the church for row-level security on every query this client makes.
 *
 * A standalone query becomes a two-statement transaction: set the church,
 * then run. The setting is transaction-local, so it dies at COMMIT and cannot
 * reach the next request through a pooled connection, which is what ruled out
 * a session-level SET.
 */
function withRls(base: ScopedClient, churchId: () => string | null) {
  return base.$extends({
    name: 'rls',
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const [, result] = await base.$transaction([
            base.$executeRaw`select set_config('app.church_id', ${churchId() ?? ''}, true)`,
            query(args),
          ]);
          return result;
        },
      },
    },
  });
}

type ScopedTx = Parameters<
  Parameters<ScopedClient['$transaction']>[0] extends (tx: infer T) => unknown
    ? (tx: T) => void
    : never
>[0];

/** What a transaction hands feature code: the scoped client, minus transaction control. */
export type TenantTx = ScopedTx;

/**
 * The only way feature code reaches the database.
 *
 * It picks the role: the read-only one while the request is impersonating,
 * which is the database half of "impersonation is read-only". It scopes every
 * query to the church in the request context, and tells Postgres the same
 * church so its own policies apply. Feature code passes no church anywhere.
 */
@Injectable()
export class Db {
  private readonly churchId: () => string | null;
  /** Built once at startup; the church comes from the request context at query time. */
  private readonly rwScoped: ScopedClient;
  private readonly roScoped: ScopedClient;
  private readonly rwRls: ReturnType<typeof withRls>;
  private readonly roRls: ReturnType<typeof withRls>;

  constructor(
    rw: PrismaRw,
    ro: PrismaRo,
    private readonly cls: ClsService<RequestContext>,
  ) {
    this.churchId = () => this.cls.get('churchId');
    this.rwScoped = tenantScoped(rw, this.churchId);
    this.roScoped = tenantScoped(ro, this.churchId);
    this.rwRls = withRls(this.rwScoped, this.churchId);
    this.roRls = withRls(this.roScoped, this.churchId);
  }

  /** For single queries. Anything with several statements, or raw SQL, uses tx(). */
  get client() {
    return this.cls.get('impersonationId') ? this.roRls : this.rwRls;
  }

  /**
   * Several statements as one unit, with the church set once for the whole
   * transaction. Raw SQL belongs here too, and must still filter church_id
   * itself: the extension cannot see inside it.
   */
  async tx<T>(
    fn: (tx: TenantTx) => Promise<T>,
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel; timeout?: number },
  ): Promise<T> {
    const base = this.cls.get('impersonationId') ? this.roScoped : this.rwScoped;
    const churchId = this.churchId() ?? '';
    return base.$transaction(async (tx) => {
      await tx.$executeRaw`select set_config('app.church_id', ${churchId}, true)`;
      return fn(tx);
    }, options);
  }
}

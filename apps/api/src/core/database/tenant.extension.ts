import { Prisma } from '../../generated/prisma/client.js';
import { TENANT_MODELS } from './planes.js';

/**
 * Scopes every query on a church-owned model to the church in the request
 * context, so a forgotten `where` cannot read or write another church's rows.
 *
 * It throws rather than guessing when there is no church: a query that quietly
 * ran unscoped is exactly the leak this exists to prevent.
 *
 * What it does not cover, and review must catch:
 *  - nested writes (`create: { children: { create: [...] } }`) are not
 *    intercepted: create children with their own call;
 *  - raw SQL is not intercepted: it filters church_id itself, inside db.tx;
 *  - never connect the `church` relation by hand; leave it out and let this
 *    set churchId.
 *
 * Row-level security (the migration's policies) enforces the same rule inside
 * Postgres, so both would have to fail for a leak to happen.
 */
export function tenantExtension(currentChurchId: () => string | null) {
  return Prisma.defineExtension({
    name: 'tenant',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);

          const churchId = currentChurchId();
          if (!churchId)
            throw new Error(`${model}.${operation} was used with no church in context`);

          const a = args as Record<string, unknown>;
          switch (operation) {
            case 'create':
              a.data = { ...(a.data as object), churchId };
              break;
            case 'createMany':
            case 'createManyAndReturn':
              a.data = [a.data as object].flat().map((d) => ({ ...d, churchId }));
              break;
            case 'upsert':
              a.where = { ...(a.where as object), churchId };
              a.create = { ...(a.create as object), churchId };
              break;
            default:
              // find*, count, aggregate, groupBy, update*, delete*. Adding a
              // non-unique field to a unique where is allowed, and a row of
              // another church then simply is not found, which is right.
              a.where = { ...((a.where as object) ?? {}), churchId };
          }
          return query(a);
        },
      },
    },
  });
}

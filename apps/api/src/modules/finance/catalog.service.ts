import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  nameKey,
  type CatalogItem,
  type CatalogSuggestResponse,
  type CreateCatalogItemInput,
} from '@irca/shared';
import { Db, type Tx } from '../../core/database/db.service.js';
import { identifier, sql, type Sql } from '../../core/database/sql.js';
import { RequestAuth } from '../../core/context/request-auth.js';
import { AppError } from '../../core/http/app-error.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { UsageService } from '../../core/usage/usage.service.js';

/** The two lists behave identically, so they are one service and two tables. */
export type CatalogKind = 'income' | 'expense';

const TABLES: Record<CatalogKind, { items: string; column: string; noun: string }> = {
  income: { items: 'finance_income_sources', column: 'income_source_id', noun: 'income source' },
  expense: { items: 'finance_expense_items', column: 'expense_item_id', noun: 'expense item' },
};

/** Below this, two names are different things; above it, probably a typo. */
const SIMILAR_ENOUGH = 0.5;
const SUGGEST_LIMIT = 8;
const PAGE_SIZE = 50;

type ItemRow = {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  uses: number;
  last_used_on: Date | null;
};

/**
 * Income sources and expense items: the lists the finance team records
 * against.
 *
 * Nothing here is ever deleted. An item that has been used must exist forever
 * so old entries keep their meaning, and an unused one can simply be turned
 * off. Creating is deliberately fussy about near-duplicates, because
 * "Electricity", "Electricity bill" and "Umeme" as three items make a year of
 * reports useless.
 */
@Injectable()
export class CatalogService {
  constructor(
    private readonly db: Db,
    private readonly auth: RequestAuth,
    private readonly audit: AuditService,
    private readonly usage: UsageService,
  ) {}

  /**
   * Raw SQL through a transaction, because the tenant extension cannot see
   * inside raw queries: db.tx() is what tells Postgres which church this is.
   */
  private query<T>(query: Sql): Promise<T[]> {
    return this.db.tx((tx) => tx.$queryRaw<T[]>(query));
  }

  /**
   * What to offer while someone types. An empty box offers the items used
   * most lately, so the common ones are one click away.
   */
  async suggest(
    kind: CatalogKind,
    q: string,
    limit = SUGGEST_LIMIT,
  ): Promise<CatalogSuggestResponse> {
    const key = nameKey(q ?? '');
    const table = TABLES[kind];

    const items = identifier(table.items);
    const column = identifier(table.column);
    const rows = await this.query<{ id: string; name: string; description: string; uses: number }>(
      sql`-- tenant: church_id is bound below
       select i.id, i.name, i.description, coalesce(u.uses, 0)::int as uses
       from ${items} i
       left join lateral (
         select count(*)::int as uses from finance_transactions t
         where t.church_id = i.church_id and t.${column} = i.id
           and t.status = 'POSTED' and t.txn_date > current_date - 180
       ) u on true
       where i.is_active
         and (${key} = '' or i.name_key like '%' || ${key} || '%' or i.name_key % ${key})
       order by (i.name_key like ${key} || '%') desc, similarity(i.name_key, ${key}) desc,
                uses desc, i.name
       limit ${limit}`,
    );

    const exact = key
      ? await this.query<{ id: string; name: string; is_active: boolean }>(
          sql`-- tenant: church_id is bound below
           select id, name, is_active from ${items}
           where name_key = ${key}`,
        )
      : [];

    return {
      items: rows,
      exact: exact[0]
        ? { id: exact[0].id, name: exact[0].name, isActive: exact[0].is_active }
        : null,
    };
  }

  /** The Lists page: everything, with how often and how lately it is used. */
  async list(
    kind: CatalogKind,
    query: { q?: string; status?: 'active' | 'inactive' | 'all'; page?: number },
  ): Promise<{ rows: CatalogItem[]; total: number }> {
    const table = TABLES[kind];
    const key = nameKey(query.q ?? '');
    const status = query.status ?? 'active';
    const page = Math.max(1, query.page ?? 1);

    const items = identifier(table.items);
    const column = identifier(table.column);
    const where = sql`(${key} = '' or i.name_key like '%' || ${key} || '%')
      and (${status} = 'all' or i.is_active = (${status} = 'active'))`;

    const rows = await this.query<ItemRow>(
      sql`-- tenant: church_id is bound in the where clause
       select i.id, i.name, i.description, i.is_active,
              coalesce(u.uses, 0)::int as uses, u.last_used_on
       from ${items} i
       left join lateral (
         select count(*)::int as uses, max(t.txn_date) as last_used_on
         from finance_transactions t
         where t.church_id = i.church_id and t.${column} = i.id and t.status = 'POSTED'
       ) u on true
       where ${where}
       order by i.name
       limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`,
    );

    const counted = await this.query<{ count: bigint }>(
      sql`-- tenant: church_id is bound in the where clause
       select count(*) as count from ${items} i where ${where}`,
    );
    const total = Number(counted[0]?.count ?? 0);

    return {
      rows: rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        isActive: r.is_active,
        uses: r.uses,
        lastUsedOn: r.last_used_on ? isoDate(r.last_used_on) : null,
      })),
      total,
    };
  }

  /**
   * Adds an item, refusing the two ways a list turns into a mess: the same
   * name twice, and a near-miss the person has not been shown yet.
   */
  async create(kind: CatalogKind, input: CreateCatalogItemInput): Promise<CatalogItem> {
    const table = TABLES[kind];
    const key = nameKey(input.name);

    await this.refuseDuplicate(kind, key, input.name, input.confirmDistinct ?? false);

    const created = await this.db.tx(async (tx) => {
      const data = {
        name: input.name,
        nameKey: key,
        description: input.description ?? '',
        createdById: this.auth.userId!,
      };
      const row = await (
        kind === 'income'
          ? tx.financeIncomeSource.create({ data })
          : tx.financeExpenseItem.create({ data })
      ).catch((err: unknown) => {
        // Two people creating the same item at the same moment: the unique
        // index decides, and the loser is told it already exists.
        if (isUniqueViolation(err)) {
          throw new AppError(409, ErrorCode.ALREADY_EXISTS, `"${input.name}" already exists.`);
        }
        throw err;
      });

      await this.audit.recordIn(tx, {
        action: 'finance.catalog.created',
        entityType: `finance_${kind}_item`,
        entityId: row.id,
        summary: `Added the ${table.noun} "${input.name}"`,
        after: { name: input.name, description: input.description ?? '' },
      });
      return row.id;
    });

    this.usage.inc('finance.catalog.created');
    return {
      id: created,
      name: input.name,
      description: input.description ?? '',
      isActive: true,
      uses: 0,
      lastUsedOn: null,
    };
  }

  async update(
    kind: CatalogKind,
    id: string,
    input: { name?: string; description?: string; confirmDistinct?: boolean },
  ): Promise<void> {
    const table = TABLES[kind];
    const before = await this.require(kind, id);
    const key = input.name ? nameKey(input.name) : null;
    if (key && key !== nameKey(before.name)) {
      await this.refuseDuplicate(kind, key, input.name!, input.confirmDistinct ?? false);
    }

    await this.db.tx(async (tx) => {
      const data = {
        ...(input.name ? { name: input.name, nameKey: key! } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      };
      const where = { id };
      await (kind === 'income'
        ? tx.financeIncomeSource.update({ where, data })
        : tx.financeExpenseItem.update({ where, data }));

      await this.audit.recordIn(tx, {
        action: 'finance.catalog.updated',
        entityType: `finance_${kind}_item`,
        entityId: id,
        summary: `Renamed the ${table.noun} "${before.name}" to "${input.name ?? before.name}"`,
        before: { name: before.name, description: before.description },
        after: {
          name: input.name ?? before.name,
          description: input.description ?? before.description,
        },
      });
    });
  }

  /** Turning an item off keeps every entry that used it; it just stops being offered. */
  async setActive(kind: CatalogKind, id: string, isActive: boolean): Promise<void> {
    const table = TABLES[kind];
    const item = await this.require(kind, id);

    await this.db.tx(async (tx) => {
      const where = { id };
      await (kind === 'income'
        ? tx.financeIncomeSource.update({ where, data: { isActive } })
        : tx.financeExpenseItem.update({ where, data: { isActive } }));

      await this.audit.recordIn(tx, {
        action: isActive ? 'finance.catalog.activated' : 'finance.catalog.deactivated',
        entityType: `finance_${kind}_item`,
        entityId: id,
        summary: `Turned the ${table.noun} "${item.name}" ${isActive ? 'on' : 'off'}`,
      });
    });
  }

  /** The item an entry is about to use: it must be this church's, and in use. */
  async requireUsable(
    tx: Tx,
    kind: CatalogKind,
    id: string,
  ): Promise<{ id: string; name: string }> {
    const table = TABLES[kind];
    const item = await (kind === 'income'
      ? tx.financeIncomeSource.findFirst({ where: { id } })
      : tx.financeExpenseItem.findFirst({ where: { id } }));

    if (!item) throw new AppError(404, ErrorCode.NOT_FOUND, `No such ${table.noun}.`);
    if (!item.isActive) {
      throw new AppError(
        422,
        ErrorCode.ITEM_NOT_AVAILABLE,
        `"${item.name}" is turned off. A finance manager can turn it back on.`,
      );
    }
    return { id: item.id, name: item.name };
  }

  async require(kind: CatalogKind, id: string): Promise<CatalogItem> {
    const table = TABLES[kind];
    const row = await this.db.tx((tx) =>
      kind === 'income'
        ? tx.financeIncomeSource.findFirst({ where: { id } })
        : tx.financeExpenseItem.findFirst({ where: { id } }),
    );
    if (!row) throw new AppError(404, ErrorCode.NOT_FOUND, `No such ${table.noun}.`);
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      isActive: row.isActive,
      uses: 0,
      lastUsedOn: null,
    };
  }

  /**
   * The same name is refused outright; a name close to an existing one is
   * refused once, with the candidates, and accepted when the person says they
   * mean a different thing.
   */
  private async refuseDuplicate(
    kind: CatalogKind,
    key: string,
    name: string,
    confirmDistinct: boolean,
  ): Promise<void> {
    const table = TABLES[kind];

    const items = identifier(table.items);
    const exact = await this.query<{ id: string; name: string; is_active: boolean }>(
      sql`-- tenant: church_id is bound below
       select id, name, is_active from ${items}
       where name_key = ${key}`,
    );
    if (exact[0]) {
      throw new AppError(409, ErrorCode.ALREADY_EXISTS, `"${exact[0].name}" already exists.`, {
        existing: { id: exact[0].id, name: exact[0].name },
        inactive: !exact[0].is_active,
      });
    }

    if (confirmDistinct) return;
    const similar = await this.query<{ id: string; name: string }>(
      sql`-- tenant: church_id is bound below
       select id, name from ${items}
       where similarity(name_key, ${key}) >= ${SIMILAR_ENOUGH}
       order by similarity(name_key, ${key}) desc
       limit 3`,
    );
    if (similar.length) {
      throw new AppError(409, ErrorCode.SIMILAR_EXISTS, `Did you mean "${similar[0]!.name}"?`, {
        name,
        candidates: similar,
      });
    }
  }
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === 'P2002' || code === '23505';
}

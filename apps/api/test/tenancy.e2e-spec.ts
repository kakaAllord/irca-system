import type { NestExpressApplication } from '@nestjs/platform-express';
import type pg from 'pg';
import { ClsService } from 'nestjs-cls';
import { Db } from '../src/core/database/db.service.js';
import { PrismaCore } from '../src/core/database/prisma-clients.js';
import {
  CONTROL_PLANE_TABLES,
  TENANT_PLANE_TABLES,
  TENANT_TABLES,
} from '../src/core/database/planes.js';
import { createApp, createChurch, createRole, ownerDb, truncateAll } from './helpers.js';

/**
 * Two layers keep churches apart: the Prisma extension that scopes every
 * query, and Postgres's own row-level security. These tests check each one,
 * and that neither depends on the other.
 */
describe('keeping churches apart', () => {
  let app: NestExpressApplication;
  let db: pg.Client;
  let cls: ClsService;
  let scoped: Db;
  let core: PrismaCore;

  beforeAll(async () => {
    app = await createApp();
    db = await ownerDb();
    cls = app.get(ClsService);
    scoped = app.get(Db);
    core = app.get(PrismaCore);
  });
  afterAll(async () => {
    await db.end();
    await app.close();
  });
  beforeEach(() => truncateAll(db));

  /** Runs as though a request for this church were being served. */
  const asChurch = <T>(churchId: string | null, fn: () => Promise<T>): Promise<T> =>
    cls.run(async () => {
      cls.set('churchId', churchId);
      cls.set('impersonationId', null);
      return fn();
    });

  it('shows one church only its own rows, and hides the other completely', async () => {
    const a = await createChurch(db, 'AAA');
    const b = await createChurch(db, 'BBB');
    const roleA = await createRole(db, a.id, { permissions: [], name: 'A role' });
    await createRole(db, b.id, { permissions: [], name: 'B role' });

    const seen = await asChurch(a.id, () => scoped.client.role.findMany());
    expect(seen.map((r) => r.name)).toEqual(['A role']);

    // Another church's row is not found rather than refused: its existence is
    // not something to confirm.
    const foreign = await asChurch(b.id, () =>
      scoped.client.role.findUnique({ where: { id: roleA.id } }),
    );
    expect(foreign).toBeNull();
  });

  it('stamps the church on what it writes, whatever the caller passes', async () => {
    const a = await createChurch(db, 'AAA');
    const b = await createChurch(db, 'BBB');
    const created = await asChurch(a.id, () =>
      scoped.client.role.create({
        // A church id in the payload must not decide anything.
        data: { churchId: b.id, moduleKey: 'admin', name: 'Sneaky' } as never,
      }),
    );
    expect(created.churchId).toBe(a.id);
  });

  it('refuses to touch a church-owned table with no church in context', async () => {
    await expect(asChurch(null, () => scoped.client.role.findMany())).rejects.toThrow(
      /no church in context/,
    );
  });

  it('lets Postgres refuse on its own, without the extension', async () => {
    const a = await createChurch(db, 'AAA');
    const b = await createChurch(db, 'BBB');
    await createRole(db, b.id, { permissions: [], name: 'B role' });

    // Raw SQL is not scoped by the extension. Row-level security still is.
    const rows = await asChurch(a.id, () =>
      scoped.tx((tx) => tx.$queryRaw<{ name: string }[]>`select name from roles`),
    );
    expect(rows).toEqual([]);

    const asB = await asChurch(b.id, () =>
      scoped.tx((tx) => tx.$queryRaw<{ name: string }[]>`select name from roles`),
    );
    expect(asB.map((r) => r.name)).toEqual(['B role']);
  });

  it('does not leak the church between requests on one connection', async () => {
    const a = await createChurch(db, 'AAA');
    await createRole(db, a.id, { permissions: [], name: 'A role' });

    expect(await asChurch(a.id, () => scoped.client.role.count())).toBe(1);
    // The next "request" has no church: the setting from the last one must be gone.
    const leaked = await asChurch(null, () =>
      scoped.tx((tx) => tx.$queryRaw<{ n: bigint }[]>`select count(*) as n from roles`),
    );
    expect(Number(leaked[0]!.n)).toBe(0);
  });

  it('lets core see every church, because signing in happens before one is known', async () => {
    await createChurch(db, 'AAA');
    await createChurch(db, 'BBB');
    expect(await core.church.count()).toBe(2);
  });

  it('has every church-owned table under row-level security', async () => {
    const { rows } = await db.query<{ tablename: string; rowsecurity: boolean }>(
      `select tablename, rowsecurity from pg_tables where schemaname = 'public'`,
    );
    const unprotected = rows
      .filter((r) => !r.rowsecurity)
      .map((r) => r.tablename)
      .filter((t) => !['_prisma_migrations', 'permissions'].includes(t));
    expect(unprotected).toEqual([]);
  });

  it('labels every table as church-owned or shared, and scopes the ones with a church', async () => {
    const { rows } = await db.query<{ tablename: string; has_church: boolean }>(
      `select t.tablename,
              exists (select 1 from information_schema.columns c
                      where c.table_name = t.tablename and c.column_name = 'church_id') as has_church
       from pg_tables t
       where t.schemaname = 'public' and t.tablename <> '_prisma_migrations'`,
    );

    const unlabelled = rows
      .map((r) => r.tablename)
      .filter((t) => !CONTROL_PLANE_TABLES.has(t) && !TENANT_PLANE_TABLES.has(t));
    expect(unlabelled).toEqual([]);

    // Anything a feature module can reach and that has a church must be
    // scoped automatically; the rest is core's, which sees every church.
    const scopedOrCore = rows
      .filter((r) => r.has_church)
      .map((r) => r.tablename)
      .filter((t) => !TENANT_TABLES.has(t) && !CONTROL_PLANE_TABLES.has(t));
    expect(scopedOrCore).toEqual([]);
  });

  it('has no foreign key from church records to a shared table, except the church itself', async () => {
    const { rows } = await db.query<{ child: string; parent: string }>(
      `select c.relname as child, p.relname as parent
       from pg_constraint k
       join pg_class c on c.oid = k.conrelid
       join pg_class p on p.oid = k.confrelid
       where k.contype = 'f'`,
    );
    const crossing = rows.filter(
      (r) =>
        TENANT_PLANE_TABLES.has(r.child) &&
        !TENANT_PLANE_TABLES.has(r.parent) &&
        r.parent !== 'churches',
    );
    expect(crossing).toEqual([]);
  });
});

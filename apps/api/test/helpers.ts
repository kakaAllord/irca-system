import { createHash, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import pg from 'pg';
import request from 'supertest';
import { config } from 'dotenv';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import { PasswordService } from '../src/core/auth/password.service.js';

config({ path: '.env.test', quiet: true });

/**
 * The API as production runs it: same modules, same middleware, same order.
 * Tests may add throwaway controllers to exercise the guards; they are part of
 * the test, never of the app.
 */
export async function createApp(
  extraControllers: Type<object>[] = [],
): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: extraControllers,
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  configureApp(app);
  await app.init();
  return app;
}

/** The owner role, for arranging and inspecting data behind the API's back. */
export async function ownerDb(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: process.env.DIRECT_DATABASE_URL });
  await client.connect();
  return client;
}

/**
 * Empties every table except the migration log and the permission list, which
 * is derived from the code and written once when the API starts.
 */
export async function truncateAll(db: pg.Client): Promise<void> {
  const { rows } = await db.query<{ tablename: string }>(
    `select tablename from pg_tables
     where schemaname = 'public' and tablename not in ('_prisma_migrations', 'permissions')`,
  );
  if (rows.length) {
    await db.query(`truncate table ${rows.map((r) => `"${r.tablename}"`).join(', ')} cascade`);
  }
}

const passwords = new PasswordService();

export async function createChurch(db: pg.Client, code = 'IRCA', modules = ['admin']) {
  const id = randomUUID();
  await db.query(
    `insert into churches (id, code, slug, name, updated_at) values ($1, $2, $3, $4, now())`,
    [id, code, code.toLowerCase(), `${code} Church`],
  );
  await db.query(`insert into church_placements (church_id) values ($1)`, [id]);
  for (const moduleKey of modules) {
    await db.query(
      `insert into church_modules (church_id, module_key, enabled, enabled_at) values ($1, $2, true, now())`,
      [id, moduleKey],
    );
  }
  return { id, code };
}

/** A role with exactly these permissions, as an administrator would make one. */
export async function createRole(
  db: pg.Client,
  churchId: string,
  opts: { name?: string; moduleKey?: string; permissions: string[]; systemKey?: string },
) {
  const id = randomUUID();
  await db.query(
    `insert into roles (id, church_id, module_key, name, system_key, updated_at)
     values ($1, $2, $3, $4, $5, now())`,
    [
      id,
      churchId,
      opts.moduleKey ?? 'admin',
      opts.name ?? `Role ${id.slice(0, 6)}`,
      opts.systemKey ?? null,
    ],
  );
  for (const permissionKey of opts.permissions) {
    await db.query(
      `insert into role_permissions (church_id, role_id, permission_key) values ($1, $2, $3)`,
      [churchId, id, permissionKey],
    );
  }
  return { id };
}

export async function grantRole(db: pg.Client, churchId: string, userId: string, roleId: string) {
  const { rows } = await db.query<{ id: string }>(
    `select id from church_memberships where church_id = $1 and user_id = $2`,
    [churchId, userId],
  );
  await db.query(
    `insert into membership_roles (church_id, membership_id, role_id) values ($1, $2, $3)
     on conflict do nothing`,
    [churchId, rows[0]!.id, roleId],
  );
}

/** Someone who belongs to a church and holds a role with these permissions. */
export async function createUserWithPermissions(
  db: pg.Client,
  churchId: string,
  permissions: string[],
  opts: { moduleKey?: string; email?: string } = {},
) {
  const user = await createUser(db, { churchId, email: opts.email });
  const role = await createRole(db, churchId, { permissions, moduleKey: opts.moduleKey });
  await grantRole(db, churchId, user.id, role.id);
  return { ...user, roleId: role.id };
}

export async function createUser(
  db: pg.Client,
  opts: {
    email?: string;
    password?: string;
    status?: 'ACTIVE' | 'INVITED' | 'DISABLED';
    platformRole?: 'NONE' | 'DEV';
    churchId?: string;
  } = {},
) {
  const id = randomUUID();
  const email = opts.email ?? `user-${id.slice(0, 8)}@example.com`;
  const password = opts.password ?? 'a long enough password';
  await db.query(
    `insert into users (id, email, full_name, password_hash, platform_role, status, updated_at)
     values ($1, $2, $3, $4, $5, $6, now())`,
    [
      id,
      email,
      'Neema Mollel',
      await passwords.hash(password),
      opts.platformRole ?? 'NONE',
      opts.status ?? 'ACTIVE',
    ],
  );
  if (opts.churchId) {
    await db.query(
      `insert into church_memberships (id, church_id, user_id, status, joined_at, updated_at)
       values ($1, $2, $3, 'ACTIVE', now(), now())`,
      [randomUUID(), opts.churchId, id],
    );
  }
  return { id, email, password };
}

/** A key a church's own app can call the public API with. */
export async function createApiClient(db: pg.Client, churchId: string, kind = 'REGISTRATION') {
  const key = `irk_${randomUUID().replaceAll('-', '')}`;
  const keyHash = createHash('sha256').update(key).digest('hex');
  await db.query(
    `insert into api_clients (id, church_id, name, kind, key_prefix, key_hash)
     values ($1, $2, 'Test form', $3, $4, $5)`,
    [randomUUID(), churchId, kind, key.slice(0, 12), keyHash],
  );
  return key;
}

/** A request as a church's registration form sends it: a key, and no session. */
export function asForm(app: NestExpressApplication, key: string, ip = `41.0.${rand()}.${rand()}`) {
  const agent = request(app.getHttpServer());
  const withHeaders = (t: request.Test) =>
    t
      .set('X-IRCA-Client', 'registration')
      .set('Authorization', `Bearer ${key}`)
      .set('X-Forwarded-For', ip);
  return {
    get: (path: string) => withHeaders(agent.get(path)),
    post: (path: string, body?: object) => withHeaders(agent.post(path)).send(body ?? {}),
    put: (path: string, body?: object) => withHeaders(agent.put(path)).send(body ?? {}),
  };
}

/**
 * A request as the portal sends it. Each call comes from a different client
 * address unless one is given, so the per-address sign-in limit only bites in
 * the test that is about it.
 */
export function portal(app: NestExpressApplication, ip = `10.0.${rand()}.${rand()}`) {
  const agent = request(app.getHttpServer());
  const withHeaders = (t: request.Test) =>
    t.set('X-IRCA-Client', 'portal').set('X-Forwarded-For', ip);
  return {
    get: (path: string, cookie?: string) =>
      withHeaders(agent.get(path)).set('Cookie', cookie ?? ''),
    post: (path: string, body?: object, cookie?: string) =>
      withHeaders(agent.post(path))
        .set('Cookie', cookie ?? '')
        .send(body ?? {}),
    put: (path: string, body?: object, cookie?: string) =>
      withHeaders(agent.put(path))
        .set('Cookie', cookie ?? '')
        .send(body ?? {}),
    patch: (path: string, body?: object, cookie?: string) =>
      withHeaders(agent.patch(path))
        .set('Cookie', cookie ?? '')
        .send(body ?? {}),
    del: (path: string, cookie?: string) =>
      withHeaders(agent.delete(path)).set('Cookie', cookie ?? ''),
  };
}
const rand = () => Math.floor(Math.random() * 250) + 1;

/** The session cookie a response set, as a Cookie header value. */
export function sessionCookie(res: request.Response): string {
  const set = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const cookie = set.find((c) => c.startsWith(`${process.env.SESSION_COOKIE_NAME}=`));
  if (!cookie) throw new Error('no session cookie was set');
  return cookie.split(';')[0]!;
}

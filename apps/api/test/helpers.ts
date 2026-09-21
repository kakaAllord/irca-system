import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import pg from 'pg';
import request from 'supertest';
import { config } from 'dotenv';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import { PasswordService } from '../src/core/auth/password.service.js';

config({ path: '.env.test', quiet: true });

/** The API as production runs it: same modules, same middleware, same order. */
export async function createApp(): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
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

/** Empties every table except the migration log. */
export async function truncateAll(db: pg.Client): Promise<void> {
  const { rows } = await db.query<{ tablename: string }>(
    `select tablename from pg_tables where schemaname = 'public' and tablename <> '_prisma_migrations'`,
  );
  if (rows.length) {
    await db.query(`truncate table ${rows.map((r) => `"${r.tablename}"`).join(', ')} cascade`);
  }
}

const passwords = new PasswordService();

export async function createChurch(db: pg.Client, code = 'IRCA') {
  const id = randomUUID();
  await db.query(
    `insert into churches (id, code, slug, name, updated_at) values ($1, $2, $3, $4, now())`,
    [id, code, code.toLowerCase(), `${code} Church`],
  );
  return { id, code };
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

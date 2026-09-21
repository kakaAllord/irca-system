# Phase 1 — Foundations and login

**Outcome.** One repository holding three apps and a shared package. The live
registration app still deploys exactly as before, from its new folder. A NestJS
API talks to Postgres through Prisma, using three database roles. A person can
open the portal, sign in with email and password, see their name on a
placeholder home page, and sign out. The data model already has churches,
church memberships, and a session row with room for impersonation, so nothing
in Phase 2 has to be retrofitted.

**Not in this phase:** roles, permissions, the sidebar, invitations, email.
Users are created by the seed script and a CLI command only.

Steps at a glance:

| Step | What |
| --- | --- |
| 1.0 | Tools and accounts |
| 1.1 | *Done in Phase 0* (committing the unfinished registration work) |
| 1.2 | *Done in Phase 0* (the monorepo layout) |
| 1.3 | Root tooling: TypeScript, lint, format, scripts |
| 1.4 | `packages/shared` skeleton |
| 1.5 | Local Postgres: five roles, two databases |
| 1.6 | Scaffold `apps/api` (NestJS) |
| 1.7 | API foundations: config, logging, errors, health |
| 1.8 | Prisma and the first four tables |
| 1.9 | Prisma services (read-write and read-only) |
| 1.10 | Password hashing and the password policy |
| 1.11 | Sessions |
| 1.12 | The session guard and `@Public()` |
| 1.13 | Login, logout, `/me` |
| 1.14 | Seed data and the `create-dev` CLI |
| 1.15 | API tests |
| 1.16 | Scaffold `apps/portal` (Next.js 16) with the design tokens |
| 1.17 | Talking to the API from the portal |
| 1.18 | The login page |
| 1.19 | Protecting pages, the placeholder home, sign-out |
| 1.20 | Playwright: the login journey |
| 1.21 | Continuous integration |
| 1.22 | Phase check |

---

## Step 1.0 — Tools and accounts

**Goal:** every developer machine can run the whole system.

**Do**

1. Install **Node 24 LTS** (`node -v` → `v24.x`) and **npm 11** (`npm -v`).
   Use `nvm` if you have several Node versions.
2. Install **PostgreSQL 18** locally and make sure `psql --version` prints 18.x
   and the server is running (`pg_isready` → `accepting connections`).
3. Install **git** and make sure you can `git push` to the repository chosen
   in Phase 0, step 0.7 (recommended: `git@github.com:kakaAllord/irca-system.git`).
   Ask the owner to add you as a collaborator, and to give you a copy of
   `design/admin/`, which goes in the working folder next to the repository
   (`~/dev/irca/design/admin/`). It is not in the repository.
4. Accounts you need access to (ask the owner): GitHub repository, Vercel team
   (registration project), Neon project. Resend and the API host (Railway or
   Render) come in Phase 3 and Phase 6.
5. Read, in this order: `docs/plan/README.md`, `docs/plan/00-decisions.md`,
   `docs/plan/00-restructure.md` (Phase 0), then this file to the end before
   starting Step 1.3.

**Check:** `node -v && npm -v && psql --version && pg_isready` prints four
lines with no error.

---

## Step 1.1 — (done in Phase 0)

Committing the unfinished registration work was done in Phase 0, steps 0.4
and 0.5. **Check before going on:** `git log --oneline` in `~/dev/irca-system`
shows `1bdf8a3 Open the form by asking who they are`, and Phase 0's checklist
has no unticked item except those waiting on GitHub and Vercel.

---

## Step 1.2 — (done in Phase 0)

The monorepo (`apps/`, `packages/`, `docs/`, the workspace root and the
single lockfile) was built in Phase 0, steps 0.2–0.6.
The layout this phase ends with:

```
irca-system/
├── apps/
│   ├── api/                   ← NestJS (Step 1.6)
│   ├── portal/                ← Next.js (Step 1.16)
│   └── registration/          ← the live visitor form (Phase 0)
├── packages/
│   └── shared/                ← Step 1.4
├── docs/plan/
├── e2e/                       ← Playwright (Step 1.20)
├── .github/workflows/ci.yml   ← Step 1.21
├── package.json  package-lock.json  tsconfig.base.json  eslint.config.mjs
├── .prettierrc  .editorconfig  .nvmrc  .gitignore  README.md
```

---

## Step 1.3 — Root tooling

**Goal:** one TypeScript, lint and format configuration for every workspace,
and the root scripts that start everything together.

**Do**

0. Phase 0 left the root `package.json` with only `build`, `typecheck`,
   `lint` and `test`. Add these now:

   ```json
   "scripts": {
     "dev": "concurrently -n shared,api,portal,reg -c gray,blue,green,magenta \"npm run dev -w @irca/shared\" \"npm run start:dev -w @irca/api\" \"npm run dev -w @irca/portal\" \"npm run dev -w @irca/registration\"",
     "predev": "npm run build -w @irca/shared",
     "build": "npm run build -w @irca/shared && npm run build --workspaces --if-present",
     "format": "prettier --write .",
     "db:migrate": "npm run db:migrate -w @irca/api",
     "db:reset": "npm run db:reset -w @irca/api",
     "db:seed": "npm run db:seed -w @irca/api"
   },
   "devDependencies": { "concurrently": "^9.0.0", "prettier": "^3.3.0", "typescript": "5.9.3" }
   ```

   `dev` and `build` refer to workspaces that do not exist until Steps 1.4,
   1.6 and 1.16. Until then, run the registration app alone with
   `npm run dev -w @irca/registration`. Note that `build` builds `@irca/shared`
   twice (once first, once in the loop). That is harmless, and it guarantees the
   apps never build against a stale copy.

1. `.nvmrc` containing `24`. `.editorconfig` with 2-space indent, LF, UTF-8,
   final newline.
2. `.prettierrc`:

   ```json
   { "singleQuote": true, "trailingComma": "all", "printWidth": 100, "semi": true }
   ```

   `.prettierignore`: `node_modules`, `.next`, `dist`,
   `package-lock.json`, `apps/registration/public`, `docs`.
3. `tsconfig.base.json` at the root:

   ```json
   {
     "compilerOptions": {
       "target": "ES2023",
       "lib": ["ES2023"],
       "strict": true,
       "noUncheckedIndexedAccess": true,
       "noImplicitOverride": true,
       "exactOptionalPropertyTypes": false,
       "forceConsistentCasingInFileNames": true,
       "skipLibCheck": true,
       "esModuleInterop": true,
       "resolveJsonModule": true,
       "isolatedModules": true
     }
   }
   ```

   Each workspace's `tsconfig.json` will `"extends": "../../tsconfig.base.json"`
   and add what it needs (Next needs `jsx`, `dom` libs and its plugin, and Nest
   needs `experimentalDecorators` and `emitDecoratorMetadata`). **Do not change
   `apps/registration/tsconfig.json` in this phase.** It works, and it is live.
4. ESLint flat config at the root (`eslint.config.mjs`) using
   `typescript-eslint` recommended rules. Add `no-console: warn` (use the logger
   instead), and add `@typescript-eslint/no-floating-promises: error` for
   `apps/api` (a forgotten `await` on a write is a silent bug).
5. `npm i -D eslint typescript-eslint @eslint/js globals` at the root (plain `npm i` at the
   root installs there; npm rejects `-w .`).

**Check:** `npm run format -- --check` and `npx eslint apps/registration`
finish. Fix or explicitly ignore anything they report in *new* files only. Do
not reformat the registration app in this step, since that would bury real diffs.

**Commit:** "Share one TypeScript, lint and format setup across workspaces".

---

## Step 1.4 — `packages/shared` skeleton

**Goal:** a package every app can import as `@irca/shared`, built to plain
JavaScript so NestJS (CommonJS) and Next.js (ESM) can both consume it.

**Do**

1. Create the folder with this structure:

   ```
   packages/shared/
   ├── package.json
   ├── tsconfig.json
   ├── tsup.config.ts
   └── src/
       ├── index.ts
       ├── errors.ts          ← API error codes (below)
       └── auth.ts            ← zod schema for login (Step 1.13)
   ```

2. `package.json`:

   ```json
   {
     "name": "@irca/shared",
     "version": "0.0.0",
     "private": true,
     "main": "./dist/index.cjs",
     "module": "./dist/index.js",
     "types": "./dist/index.d.ts",
     "exports": {
       ".": {
         "types": "./dist/index.d.ts",
         "import": "./dist/index.js",
         "require": "./dist/index.cjs"
       }
     },
     "scripts": {
       "build": "tsup",
       "dev": "tsup --watch",
       "typecheck": "tsc --noEmit",
       "test": "vitest run"
     },
     "dependencies": { "zod": "^3.23.0" },
     "devDependencies": { "tsup": "^8.0.0", "vitest": "^2.0.0" }
   }
   ```

3. `tsup.config.ts`:

   ```ts
   import { defineConfig } from 'tsup';
   export default defineConfig({
     entry: ['src/index.ts'],
     format: ['esm', 'cjs'],
     dts: true,
     clean: true,
     sourcemap: true,
   });
   ```

4. `src/errors.ts` holds the error codes the API can send and the portal
   understands. Start with these, and add more as phases need them:

   ```ts
   export const ErrorCode = {
     VALIDATION_FAILED: 'VALIDATION_FAILED',
     UNAUTHENTICATED: 'UNAUTHENTICATED',
     INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
     ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
     FORBIDDEN: 'FORBIDDEN',
     IMPERSONATION_READ_ONLY: 'IMPERSONATION_READ_ONLY',
     NOT_FOUND: 'NOT_FOUND',
     CONFLICT: 'CONFLICT',
     RATE_LIMITED: 'RATE_LIMITED',
     CSRF_REJECTED: 'CSRF_REJECTED',
     INTERNAL: 'INTERNAL',
   } as const;
   export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

   /** The one error shape the API ever returns. */
   export type ApiError = {
     error: { code: ErrorCode; message: string; details?: unknown };
     requestId: string;
   };
   ```

5. `src/index.ts` re-exports everything: `export * from './errors'; export * from './auth';`
6. The root `predev`, `build` and `dev` scripts from Step 1.3 already build
   and watch this package. Nothing to add.

**Check:** `npm run build -w @irca/shared` creates `packages/shared/dist/`
with `index.js`, `index.cjs` and `index.d.ts`.

**Commit:** "Add a shared package for code the apps must agree on".

---

## Step 1.5 — Local Postgres: five roles, two databases

**Goal:** the same role separation locally as in production, so read-only
impersonation, append-only audit and row-level security are tested on every
machine.

**Why five roles** (see `00-decisions.md` D11 and D19):

| Role | Used by | Can | Row-level security (Phase 2, step 2.4a) |
| --- | --- | --- | --- |
| `irca_owner` | Prisma migrations only | Everything: owns the tables, runs DDL. Never used by the running API. | Not applied (table owner) |
| `irca_core` | The API's **core** code only: sign-in, sessions, permission resolution, audit writes, usage, jobs, the dev console | `SELECT/INSERT/UPDATE/DELETE` like `irca_app` (the same revokes apply) | Sees **every church** through an explicit "core" policy |
| `irca_app` | The API's **feature modules** (Admin, Finance, Membership…) | `SELECT/INSERT/UPDATE/DELETE` on business tables. Only `SELECT/INSERT` on `audit_events`. No `DELETE` on finance transactions. | Sees **only the church set for the current transaction** |
| `irca_readonly` | Feature modules during every impersonated request | `SELECT` only | Same as `irca_app` |
| `irca_backup` | The nightly backup job only (Phase 6, step 6.8) | `SELECT` only | Sees every church (read-only "core" policy) |

**Do**

1. Open `psql` as your local superuser (`sudo -u postgres psql` on Linux) and
   run, replacing the passwords with your own local ones:

   ```sql
   create role irca_owner    login password 'owner_local_pw'  createdb;
   create role irca_core     login password 'core_local_pw';
   create role irca_app      login password 'app_local_pw';
   create role irca_readonly login password 'ro_local_pw';
   create role irca_backup   login password 'backup_local_pw';

   create database irca_dev  owner irca_owner;
   create database irca_test owner irca_owner;

   -- A runaway query from one church must not hold connections every church
   -- shares. Set here, as the superuser, because changing another role's
   -- settings needs rights the migration role must not have. The core role gets
   -- longer, because nightly jobs scan every church.
   alter role irca_app      set statement_timeout = '10s';
   alter role irca_readonly set statement_timeout = '10s';
   alter role irca_core     set statement_timeout = '60s';
   ```

   `createdb` on the owner is needed because `prisma migrate dev` creates a
   temporary "shadow" database to check migrations.
2. The grants are **not** typed by hand. They go in the first migration
   (Step 1.8), so every environment, including Neon, gets exactly the same ones.

**Check:**
`psql "postgresql://irca_app:app_local_pw@localhost:5432/irca_dev" -c 'select current_user'`
prints `irca_app`.

**Commit:** nothing yet (no files changed). Record the passwords only in your
`.env` (Step 1.7).

---

## Step 1.6 — Scaffold `apps/api`

**Goal:** an empty NestJS 12 app living in the workspace.

**What NestJS 12 generates, and why we keep it** (this differs from older
Nest tutorials and from shoprex):

| NestJS 12 default | What it means for you |
| --- | --- |
| `"type": "module"`, `module: nodenext` | The API is an **ES-module** project. **Relative imports end in `.js`** (`import { AppModule } from './app.module.js'`), even though the file is `.ts`. Leaving it off compiles but fails at runtime. |
| **Vitest** (`vitest.config.ts`, `vitest.config.e2e.ts`) | Tests use Vitest, not Jest. `describe/it/expect` are globals. Unit tests are `*.spec.ts`, and e2e tests are `*.e2e-spec.ts` under `test/`. |
| **oxlint** with type-aware rules | `npm run lint -w @irca/api` runs oxlint, whose config already makes `no-floating-promises` an error. The root ESLint still runs over the API for the shared rules (and the import restrictions from 1.9). |
| **TypeScript 6** in the API's own `devDependencies` | npm installs it inside `apps/api/node_modules`. The rest of the repository stays on the root's TypeScript 5.9.3 until the registration app is upgraded. |

**Do**

1. From the repository root:

   ```bash
   npx -y @nestjs/cli@12 new api --directory apps/api --package-manager npm \
     --skip-git --skip-install --strict
   ```

2. Delete what we do not use: `apps/api/.prettierrc` (the root one applies),
   `src/app.controller.ts`, `src/app.service.ts`, `src/app.controller.spec.ts` and
   `test/app.e2e-spec.ts`. In `package.json`, remove the `deploy` script and the
   `@nestjs/mau` dev dependency (Nest's hosted deployment service; hosting is
   decided in Phase 6).
3. In `apps/api/package.json`: `"name": "@irca/api"`, add `"@irca/shared": "*"`
   to dependencies, and make the scripts:

   ```json
   "scripts": {
     "build": "nest build",
     "start:dev": "nest start --watch",
     "start:debug": "nest start --debug --watch",
     "start:prod": "node dist/main.js",
     "typecheck": "tsc --noEmit -p tsconfig.json",
     "lint": "oxlint --type-aware src/ test/",
     "test": "vitest run --passWithNoTests",
     "test:watch": "vitest",
     "test:e2e": "vitest run --config ./vitest.config.e2e.ts --passWithNoTests"
   }
   ```

   Steps 1.8 and 1.14 add the `db:*` and `cli` scripts.
4. `apps/api/tsconfig.json`: keep what Nest generated, and add
   `"extends": "../../tsconfig.base.json"` at the top, so the repository-wide
   strictness (`noUncheckedIndexedAccess` and the rest) applies here too.
5. `src/app.module.ts` becomes an empty `@Module({})`, and `src/main.ts` listens
   on `process.env.PORT ?? 4000` (the portal takes 3000, registration 3001).
6. `npx prettier --write apps/api`, then `npm install` at the root.

**Check:** `npm run build -w @irca/api && node apps/api/dist/main.js` logs
`Nest application successfully started`. `npm run typecheck -w @irca/api` and
`npm run lint -w @irca/api` are clean.

**Commit:** "Scaffold the NestJS API".

---

## Step 1.7 — API foundations: config, logging, errors, health

**Goal:** the API refuses to start with bad configuration, logs every request
with an id, returns one error shape, and has a health endpoint.

**Do**

1. Install:
   `npm i -w @irca/api @nestjs/config nestjs-pino pino-http pino-pretty helmet cookie-parser nestjs-cls zod`
   and `npm i -D -w @irca/api @types/cookie-parser`.
2. **`apps/api/.env.example`** (commit this) and a copy as `.env` (never commit):

   ```bash
   NODE_ENV=development
   PORT=4000
   # Runtime connection for feature modules: the irca_app role (row-level security applies).
   DATABASE_URL=postgresql://irca_app:app_local_pw@localhost:5432/irca_dev
   # Runtime connection for core code only: the irca_core role (sees every church).
   DATABASE_URL_CORE=postgresql://irca_core:core_local_pw@localhost:5432/irca_dev
   # Migrations only: the irca_owner role. On Neon use the direct (non-pooler) host.
   DIRECT_DATABASE_URL=postgresql://irca_owner:owner_local_pw@localhost:5432/irca_dev
   # Impersonated requests: the irca_readonly role.
   DATABASE_URL_READONLY=postgresql://irca_readonly:ro_local_pw@localhost:5432/irca_dev
   # Where the portal lives. Used for links in emails and the Origin check.
   PORTAL_ORIGIN=http://localhost:3000
   SESSION_COOKIE_NAME=irca_session        # production: __Host-irca_session
   SESSION_ABSOLUTE_HOURS=168              # 7 days, then sign in again
   SESSION_IDLE_HOURS=12                   # unused for 12h, then sign in again
   TRUST_PROXY=1                           # how many proxies sit in front (portal rewrite, host LB)
   LOG_LEVEL=debug
   ```

3. **`src/config/env.ts`** validates this with zod at boot:

   ```ts
   // sketch
   import { z } from 'zod';
   export const EnvSchema = z.object({
     NODE_ENV: z.enum(['development', 'test', 'production']),
     PORT: z.coerce.number().default(4000),
     DATABASE_URL: z.string().url(),
     DATABASE_URL_CORE: z.string().url(),
     DIRECT_DATABASE_URL: z.string().url(),
     DATABASE_URL_READONLY: z.string().url(),
     PORTAL_ORIGIN: z.string().url(),
     SESSION_COOKIE_NAME: z.string().min(1),
     SESSION_ABSOLUTE_HOURS: z.coerce.number().int().positive(),
     SESSION_IDLE_HOURS: z.coerce.number().int().positive(),
     TRUST_PROXY: z.coerce.number().int().min(0).default(1),
     LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
   });
   export type Env = z.infer<typeof EnvSchema>;
   export function validateEnv(raw: Record<string, unknown>): Env {
     const parsed = EnvSchema.safeParse(raw);
     if (!parsed.success) {
       // Print every problem at once, so fixing .env is one round trip, not five.
       throw new Error('Invalid environment:\n' + parsed.error.issues
         .map(i => `  ${i.path.join('.')}: ${i.message}`).join('\n'));
     }
     return parsed.data;
   }
   ```

   Register it with `ConfigModule.forRoot({ isGlobal: true, validate: validateEnv })`.
   Add a small `AppConfig` injectable wrapping `ConfigService<Env, true>` so
   other code reads `config.get('PORTAL_ORIGIN')` with types.
4. **Request context** (`src/core/context/`). Configure `ClsModule.forRoot`
   with `global: true` and `middleware: { mount: true, generateId: true, idGenerator: () => randomUUID() }`.
   Define the store type now, even though most fields are filled in later:

   ```ts
   // src/core/context/request-context.ts
   export type RequestContext = {
     requestId: string;
     ip: string | null;
     userAgent: string | null;
     sessionId: string | null;
     userId: string | null;            // the SUBJECT: who the request acts as
     actorUserId: string | null;       // the real person; differs only when impersonating
     churchId: string | null;
     impersonationId: string | null;
     permissions: ReadonlySet<string>; // filled by Phase 2
     platformRole: 'NONE' | 'DEV' | null;
   };
   ```

5. **Logging.** `LoggerModule.forRootAsync` from `nestjs-pino`, with
   `pino-pretty` in development, JSON in production, `genReqId` taken from
   CLS, and `customProps` adding `userId`, `actorUserId` and `churchId` from
   CLS. **Redact** `req.headers.cookie`, `req.headers.authorization`,
   `res.headers["set-cookie"]` and any `password` field.
6. **Errors.** Create `src/core/http/app-error.ts`:

   ```ts
   // sketch
   export class AppError extends HttpException {
     constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
       super({ code, message, details }, status);
     }
   }
   // helpers: forbidden(), notFound(), conflict(code?, details?), validation(details)
   ```

   And `src/core/http/all-exceptions.filter.ts`, registered globally. It turns
   **everything** into the `ApiError` shape from `@irca/shared`:
   `AppError` → its own code, Nest `HttpException` → mapped code by status,
   Prisma `P2002` → `409 CONFLICT`, `P2025` → `404 NOT_FOUND`, anything else →
   `500 INTERNAL` with a generic message (the real error goes to the log only,
   never to the client). Always include `requestId` from CLS.
7. **Validation pipe.** `src/core/http/zod.pipe.ts`: a pipe that takes a zod
   schema and returns `400 VALIDATION_FAILED` with `details` =
   `error.flatten().fieldErrors`. Controllers use it as
   `@Body(new ZodPipe(LoginSchema)) body: LoginInput`.
8. **`main.ts`**:

   ```ts
   // sketch
   const app = await NestFactory.create(AppModule, { bufferLogs: true });
   app.useLogger(app.get(Logger));
   app.set('trust proxy', config.get('TRUST_PROXY'));   // correct client IPs behind the rewrite
   app.use(helmet());
   app.use(cookieParser());
   app.setGlobalPrefix('v1', { exclude: ['health'] });
   app.enableShutdownHooks();
   await app.listen(config.get('PORT'));
   ```

   **No `enableCors`.** The browser never calls the API directly (D8).
9. **Health.** `GET /health` (no prefix, public) returns
   `{ status: 'ok', db: 'ok' | 'down', version }` after `select 1`. Add it once
   Prisma exists (Step 1.9). Until then return `db: 'unknown'`.

**Check**

- Remove `PORTAL_ORIGIN` from `.env` and start the API. It must refuse to start
  and name the missing variable. Put it back.
- `curl -i localhost:4000/health` → `200`, with an `x-request-id` header.
- `curl -i localhost:4000/v1/nope` → `404` with body
  `{"error":{"code":"NOT_FOUND",...},"requestId":"..."}`.

**Commits:** "Refuse to start the API on invalid configuration";
"Log every API request with an id and one error shape".

---

## Step 1.8 — Prisma and the first four tables

**Goal:** `churches`, `users`, `church_memberships` and `sessions` exist,
together with the role grants, all created by migrations.

**Do**

1. Install **Prisma 7** (the stable line; npm's `latest` tag may point at a
   release candidate, so pin it):

   ```bash
   npm i -w @irca/api @prisma/client@7 @prisma/adapter-pg@7 pg
   npm i -D -w @irca/api prisma@7 @types/pg dotenv tsx
   npm install-scripts approve prisma @prisma/engines esbuild   # npm 11 blocks install scripts until allowed
   ```

2. **Do not run `prisma init` inside the repository.** Besides the schema it
   writes agent skill folders (`.claude/`, `.agents/`, `.windsurf/`) and a
   `.env`. Create the two files below by hand.
3. `apps/api/prisma.config.ts`. In Prisma 7, connection strings live here,
   not in the schema, and `.env` is no longer loaded automatically:

   ```ts
   import { config } from 'dotenv';
   import { defineConfig, env } from 'prisma/config';

   config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env', quiet: true });

   export default defineConfig({
     schema: 'prisma/schema.prisma',
     migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
     // The CLI (migrate, seed, studio) connects as irca_owner. The running API
     // never uses this URL: each of its clients gets its own driver adapter (1.9).
     datasource: { url: env('DIRECT_DATABASE_URL') },
   });
   ```

   `prisma/schema.prisma`:

   ```prisma
   generator client {
     provider            = "prisma-client"          // Prisma 7's generator
     output              = "../src/generated/prisma" // gitignored build output
     runtime             = "nodejs"
     moduleFormat        = "esm"
     importFileExtension = "js"                     // the API is nodenext ESM (1.6)
   }

   datasource db {
     provider = "postgresql"                        // no url here in Prisma 7
   }

   enum ChurchStatus {
     ACTIVE
     SUSPENDED
   }

   enum PlatformRole {
     NONE
     DEV
   }

   enum UserStatus {
     INVITED   // exists, has not set a password yet
     ACTIVE
     DISABLED
   }

   enum MembershipStatus {
     INVITED
     ACTIVE
     DISABLED
   }

   /// A tenant. Everything a church owns points here.
   model Church {
     id        String       @id @default(uuid(7)) @db.Uuid
     /// Short uppercase code used in transaction numbers (IRCA-EXP-...).
     /// Cannot change once the church has any finance transaction (enforced in code).
     code      String       @unique @db.VarChar(10)
     /// Lowercase, used in URLs and by API clients.
     slug      String       @unique @db.VarChar(40)
     name      String       @db.VarChar(120)
     timezone  String       @default("Africa/Dar_es_Salaam") @db.VarChar(64)
     currency  String       @default("TZS") @db.Char(3)
     status    ChurchStatus @default(ACTIVE)
     createdAt DateTime     @default(now()) @map("created_at") @db.Timestamptz(6)
     updatedAt DateTime     @updatedAt @map("updated_at") @db.Timestamptz(6)

     memberships ChurchMembership[]

     @@map("churches")
   }

   /// A person who can sign in. Global across churches.
   model User {
     id               String       @id @default(uuid(7)) @db.Uuid
     /// Always stored trimmed and lowercased (done in code, see normalizeEmail).
     email            String       @unique @db.VarChar(254)
     fullName         String       @map("full_name") @db.VarChar(120)
     phone            String?      @db.VarChar(20)
     locale           String       @default("en") @db.VarChar(5)
     /// Null until the person accepts their invitation and sets a password.
     passwordHash     String?      @map("password_hash")
     passwordChangedAt DateTime?   @map("password_changed_at") @db.Timestamptz(6)
     platformRole     PlatformRole @default(NONE) @map("platform_role")
     status           UserStatus   @default(INVITED)
     failedLoginCount Int          @default(0) @map("failed_login_count")
     lockedUntil      DateTime?    @map("locked_until") @db.Timestamptz(6)
     lastLoginAt      DateTime?    @map("last_login_at") @db.Timestamptz(6)
     createdAt        DateTime     @default(now()) @map("created_at") @db.Timestamptz(6)
     updatedAt        DateTime     @updatedAt @map("updated_at") @db.Timestamptz(6)

     memberships ChurchMembership[]
     sessions    Session[]

     @@map("users")
   }

   /// A user's place in one church. Roles hang off this, not off the user,
   /// so one person can hold different roles in two churches.
   model ChurchMembership {
     id          String           @id @default(uuid(7)) @db.Uuid
     churchId    String           @map("church_id") @db.Uuid
     userId      String           @map("user_id") @db.Uuid
     status      MembershipStatus @default(INVITED)
     invitedById String?          @map("invited_by_id") @db.Uuid
     joinedAt    DateTime?        @map("joined_at") @db.Timestamptz(6)
     createdAt   DateTime         @default(now()) @map("created_at") @db.Timestamptz(6)
     updatedAt   DateTime         @updatedAt @map("updated_at") @db.Timestamptz(6)

     church Church @relation(fields: [churchId], references: [id])
     user   User   @relation(fields: [userId], references: [id])

     @@unique([churchId, userId])
     @@index([userId])
     @@map("church_memberships")
   }

   /// One signed-in browser. The cookie holds a random token; only its SHA-256 is stored.
   model Session {
     id             String    @id @default(uuid(7)) @db.Uuid
     tokenHash      String    @unique @map("token_hash") @db.Char(64)
     userId         String    @map("user_id") @db.Uuid
     /// The church this session is currently working in. Null for a dev
     /// who is not impersonating, and for a user with no active membership.
     activeChurchId String?   @map("active_church_id") @db.Uuid
     /// Set while this session is impersonating someone. The FK to
     /// impersonation_sessions is added in Phase 2; the column exists now so
     /// no session code has to change shape later.
     impersonationId String?  @unique @map("impersonation_id") @db.Uuid
     ip             String?   @db.VarChar(64)
     userAgent      String?   @map("user_agent") @db.VarChar(400)
     createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
     lastSeenAt     DateTime  @default(now()) @map("last_seen_at") @db.Timestamptz(6)
     expiresAt      DateTime  @map("expires_at") @db.Timestamptz(6)
     revokedAt      DateTime? @map("revoked_at") @db.Timestamptz(6)
     revokeReason   String?   @map("revoke_reason") @db.VarChar(40)

     user User @relation(fields: [userId], references: [id])

     @@index([userId])
     @@map("sessions")
   }
   ```

   Why `@map`: columns are `snake_case` in SQL (so plain SQL and the dev
   console read naturally), fields are `camelCase` in TypeScript.
4. Create the first migration **without applying it**, so the grants can be
   added to it:
   `npx prisma migrate dev --name init --create-only`.
5. Create a **second** migration for roles and grants:
   `npx prisma migrate dev --name db_roles --create-only`, and put this in its
   `migration.sql`:

   ```sql
   -- Runtime roles. The roles themselves are created outside migrations
   -- (locally in Step 1.5, on Neon in Phase 6), because creating roles needs
   -- privileges the migration role should not have. This file only grants.

   grant usage on schema public to irca_core, irca_app, irca_readonly, irca_backup;

   -- Everything that exists now...
   grant select, insert, update, delete on all tables in schema public to irca_core, irca_app;
   grant usage, select on all sequences in schema public to irca_core, irca_app;
   grant select on all tables in schema public to irca_readonly, irca_backup;

   -- ...and everything later migrations create (they run as irca_owner).
   alter default privileges for role irca_owner in schema public
     grant select, insert, update, delete on tables to irca_core, irca_app;
   alter default privileges for role irca_owner in schema public
     grant usage, select on sequences to irca_core, irca_app;
   alter default privileges for role irca_owner in schema public
     grant select on tables to irca_readonly, irca_backup;

   -- No runtime role needs to see the migration log.
   -- (irca_backup keeps it: a restore needs to know which migrations the dump contains.)
   -- Guarded because Prisma replays migrations into a throwaway "shadow"
   -- database that has no migration log of its own.
   do $$
   begin
     if to_regclass('public._prisma_migrations') is not null then
       revoke all on table _prisma_migrations from irca_readonly, irca_app, irca_core;
     end if;
   end $$;
   ```

   From Phase 2 onward, any table that must be append-only gets its own
   `revoke update, delete ... from irca_core, irca_app` in the migration that
   creates it, and every church-owned table gets its row-level security policies
   in the same migration (02, step 2.4a).
6. Apply both: `npx prisma migrate dev`. Prisma 7 does **not** generate the
   client as part of migrating, so run `npx prisma generate` too. The API's
   `build` and `typecheck` scripts run it first
   (`"build": "prisma generate && nest build"`), and add `db:generate`,
   `db:migrate`, `db:deploy`, `db:reset` and `db:seed` scripts.
7. Ignore the generated client everywhere it would otherwise be checked:
   `apps/api/src/generated/` in `.gitignore`, `.prettierignore`, the ESLint
   ignores and `apps/api/.oxlintrc.json` (`"ignorePatterns"`).

**Check**

```bash
psql "$DATABASE_URL_READONLY" -c "insert into churches(id,code,slug,name,updated_at) values (gen_random_uuid(),'X','x','x',now())"
# → ERROR:  permission denied for table churches        ← this is what we want
psql "$DATABASE_URL" -c "select count(*) from churches"
# → 0
```

**Commits:** "Model churches, users, memberships and sessions";
"Grant the runtime and read-only database roles".

---

## Step 1.9 — Prisma services (core, read-write and read-only)

**Goal:** three Prisma clients, one per runtime role, and a single `Db`
accessor that feature code uses. The accessor already knows how to choose the
read-only client, so Phase 2 only has to flip a flag. Row-level security
(Phase 2, step 2.4a) then plugs in underneath without changing how feature
code calls it.

**Do**

1. `src/core/database/prisma-clients.ts` holds all three clients. In Prisma 7
   each one is built with its **own driver adapter**, a small pg pool connected
   as its role:

   ```ts
   import { PrismaPg } from '@prisma/adapter-pg';
   import { PrismaClient } from '../../generated/prisma/client.js';

   function client(connectionString: string) {
     return { adapter: new PrismaPg({ connectionString, max: 5, connectionTimeoutMillis: 5_000 }) };
   }

   /** Core's own connection, as irca_core: sees every church (row-level security, 2.4a). */
   @Injectable()
   export class PrismaCore extends PrismaClient implements OnModuleDestroy {
     constructor(config: AppConfig) { super(client(config.get('DATABASE_URL_CORE'))); }
     async onModuleDestroy() { await this.$disconnect(); }
   }
   // PrismaRw (DATABASE_URL, irca_app) and PrismaRo (DATABASE_URL_READONLY,
   // irca_readonly): the same shape. These two are used only inside Db.
   ```

2. Pools stay small (five connections each): several roles share one
   Postgres, and on Neon a pooler sits in front of it anyway. A connection that
   cannot be made gives up after five seconds instead of hanging a request.
3. `db.service.ts`:

   ```ts
   // sketch
   /**
    * The only way feature code reaches the database.
    *
    * While the request is impersonating, this hands out the client connected as
    * irca_readonly. That is the database half of "impersonation is read-only":
    * a handler that tries to write anyway gets "permission denied" from Postgres,
    * whatever the guards above it missed.
    */
   @Injectable()
   export class Db {
     constructor(private rw: PrismaRw, private ro: PrismaRo, private cls: ClsService<RequestContext>) {}
     get client(): PrismaClient {
       return this.cls.get('impersonationId') ? this.ro : this.rw;
     }
   }
   ```

   In Phase 2, `client` returns the *tenant-scoped* versions of these (02 step
   2.4), and those also set the church for row-level security on every
   transaction (02 step 2.4a).
4. `DatabaseModule` (global) provides `PrismaCore`, `PrismaRw`, `PrismaRo`
   and `Db`. **Only core modules** (`src/core/**`: auth, sessions, rbac, audit,
   usage, email, jobs) and the dev console (`src/modules/platform`) may inject
   `PrismaCore`. **Nobody** outside `src/core/database` injects `PrismaRw` or
   `PrismaRo`. Feature modules inject `Db`. Enforce it with ESLint
   `@typescript-eslint/no-restricted-imports` under `src/modules/**`: no import
   of `core/database/prisma-clients`, and from `generated/prisma` **types
   only** (`allowTypeImports: true`), since features need model and input types
   but never a client of their own. `src/modules/platform/**` is exempt.
5. Wire `/health` to run `select 1` through `PrismaCore`.

**Check:** `curl localhost:4000/health` → `200 {"status":"ok","db":"ok"}`.
Start the API with `DATABASE_URL_CORE` pointing at a closed port (a real
environment variable overrides `.env`): `503 {"status":"degraded","db":"down"}`.

**Commit:** "Give the API core, read-write and read-only database clients".

---

## Step 1.10 — Password hashing and the password policy

**Goal:** passwords are stored with argon2id and checked against a sensible
policy.

**Do**

1. `npm i -w @irca/api @node-rs/argon2`.
2. `src/core/auth/password.service.ts`:

   ```ts
   // sketch
   const OPTIONS = { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };
   // A real hash of a random string. Verifying against it when the email is
   // unknown makes "no such user" take as long as "wrong password", so response
   // time does not reveal which emails have accounts.
   const DUMMY_HASH = '$argon2id$v=19$m=19456,t=2,p=1$...';   // generate once with hash('x') and paste

   hash(plain: string): Promise<string>
   verify(hash: string | null, plain: string): Promise<boolean>  // null → verify DUMMY_HASH, return false
   needsRehash(hash: string): boolean                           // params changed since it was made
   ```

3. **Password policy, split in two.** The length rule (`PASSWORD_MIN = 10`,
   `PASSWORD_MAX = 128`, `PasswordSchema`) lives in `packages/shared/src/auth.ts`,
   so the portal shows it live as you type. The **common-password list** lives
   only in the API (`src/core/auth/common-passwords.ts`): 9,126 breached
   passwords of 10+ characters from the UK NCSC's top-100,000 list, about 115 KB,
   which is too heavy to ship to browsers. Regenerate it with
   `node apps/api/scripts/gen-common-passwords.mjs [downloaded-file]`. Pass a file
   when Node's `fetch` cannot reach GitHub (it ignores proxies that `curl`
   honours). `PasswordService.check()` adds church-obvious ones (`jesusislord`,
   `arusha2026`, `ircaarusha`…) and returns `too_short | too_long | too_common | null`.
   No "must contain a symbol" rules: length is what matters (NIST SP 800-63B).
4. Unit tests: hash/verify round trip; `verify(null, …)` is false and takes
   roughly as long as a real verify (assert > 5 ms); the policy rejects 9
   characters, 129 characters and `Password123`.

**Check:** `npm test -w @irca/api -- password` passes.

**Commit:** "Hash passwords with argon2id behind a length-first policy".

---

## Step 1.11 — Sessions

**Goal:** create, look up, refresh and revoke sessions safely.

**Do**

`src/core/auth/session.service.ts` (injects `PrismaCore`: sessions are
infrastructure, must be writable even during impersonation, and are looked up
before any church is known):

1. **`create(userId, activeChurchId, ip, userAgent)`**
   - `token = randomBytes(32).toString('base64url')` (256 bits).
   - Store `tokenHash = sha256hex(token)`,
     `expiresAt = now + SESSION_ABSOLUTE_HOURS`.
   - Return `{ token, session }`. **The raw token is never stored or logged.**
2. **`resolve(token)`**, called on every request by the guard:
   - Find by `tokenHash`, including `user`.
   - Reject if not found, `revokedAt` set, `expiresAt < now`,
     `lastSeenAt < now − SESSION_IDLE_HOURS`, `user.status !== ACTIVE`, or
     the user's `passwordChangedAt > session.createdAt` (a password change signs
     out every older session).
   - If the active church is set: reject if the church is `SUSPENDED`
     (except for devs) or the membership is no longer `ACTIVE`. Rather than
     rejecting the whole session, clear `activeChurchId` and let the user pick
     another church.
   - **Touch:** if `lastSeenAt` is older than 5 minutes, update it. Throttling
     the write keeps a busy page from writing on every request.
3. **`revoke(sessionId, reason)`** and **`revokeAllForUser(userId, reason, exceptSessionId?)`**.
   Set `revokedAt` and `revokeReason`. Never delete. The dev console counts them.
4. **Cookie options** in one place (`session.cookie.ts`):

   ```ts
   // sketch
   export const cookieOptions = (env: Env) => ({
     httpOnly: true,
     secure: env.NODE_ENV === 'production',
     sameSite: 'lax' as const,
     path: '/',
     maxAge: env.SESSION_ABSOLUTE_HOURS * 3600 * 1000,
     // No domain: host-only. In production the name starts with __Host-, which
     // the browser only accepts when secure, path=/ and no domain are all true.
   });
   ```

5. **Choosing the active church at login:** if the user has exactly one
   `ACTIVE` membership in an `ACTIVE` church, use it. If several, use the most
   recently used one (store `lastChurchId` in a later step, and for now take the
   first by `joinedAt`). If none: `null` (devs, or a user whose memberships were
   all disabled, who will see a "no access" page).

**Check:** unit tests with a real `irca_test` database: create → resolve
works; revoke → resolve null; set `lastSeenAt` 13 hours back → null; set
`passwordChangedAt` after creation → null.

**Commit:** "Store sessions server-side so they can be revoked at once".

---

## Step 1.12 — The session guard and `@Public()`

**Goal:** every route requires a signed-in session unless it says otherwise.

**Do**

1. Decorators in `src/core/auth/decorators.ts`:
   - `@Public()`: no session needed (login, health, accept-invite later).
   - `@AuthenticatedOnly()`: a session is needed, but no particular permission
     (`/me`, logout). Phase 2's permission guard reads this.
2. `SessionGuard` (registered as the **first** `APP_GUARD`):

   ```ts
   // sketch
   canActivate(ctx) {
     const req = ctx.switchToHttp().getRequest<Request>();
     this.cls.set('ip', req.ip ?? null);
     this.cls.set('userAgent', req.get('user-agent')?.slice(0, 400) ?? null);
     const token = req.cookies?.[this.config.get('SESSION_COOKIE_NAME')];
     const resolved = token ? await this.sessions.resolve(token) : null;
     if (resolved) {
       this.cls.set('sessionId', resolved.session.id);
       this.cls.set('userId', resolved.user.id);
       this.cls.set('actorUserId', resolved.user.id);   // Phase 2 changes this when impersonating
       this.cls.set('churchId', resolved.session.activeChurchId);
       this.cls.set('platformRole', resolved.user.platformRole);
     }
     if (this.reflector.getAllAndOverride(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
     if (!resolved) throw new AppError(401, ErrorCode.UNAUTHENTICATED, 'Please sign in.');
     return true;
   }
   ```

   Note that it resolves the session **even on public routes**, so the login
   endpoint knows if someone is already signed in, and audit rows on public
   routes still get a user when there is one.
3. **CSRF guard** (second `APP_GUARD`): for `POST/PUT/PATCH/DELETE`, require
   the header `X-IRCA-Client` to equal `portal` or `registration`, and, if an
   `Origin` header is present, require it to equal `PORTAL_ORIGIN`. Otherwise
   `403 CSRF_REJECTED`. A cross-site HTML form cannot set a custom header, so
   together with `SameSite=Lax` this closes CSRF.

**Check:** `curl -i -X POST localhost:4000/v1/auth/logout` →
`403 CSRF_REJECTED`. With `-H 'X-IRCA-Client: portal'` → `401 UNAUTHENTICATED`.

**Commit:** "Require a session on every route unless it is marked public".

---

## Step 1.13 — Login, logout, `/me`

**Goal:** the three endpoints Phase 1 needs.

**Do**

1. In `packages/shared/src/auth.ts`:

   ```ts
   export const normalizeEmail = (e: string) => e.trim().toLowerCase();
   export const LoginSchema = z.object({
     email: z.string().trim().toLowerCase().email().max(254),
     password: z.string().min(1).max(PASSWORD_MAX),   // no policy check on login: old passwords must still work
   });
   export type LoginInput = z.infer<typeof LoginSchema>;

   export type MeResponse = {
     user: { id: string; email: string; fullName: string; platformRole: 'NONE' | 'DEV' };
     church: { id: string; code: string; slug: string; name: string } | null;
     churches: { id: string; name: string }[];   // every church this user can switch to
     permissions: string[];                        // Phase 2
     modules: unknown[];                           // Phase 2
     impersonation: null;                          // Phase 2 fills in the shape
   };
   ```

2. `npm i -w @irca/api @nestjs/throttler`. Register `ThrottlerModule` with a
   default of 300 requests/minute per IP, and on the login route use
   `@Throttle({ default: { limit: 10, ttl: 60_000 } })`.
3. **`POST /v1/auth/login`** (`@Public()`), in `AuthService.login`:
   1. Parse with `LoginSchema`.
   2. Find the user by email.
   3. If found and `lockedUntil > now` → `429 ACCOUNT_LOCKED`, message
      "Too many attempts. Try again in 15 minutes." (Do not verify the
      password.)
   4. `ok = await passwords.verify(user?.passwordHash ?? null, password)`.
   5. If `!ok || user.status !== 'ACTIVE'`: when the user exists, increment
      `failedLoginCount` and, on reaching 5, set `lockedUntil = now + 15 min`
      and reset the count. Return `401 INVALID_CREDENTIALS` with
      **"Email or password is incorrect."** Always the same message, whether
      the email exists, the password is wrong, or the account is disabled.
   6. On success: reset `failedLoginCount`, clear `lockedUntil`, set
      `lastLoginAt`, rehash if `needsRehash`, pick the active church, create a
      session, set the cookie, and respond `200` with `MeResponse`.
   7. If the request already had a session, revoke it (`reason: 'relogin'`).
      A new login always gets a new token.
4. **`POST /v1/auth/logout`** (`@AuthenticatedOnly()`): revoke the current
   session (`reason: 'logout'`), clear the cookie (same options,
   `maxAge: 0`), and return `204`.
5. **`GET /v1/auth/me`** (`@AuthenticatedOnly()`): build `MeResponse` from
   CLS plus one query for the user's active memberships. Put this in
   `MeService.build()`, because Phase 2 extends it.
6. Log login successes and failures at `info`, with `userId` when known and
   **never** the password or the email in failures. (Phase 2 moves these into
   the audit log.)

**Check** (with the seed from Step 1.14, or insert a user by hand for now):

```bash
curl -i -c jar -H 'X-IRCA-Client: portal' -H 'Content-Type: application/json' \
  -d '{"email":"dev@irca.local","password":"wrong"}' localhost:4000/v1/auth/login   # 401
curl -i -c jar -H 'X-IRCA-Client: portal' -H 'Content-Type: application/json' \
  -d '{"email":"DEV@irca.local ","password":"<seed password>"}' localhost:4000/v1/auth/login  # 200 + Set-Cookie
curl -i -b jar localhost:4000/v1/auth/me                                         # 200
curl -i -b jar -X POST -H 'X-IRCA-Client: portal' localhost:4000/v1/auth/logout   # 204
curl -i -b jar localhost:4000/v1/auth/me                                         # 401
```

**Commits:** "Sign in with email and password"; "Sign out and describe the
signed-in user".

---

## Step 1.14 — Seed data and the `create-dev` CLI

**Goal:** a fresh database is usable in one command locally, and production
gets its first dev account without anyone writing SQL.

**Do**

1. `prisma/seed.ts`. It **refuses to run unless `NODE_ENV` is `development` or
   `test`**, so a mistake cannot seed production with known passwords:
   - Church **IRCA** (`code: 'IRCA'`, `slug: 'irca'`,
     `name: 'International Revival Church Arusha'`, confirm the official name
     with the owner).
   - `dev@irca.local`, platform role `DEV`, status `ACTIVE`, password
     `dev-password-123`.
   - `admin@irca.local`, `ACTIVE`, with an `ACTIVE` membership in IRCA,
     password `admin-password-123` (becomes Church administrator in Phase 2).
   - `clerk@irca.local`, the same, no roles yet (becomes Finance clerk in Phase 4).
   - A **second church, TEST** (`code: 'TEST'`, `slug: 'test'`), with
     `admin@test.local` (password `admin-password-123`) and, as later phases
     add data, **deliberately overlapping** records: the same person names,
     phone numbers, expense item names and entry dates as IRCA. A leak between
     churches then shows as a wrong row in a test, not an empty page. Every e2e
     run has both churches (`multi-tenancy.md`, section 15).
   - Use `upsert` everywhere, so running the seed twice is harmless.
2. `src/cli/main.ts` builds a Nest *application context* (no HTTP server) and
   dispatches commands. Use `nest-commander` (`npm i -w @irca/api nest-commander`).
   First command:

   ```bash
   npm run cli -w @irca/api -- user:create-dev --email you@example.com --name "Kaka Allord"
   ```

   It **prompts for the password twice** without echoing (never on the command
   line, where it would land in shell history), checks it against
   `PasswordSchema`, and creates or promotes the user to `DEV`, `ACTIVE`.
3. Document both in `apps/api/README.md` under "First run".

**Check:** `npm run db:reset && npm run db:seed` then login with each seeded
account works via curl. `NODE_ENV=production npm run db:seed` exits with an
error and changes nothing.

**Commits:** "Seed a local church and accounts to sign in with"; "Create the
first dev account from the command line".

---

## Step 1.15 — API tests

**Goal:** the login behaviour is pinned by tests running against a real
database.

**Do**

1. `apps/api/.env.test` (committed, local-only credentials) pointing at
   `irca_test` for all four URLs.
2. `test/setup-e2e.ts`: loads `.env.test`, runs `prisma migrate reset --force
   --skip-seed` **once** per run, and exposes helpers:
   `createUser({ platformRole?, churchId?, password? })`, `createChurch()`,
   `login(agent, email, password)`, and `truncateAll()`, which truncates every
   table except `_prisma_migrations` between test files.
3. `test/auth.e2e-spec.ts`. Every one of these is its own `it`:
   - correct credentials → 200, `Set-Cookie` is `HttpOnly`, `SameSite=Lax`,
     `Path=/`;
   - email is case- and whitespace-insensitive;
   - wrong password → 401 with the generic message;
   - unknown email → 401 with **the identical body**;
   - disabled user with the right password → 401, identical body;
   - 5 wrong attempts → the 6th, even with the right password → 429;
   - after 15 minutes (move `lockedUntil` back in the DB) the right password works;
   - `/me` without cookie → 401; with cookie → the user;
   - logout → the same cookie now gets 401;
   - a password change (update `passwordChangedAt`) → old cookie gets 401;
   - a request without `X-IRCA-Client` → 403 `CSRF_REJECTED`;
   - `Origin: https://evil.example` → 403;
   - the raw token does not appear anywhere in the `sessions` table.
4. Add `"test:e2e"` to CI (Step 1.21).

**Check:** `npm run test:e2e -w @irca/api` is green.

**Commit:** "Pin down sign-in behaviour with tests against a real database".

---

## Step 1.16 — Scaffold `apps/portal` with the design tokens

**Goal:** an empty Next.js 16 app that already looks like the design.

**Do**

1. From the root:

   ```bash
   npx create-next-app@16.3.5 apps/portal --ts --tailwind --eslint --app \
     --src-dir --import-alias "@/*" --use-npm --skip-install --disable-git
   ```

   Then delete `apps/portal/package-lock.json` **and the `AGENTS.md` and
   `CLAUDE.md` that create-next-app writes** (agent notes live outside the
   repository), add `agentRules: false` to `apps/portal/next.config.ts` (as in
   Phase 0, step 0.6a), set `"name": "@irca/portal"`,
   `"dev": "next dev -p 3000"`, `"typecheck": "tsc --noEmit"`, add
   `"@irca/shared": "*"`, and pin `next`, `react` and `react-dom` to the **same
   versions as `apps/registration`** (`16.3.5`, `19.3.0`). Run `npm install` at
   the root.
2. Read `node_modules/next/dist/docs/` for: App Router layouts, `proxy.ts`
   (formerly middleware), `rewrites`, `cookies()`. Heed any deprecation notices.
3. Add `transpilePackages: ['@irca/shared']` to `next.config.ts` (harmless
   now, and required in Phase 5 when shared contains the flow).
4. **Design tokens.** Open `../design/admin/IRCA Admin Portal v2.dc.html`
   (outside the repository, from the owner) in a
   browser to see it. The colour values are in its `vars()` function. Put them
   in `src/app/globals.css` as CSS variables, **light as default and dark
   under `[data-theme="dark"]`**:

   ```css
   @import "tailwindcss";

   :root {
     --bg: #FAF8F4; --surface: #FFFFFF; --surface2: #FCFAF7;
     --border: #E6E1D8; --border2: #EFEAE1;
     --fg: #1C1C1C; --fg2: #5C574E; --fg3: #8A8578;
     --accent: #9A5A2B; --accent-br: #E2D3C2; --accent-ink: #FFFFFF;
     --pos: #2E7A54; --pos-bg: #EAF3ED; --pos-br: #CFE3D7;
     --btn-bg: #1C1C1C; --btn-fg: #FAF8F4;
     --chip: #F3EFE7; --input: #F7F4EE; --sidebar: #F3EFE7;
     --thead: #FCFAF7; --hover: #F7F4EE;
     --salv: #2E7A54; --bapt: #2E6F8E; --neutral-bar: #7E8A79;
     --danger: #B3261E; --warn-bg: #FFF4E0; --warn-fg: #7A4B00; --warn-br: #F0D29B;
   }
   [data-theme="dark"] {
     --bg: #1C1C1C; --surface: #232220; --surface2: #1F1E1C;
     --border: #33312D; --border2: #2C2B27;
     --fg: #F2EFE9; --fg2: #A29C91; --fg3: #8E8880;
     --accent: #C98A4B; --accent-br: #4A3E30; --accent-ink: #1C1C1C;
     --pos: #7FC79C; --pos-bg: rgba(127,199,156,.10); --pos-br: rgba(127,199,156,.28);
     --btn-bg: #E8E3DA; --btn-fg: #1C1C1C;
     --chip: #302E2A; --input: #262522; --sidebar: #171614;
     --thead: #1F1E1C; --hover: #282725;
     --salv: #2E7A54; --bapt: #2E6F8E; --neutral-bar: #5E6B5A;
     --danger: #F2B8B5; --warn-bg: #3A2E14; --warn-fg: #F5D08A; --warn-br: #6B5320;
   }
   @theme inline {
     --color-bg: var(--bg); --color-surface: var(--surface); --color-surface2: var(--surface2);
     --color-border: var(--border); --color-fg: var(--fg); --color-fg2: var(--fg2);
     --color-fg3: var(--fg3); --color-accent: var(--accent); --color-accent-ink: var(--accent-ink);
     /* …one line per token, so classes like bg-surface and text-fg2 exist */
     --font-sans: var(--font-geist);
   }
   body { background: var(--bg); color: var(--fg); }
   ```

   The `--danger` and `--warn-*` tokens are not in the design. They are added
   for errors and the impersonation banner. Check them for contrast (WCAG AA,
   4.5:1 for text).
5. Load **Geist** with `next/font/google` in `src/app/layout.tsx` as the
   variable `--font-geist`.
6. **Theme.** The design has a Light/Dark toggle. Store the choice in a cookie
   `irca_theme` (`light`/`dark`, default `dark` as in the design), read it in
   the root layout with `cookies()`, and render `<html data-theme=…>` on the
   server. That way the page never flashes the wrong theme.
7. Create a tiny UI kit in `src/components/ui/` now, used by every later page:
   `Button` (variants `primary` = `--btn-bg`, `secondary` = outlined, `ghost`,
   `danger`, with sizes `sm`/`md` and a `loading` prop that disables it and
   shows a spinner), `Input` (with `label`, `hint`, `error`, always rendering a
   real `<label htmlFor>`), `PasswordInput` (with a show/hide toggle), `Alert`
   (`info`/`error`/`warn`), `Spinner`. Match the design: 12–13 px text, 7–8 px
   radii, 1 px `--border`.

**Check:** `npm run dev -w @irca/portal` → http://localhost:3000 shows a blank
page in the design's dark background with Geist text. Toggling the cookie by
hand switches the theme with no flash on reload.

**Commits:** "Scaffold the portal"; "Carry the design's colours and type into
the portal"; "Add the portal's first UI components".

---

## Step 1.17 — Talking to the API from the portal

**Goal:** one way to call the API from server components and one way from the
browser. Both handle errors the same way.

**Do**

1. `apps/portal/.env.example` (and `.env.local`):

   ```bash
   # Where the portal's server reaches the API. Never exposed to the browser.
   API_INTERNAL_URL=http://localhost:4000
   SESSION_COOKIE_NAME=irca_session
   ```

2. `next.config.ts`: send the browser's `/api/*` to the API.

   ```ts
   async rewrites() {
     return [{ source: '/api/:path*', destination: `${process.env.API_INTERNAL_URL}/v1/:path*` }];
   },
   ```

   The browser now calls `/api/auth/login` on the portal's own origin. The
   API's `Set-Cookie` comes back through the rewrite and is stored for the
   portal's host. **Check in DevTools → Application → Cookies that the cookie
   is on `localhost:3000`.**
3. `src/lib/api/server.ts` (`import 'server-only'`):

   ```ts
   // sketch
   export async function serverApi<T>(path: string, init: RequestInit = {}): Promise<T> {
     const jar = await cookies();
     const name = process.env.SESSION_COOKIE_NAME!;
     const token = jar.get(name)?.value;
     const h = await headers();
     const res = await fetch(`${process.env.API_INTERNAL_URL}/v1${path}`, {
       ...init,
       cache: 'no-store',     // never cache per-user data
       headers: {
         ...init.headers,
         ...(token ? { cookie: `${name}=${token}` } : {}),
         'x-irca-client': 'portal',
         'x-forwarded-for': h.get('x-forwarded-for') ?? '',
       },
     });
     if (res.status === 401) redirect(`/login?next=${encodeURIComponent(currentPath(h))}`);
     if (!res.ok) throw new ApiRequestError(res.status, await res.json());
     return res.status === 204 ? (undefined as T) : res.json();
   }
   ```

4. `src/lib/api/client.ts` (browser): `clientApi<T>(path, { method, body })`
   calls `/api${path}`, sets `Content-Type: application/json` and
   `X-IRCA-Client: portal`, and on non-2xx throws `ApiRequestError` carrying
   the parsed `ApiError`. On `401` it sends the browser to `/login?next=…`.
5. `ApiRequestError` lives in `src/lib/api/errors.ts` and has `status`,
   `code`, `message`, `fieldErrors` (from `details` when code is
   `VALIDATION_FAILED`).

**Check:** a temporary server component calling `serverApi('/auth/me')` while
signed out redirects to `/login`. Remove it after.

**Commit:** "Reach the API through the portal's own origin".

---

## Step 1.18 — The login page

**Goal:** a login page that matches the design, works without surprises, and
does not leak which emails have accounts.

**Layout** (centred card on `--bg`, 380 px wide, works on a phone):

```
┌──────────────────────────────────────┐
│   [I]  IRCA                          │   ← the logo mark and wordmark from the design sidebar
│        Admin portal                  │
│                                      │
│   Sign in                            │   ← 20px/600
│   Use the email your church admin    │   ← 12.5px, --fg2
│   invited you with.                  │
│                                      │
│   Email                              │
│   [ you@example.com              ]   │
│   Password                           │
│   [ ••••••••••            ] [Show]   │
│                                      │
│   ┌ Email or password is incorrect ┐ │   ← Alert error, only after a failed attempt
│                                      │
│   [        Sign in        ]          │   ← primary, full width, spinner while submitting
│                                      │
│   Forgot your password?              │   ← link, goes to /forgot-password (Phase 3; hide until then)
└──────────────────────────────────────┘
```

**Do**

1. Route group `src/app/(auth)/` with its own `layout.tsx` (the centred card,
   no sidebar). Page: `src/app/(auth)/login/page.tsx`.
2. The page is a server component. If `serverApi('/auth/me')` succeeds
   (already signed in), `redirect(safeNext(searchParams.next))`. Use a
   variant that returns `null` on 401 instead of redirecting, or you loop.
3. The form is a client component `LoginForm`:
   - `<form>` with `email` (`type="email"`, `autoComplete="username"`,
     `autoFocus`) and `password` (`autoComplete="current-password"`). Those
     autocomplete values are what make password managers work.
   - Validate with `LoginSchema` from `@irca/shared` before sending: an empty
     field shows "Enter your email" / "Enter your password" under the field.
   - On submit: disable the button, show the spinner, and call
     `clientApi('/auth/login', { method: 'POST', body })`.
   - On `INVALID_CREDENTIALS` show the Alert "Email or password is
     incorrect.", keep the email, clear the password and focus it.
   - On `ACCOUNT_LOCKED` or `RATE_LIMITED` show the API's message.
   - On any other error show "Something went wrong. Try again in a moment."
     and log the `requestId` to the console, so support can find it.
   - On success: `router.replace(safeNext(next))` then `router.refresh()`.
4. **`safeNext(next)`** in `src/lib/safe-next.ts`: return `next` only if it
   starts with `/` and not `//` or `/\`. Otherwise return `/`. This prevents
   the login page being used to redirect people to another site. Unit-test it.
5. Page `<title>`: "Sign in · IRCA Admin".
6. Accessibility: the Alert has `role="alert"`, inputs have `aria-invalid` and
   `aria-describedby` on errors, the whole form works with keyboard only, and
   Enter submits.

**Check** (in a browser, both themes, and at 360 px width):

- Wrong password → message, email kept, focus on password.
- Unknown email → **exactly the same** message.
- Right password → lands on `/`.
- Visiting `/login?next=//evil.com` then signing in → lands on `/`, not evil.com.
- The password manager offers to save and later autofills.

**Commits:** "Add the sign-in page"; "Only follow same-site next links after
sign-in".

---

## Step 1.19 — Protecting pages, the placeholder home, sign-out

**Goal:** signed-out visitors can only see `/login`. Signed-in users see who
they are and can sign out.

**Do**

1. **`src/proxy.ts`** (Next 16's name for middleware). It runs before every
   request. If the path is not public (`/login`, `/forgot-password`,
   `/reset-password`, `/accept-invite`, `/_next`, `/favicon.ico`, `/api`) and the
   session cookie is **absent**, redirect to `/login?next=<path>`. It does
   *not* validate the cookie (that needs the API). It only saves a round trip
   for the obvious case. The real check is the layout's `/me` call.
2. Route group `src/app/(app)/` with `layout.tsx`: calls
   `serverApi<MeResponse>('/auth/me')`. A `401` redirects via `serverApi`. It
   renders children for now. Phase 2 turns this layout into the shell.
3. `src/app/(app)/page.tsx`, a placeholder home: "Signed in as **{fullName}**
   ({email})", the church name or "No church selected", and a **Sign out**
   button.
4. Sign-out button (client): `clientApi('/auth/logout', { method: 'POST' })`,
   then `router.replace('/login')` and `router.refresh()`.

**Check**

- Signed out, open `/` → `/login?next=%2F`.
- Sign in → the home page with your name.
- Sign out → `/login`. Press Back → still redirected to login (no cached page).
- Delete the session row in the DB while signed in, and reload → sent to login.

**Commit:** "Keep signed-out visitors on the sign-in page".

---

## Step 1.20 — Playwright: the login journey

**Goal:** the journey that matters most is tested in a real browser on every PR.

**Do**

1. `npm i -D @playwright/test && npx playwright install chromium` (at the root).
2. Create a root `e2e/` folder with `playwright.config.ts`. Its `webServer`
   starts the API (against `irca_test`, seeded) and the portal. Base URL is
   `http://localhost:3000`.
3. `e2e/login.spec.ts`: wrong password shows the message; right password
   lands home and shows the name; sign out returns to login; a deep link
   `/anything` while signed out returns there after sign-in.
4. Root script: `"e2e": "playwright test"`.

**Check:** `npm run e2e` is green locally.

**Commit:** "Test the sign-in journey in a real browser".

---

## Step 1.21 — Continuous integration

**Goal:** every PR is checked the same way, automatically.

**Do** — `.github/workflows/ci.yml`:

```yaml
name: ci
on: [pull_request, push]
jobs:
  check:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:18
        env: { POSTGRES_PASSWORD: postgres }
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready --health-interval 5s --health-timeout 5s --health-retries 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - name: Create roles and test database
        run: |
          psql postgresql://postgres:postgres@localhost:5432/postgres <<'SQL'
          create role irca_owner login password 'owner_local_pw' createdb;
          create role irca_core login password 'core_local_pw';
          create role irca_app login password 'app_local_pw';
          create role irca_readonly login password 'ro_local_pw';
          create role irca_backup login password 'backup_local_pw';
          create database irca_test owner irca_owner;
          SQL
      - run: npm run build -w @irca/shared
      - run: npx prisma generate --schema apps/api/prisma/schema.prisma
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test
      - run: npm run test:e2e -w @irca/api
      - run: npm run build
      - run: npx playwright install --with-deps chromium && npm run e2e
```

**Check:** push the branch. The workflow is green. Break a test on purpose,
push, see it go red, then revert.

**Commit:** "Check every change in CI against a real Postgres".

---

## Step 1.22 — Phase check

Tick every item before starting Phase 2. Put the evidence in the phase PR.

- [ ] Phase 0 is complete, including the GitHub remote and Vercel deploying from `apps/registration`.
- [ ] Production registration still works (make a test registration, then delete it).
- [ ] `npm run db:reset && npm run db:seed && npm run dev` brings up API, portal and registration.
- [ ] Signing in and out works in the portal in both themes and at 360 px.
- [ ] The read-only database role cannot insert (Step 1.8 check).
- [ ] API e2e, portal unit and Playwright tests are green in CI.
- [ ] `apps/api/README.md` and `apps/portal/README.md` explain first run.
- [ ] This document is corrected wherever reality differed.

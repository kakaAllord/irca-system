# Phase 2 — Skeleton: modules, RBAC, read-only impersonation, audit, usage

**Outcome.** The system knows what modules exist (from code), which ones each
church has enabled (from the database), and what each signed-in person may do.
Every API route is protected by a permission, and the API will not boot if one
is not. Impersonation works at the API level and is read-only in three
independent layers. Every change and every impersonated view lands in an
append-only audit log. Every request is counted per church per day, so the dev
console in Phase 6 has history from today. The portal has its real shell: the
design's sidebar and top bar, a church switcher, the impersonation banner, and
`can()` for showing and hiding things.

**Why this comes before any real page:** every later page is a thin layer on
this. If RBAC or tenancy is bolted on after pages exist, every page gets
revisited, and one gets missed.

| Step | What |
| --- | --- |
| 2.1 | Module manifests in `packages/shared` |
| 2.2 | The RBAC, impersonation, audit and usage tables |
| 2.3 | Syncing code-defined permissions and system roles into the database |
| 2.4 | Tenant isolation, layer 1: the Prisma extension |
| 2.4a | Tenant isolation, layer 2: PostgreSQL row-level security |
| 2.4b | Control plane, tenant plane, and room for dedicated databases |
| 2.5 | Resolving a person's effective permissions |
| 2.6 | `@RequirePermission()` and the permission guard |
| 2.7 | The API refuses to boot with an unprotected route |
| 2.8 | Impersonation in the API: start, stop, expire |
| 2.9 | The three read-only layers |
| 2.10 | The audit log |
| 2.11 | Usage metering |
| 2.11a | Per-church rate limits, quotas and cache headers |
| 2.12 | Background jobs |
| 2.13 | `/me` grows up, and switching church |
| 2.14 | The portal shell |
| 2.15 | `can()`, page guards and the "no access" states |
| 2.16 | The impersonation banner |
| 2.17 | Writing down how to add a module |
| 2.18 | Tests that prove the skeleton holds |
| 2.19 | Phase check |

---

## 2.1 — Module manifests in `packages/shared`

**Goal:** each module describes itself in one file: its permissions, its
default roles, and its pages. The API, the portal and the database all derive
from these files.

**Do**

1. `packages/shared/src/rbac/define.ts`:

   ```ts
   export type PermissionKind = 'read' | 'write';

   export type PermissionDef = {
     kind: PermissionKind;
     /** Shown to admins in the role editor, in plain words. */
     label: string;
     /** Optional longer explanation, e.g. why this one is sensitive. */
     hint?: string;
   };

   export type NavItem = {
     label: string;
     href: string;           // absolute portal path, e.g. '/finance/transactions'
     icon: NavIcon;          // which of the sidebar's drawings goes beside it
                             // (letters in the design's sidebar until the
                             // owner asked for real icons; see NavIcon.tsx)
     permission: string;     // shown only if the user has this permission
   };

   export type SystemRoleDef = {
     key: string;            // stable id, e.g. 'finance.clerk'; never rename
     name: string;           // default display name, admins may not rename system roles
     description: string;
     permissions: string[];
   };

   export type ModuleDef<P extends Record<string, PermissionDef>> = {
     key: string;            // 'finance'
     name: string;           // 'Finance'
     description: string;
     /** 'core' modules cannot be disabled (only 'admin' is core). */
     kind: 'core' | 'department';
     /** First page when the module is opened. */
     home: string;
     permissions: P;
     systemRoles: SystemRoleDef[];
     nav: NavItem[];
   };

   export function defineModule<const P extends Record<string, PermissionDef>>(m: ModuleDef<P>) {
     // Every permission key must start with the module key, so ownership is obvious
     // from the string alone and two modules can never collide.
     for (const k of Object.keys(m.permissions)) {
       if (!k.startsWith(m.key + '.')) throw new Error(`${k} does not belong to module ${m.key}`);
     }
     for (const r of m.systemRoles) for (const p of r.permissions) {
       if (!(p in m.permissions)) throw new Error(`Role ${r.key} uses unknown permission ${p}`);
     }
     for (const n of m.nav) {
       if (!(n.permission in m.permissions)) throw new Error(`Nav ${n.href} uses unknown permission ${n.permission}`);
     }
     return m;
   }
   ```

2. `packages/shared/src/modules/admin.ts`. The admin module is `core`:

   ```ts
   export const adminModule = defineModule({
     key: 'admin',
     name: 'Admin',
     description: 'People, access and portals for this church.',
     kind: 'core',
     home: '/admin/users',
     permissions: {
       'admin.users.read':        { kind: 'read',  label: 'See who has access' },
       'admin.users.invite':      { kind: 'write', label: 'Invite new people' },
       'admin.users.manage':      { kind: 'write', label: 'Change roles, disable and re-enable people' },
       'admin.users.impersonate': { kind: 'read',  label: 'View the portal as another person (read-only)',
                                    hint: 'Every use is logged for the platform team. The person viewed is not told.' },
       'admin.roles.read':        { kind: 'read',  label: 'See roles and what they allow' },
       'admin.roles.manage':      { kind: 'write', label: 'Create and edit custom roles' },
       'admin.modules.read':      { kind: 'read',  label: 'See which portals are on' },
       'admin.modules.manage':    { kind: 'write', label: 'Turn portals on and off' },
       'admin.audit.read':        { kind: 'read',  label: 'Read the activity log' },
       'admin.church.manage':     { kind: 'write', label: 'Edit church details' },
     },
     systemRoles: [
       { key: 'admin.administrator', name: 'Church administrator',
         description: 'Full control of people, roles and portals.',
         permissions: ['admin.users.read','admin.users.invite','admin.users.manage','admin.users.impersonate',
                       'admin.roles.read','admin.roles.manage','admin.modules.read','admin.modules.manage',
                       'admin.audit.read','admin.church.manage'] },
       { key: 'admin.auditor', name: 'Auditor',
         description: 'Can see who has access and read the activity log, change nothing.',
         permissions: ['admin.users.read','admin.roles.read','admin.modules.read','admin.audit.read'] },
     ],
     nav: [
       { label: 'People',   href: '/admin/users',   icon: 'people',   permission: 'admin.users.read' },
       { label: 'Roles',    href: '/admin/roles',   icon: 'roles',    permission: 'admin.roles.read' },
       { label: 'Portals',  href: '/admin/portals', icon: 'portals',  permission: 'admin.modules.read' },
       { label: 'Activity', href: '/admin/audit',   icon: 'activity', permission: 'admin.audit.read' },
     ],
   });
   ```

   **Why `impersonate` is `kind: 'read'`:** starting an impersonation changes
   no church data. It only changes the actor's own session. Marking it `read`
   would let an impersonator start a *nested* impersonation, though, so 2.8
   forbids that explicitly.
3. `packages/shared/src/modules/platform.ts`: the dev console's permissions.
   It is **not** a church module and never appears in `church_modules`. These
   permissions are granted by `platform_role = 'DEV'`, not by roles:
   `platform.churches.read`, `platform.churches.manage`, `platform.usage.read`,
   `platform.health.read`, `platform.users.impersonate`,
   `platform.impersonations.read` (the only way anyone can read the
   impersonation log: see D16 and 6.4).
4. `packages/shared/src/modules/index.ts`, the registry:

   ```ts
   export const CHURCH_MODULES = [adminModule /*, membershipModule (Phase 5), financeModule (Phase 4) */] as const;
   export const ALL_PERMISSIONS = {
     ...Object.assign({}, ...CHURCH_MODULES.map(m => m.permissions)),
     ...platformModule.permissions,
   } as const;
   export type PermissionKey = keyof typeof ALL_PERMISSIONS;
   export const moduleByKey = (k: string) => CHURCH_MODULES.find(m => m.key === k);
   export const permissionKind = (k: string): PermissionKind | undefined => ALL_PERMISSIONS[k]?.kind;
   ```

   `PermissionKey` is a union of string literals, so
   `@RequirePermission('finance.transactions.craete')` **does not compile**.
5. Tests (`vitest`): `defineModule` throws for a foreign prefix, an unknown
   role permission, and an unknown nav permission. Across modules, all
   permission keys and all system role keys are unique.

**Check:** `npm run build -w @irca/shared && npm test -w @irca/shared`.

**Commits:** "Let each module describe its permissions, roles and pages";
"Describe the admin module".

---

## 2.2 — The RBAC, impersonation, audit and usage tables

**Goal:** everything Phase 2 stores has a table, created by one migration.

**Do** — add to `schema.prisma` (and add the back-relations Prisma asks for):

```prisma
enum PermissionKindDb {
  READ
  WRITE
}

/// Which modules a church has switched on. A row exists for every module the
/// church has ever enabled; turning one off sets enabled=false and keeps the
/// row, so roles and data come back intact when it is turned on again.
model ChurchModule {
  churchId    String    @map("church_id") @db.Uuid
  moduleKey   String    @map("module_key") @db.VarChar(40)
  enabled     Boolean   @default(true)
  enabledAt   DateTime? @map("enabled_at") @db.Timestamptz(6)
  enabledById String?   @map("enabled_by_id") @db.Uuid
  disabledAt  DateTime? @map("disabled_at") @db.Timestamptz(6)
  disabledById String?  @map("disabled_by_id") @db.Uuid

  @@id([churchId, moduleKey])
  @@map("church_modules")
}

/// A mirror of the permissions defined in code, kept so roles can reference
/// them with a foreign key. Written only by the boot-time sync (2.3).
model Permission {
  key         String           @id @db.VarChar(80)
  moduleKey   String           @map("module_key") @db.VarChar(40)
  kind        PermissionKindDb
  label       String           @db.VarChar(200)
  /// Set when the permission disappears from code. Retired permissions are
  /// ignored when resolving, never deleted, so old roles still load.
  retiredAt   DateTime?        @map("retired_at") @db.Timestamptz(6)

  @@map("permissions")
}

model Role {
  id          String    @id @default(uuid(7)) @db.Uuid
  churchId    String    @map("church_id") @db.Uuid
  moduleKey   String    @map("module_key") @db.VarChar(40)
  name        String    @db.VarChar(80)
  description String    @default("") @db.VarChar(300)
  /// Set for roles created from a module's systemRoles. Their permissions are
  /// kept in step with code by the sync and cannot be edited in the portal.
  systemKey   String?   @map("system_key") @db.VarChar(80)
  createdById String?   @map("created_by_id") @db.Uuid
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt   DateTime? @map("deleted_at") @db.Timestamptz(6)

  @@unique([churchId, moduleKey, name])
  @@unique([churchId, systemKey])
  @@map("roles")
}

model RolePermission {
  churchId      String @map("church_id") @db.Uuid
  roleId        String @map("role_id") @db.Uuid
  permissionKey String @map("permission_key") @db.VarChar(80)

  @@id([roleId, permissionKey])
  @@index([churchId])
  @@map("role_permissions")
}

model MembershipRole {
  churchId     String   @map("church_id") @db.Uuid
  membershipId String   @map("membership_id") @db.Uuid
  roleId       String   @map("role_id") @db.Uuid
  grantedById  String?  @map("granted_by_id") @db.Uuid
  grantedAt    DateTime @default(now()) @map("granted_at") @db.Timestamptz(6)

  @@id([membershipId, roleId])
  @@index([churchId])
  @@index([roleId])
  @@map("membership_roles")
}

enum ImpersonationEndReason {
  STOPPED
  EXPIRED
  LOGOUT
  REVOKED
}

model ImpersonationSession {
  id               String    @id @default(uuid(7)) @db.Uuid
  /// The actor's own session that is doing the impersonating.
  sessionId        String    @map("session_id") @db.Uuid
  actorUserId      String    @map("actor_user_id") @db.Uuid
  subjectUserId    String    @map("subject_user_id") @db.Uuid
  churchId         String    @map("church_id") @db.Uuid
  /// The church the actor's session was in before, restored on stop.
  previousChurchId String?   @map("previous_church_id") @db.Uuid
  /// No reason is asked for (owner's decision, 21 Sept 2026, D16). Who, whom,
  /// where and when is the whole record, and only devs can read it.
  startedAt        DateTime  @default(now()) @map("started_at") @db.Timestamptz(6)
  expiresAt        DateTime  @map("expires_at") @db.Timestamptz(6)
  endedAt          DateTime? @map("ended_at") @db.Timestamptz(6)
  endReason        ImpersonationEndReason? @map("end_reason")

  @@index([churchId, startedAt(sort: Desc)])
  @@index([subjectUserId, startedAt(sort: Desc)])
  @@index([actorUserId, startedAt(sort: Desc)])
  @@map("impersonation_sessions")
}

/// Append-only. The app role may insert and read, never update or delete
/// (revoked in the migration below).
model AuditEvent {
  id              String   @id @default(uuid(7)) @db.Uuid
  churchId        String?  @map("church_id") @db.Uuid     // null for platform events
  actorUserId     String?  @map("actor_user_id") @db.Uuid
  subjectUserId   String?  @map("subject_user_id") @db.Uuid
  impersonationId String?  @map("impersonation_id") @db.Uuid
  action          String   @db.VarChar(80)                // 'finance.transaction.created'
  entityType      String?  @map("entity_type") @db.VarChar(60)
  entityId        String?  @map("entity_id") @db.VarChar(80)
  summary         String?  @db.VarChar(300)               // one line a human can read
  before          Json?
  after           Json?
  meta            Json?                                   // method, path, status, durationMs
  ip              String?  @db.VarChar(64)
  userAgent       String?  @map("user_agent") @db.VarChar(400)
  requestId       String?  @map("request_id") @db.VarChar(64)
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  @@index([churchId, createdAt(sort: Desc)])
  @@index([entityType, entityId])
  @@index([actorUserId, createdAt(sort: Desc)])
  @@index([subjectUserId, createdAt(sort: Desc)])
  @@map("audit_events")
}

/// Counters per church per local day. See 2.11 for the metric names.
model UsageDaily {
  churchId String   @map("church_id") @db.Uuid
  day      DateTime @db.Date
  metric   String   @db.VarChar(80)
  value    BigInt   @default(0)

  @@id([churchId, day, metric])
  @@index([day])
  @@map("usage_daily")
}

/// Counters not tied to any church (failed logins for unknown emails, dev console use).
model PlatformUsageDaily {
  day    DateTime @db.Date
  metric String   @db.VarChar(80)
  value  BigInt   @default(0)

  @@id([day, metric])
  @@map("platform_usage_daily")
}

/// Who was active on which day. Gives daily/weekly/monthly active users per church.
model UserActivityDaily {
  churchId String   @map("church_id") @db.Uuid
  userId   String   @map("user_id") @db.Uuid
  day      DateTime @db.Date
  requests Int      @default(0)

  @@id([churchId, userId, day])
  @@index([churchId, day])
  @@map("user_activity_daily")
}

/// One row per background job run, so the dev console can show "last ran, took, failed".
model JobRun {
  id         String    @id @default(uuid(7)) @db.Uuid
  job        String    @db.VarChar(60)
  startedAt  DateTime  @default(now()) @map("started_at") @db.Timestamptz(6)
  finishedAt DateTime? @map("finished_at") @db.Timestamptz(6)
  ok         Boolean?
  error      String?
  stats      Json?

  @@index([job, startedAt(sort: Desc)])
  @@map("job_runs")
}
```

Also add the foreign key `Session.impersonationId → ImpersonationSession.id`
(`onDelete: SetNull`), and foreign keys from every `churchId` above to
`churches.id`, from `roleId` to `roles.id`, from `permissionKey` to
`permissions.key`, and from `membershipId` to `church_memberships.id`.

Create the migration with `--create-only`, then **append** to its SQL:

```sql
-- The activity log is evidence. Nothing that runs the app may rewrite it.
revoke update, delete, truncate on table audit_events from irca_app;
```

Apply: `npx prisma migrate dev`.

**Check:** as `irca_app`, `update audit_events set action='x'` → `permission
denied`. `insert` works.

**Commit:** "Store modules, roles, impersonation, audit and usage".

---

## 2.3 — Syncing code-defined permissions and system roles

**Goal:** after every boot, the database's `permissions` and system roles
match the code exactly, and every church has the admin module enabled.

**Do** — `src/core/rbac/registry-sync.service.ts`, run in
`onApplicationBootstrap` (uses `PrismaCore`, no tenant context: this is core):

1. **Permissions:** upsert every entry of `ALL_PERMISSIONS` (`kind`, `label`,
   `moduleKey`, `retiredAt: null`). For rows in the table that are no longer
   in code, set `retiredAt = now()` if not already set. Never delete.
2. **Per church** (all churches, in a loop, one transaction per church):
   - Ensure `church_modules(church, 'admin')` exists with `enabled = true`.
   - For every module that is **enabled** in that church, ensure each of its
     `systemRoles` exists as a `Role` with that `systemKey`, then make that
     role's `role_permissions` exactly equal to the code's list (insert
     missing, delete extra). Update the name and description if they changed.
3. Put the per-church part in a reusable method, `ensureModuleRoles(churchId,
   moduleKey)`. Enabling a module in Phase 3 calls it too.
4. Wrap the whole sync in a Postgres advisory lock
   (`select pg_advisory_xact_lock(hashtext('registry-sync'))`), so two API
   instances booting together do not race.
5. Log a one-line summary: `registry sync: 17 permissions (0 retired), 1
   church, 6 system roles updated`.
6. Seed: after the sync exists, the seed grants `admin@irca.local` the
   *Church administrator* role (seed must call the sync first, or just
   `ensureModuleRoles`).

**Check:** boot twice; the second boot reports 0 changes. Remove a permission
from the admin manifest, boot: it is marked retired, and roles that had it keep
loading. Put it back: `retiredAt` clears.

**Commit:** "Keep permissions and system roles in step with code at boot".

---

## 2.4 — Tenant isolation: the Prisma extension

**Goal:** a feature developer cannot read or write another church's rows
through Prisma, even by forgetting a `where`.

**Do**

1. `src/core/database/tenant-models.ts`: the list of models that belong to a
   church. **When you add a model with `churchId`, add it here in the same
   commit.** A test (step 6) fails if you forget.

   ```ts
   export const TENANT_MODELS = new Set<string>([
     'ChurchModule', 'Role', 'RolePermission', 'MembershipRole', 'ChurchMembership',
     // Phase 3: 'Invitation'. Phase 4: finance models. Phase 5: membership models.
   ]);
   ```

   `AuditEvent`, `UsageDaily`, `UserActivityDaily` and `ImpersonationSession`
   are **not** here, because only core code writes them, through `PrismaCore`.
2. `src/core/database/tenant.extension.ts`:

   ```ts
   // sketch
   /**
    * Scopes every query on a church-owned model to the church in the request context.
    *
    * It throws rather than guessing when there is no church: a query that
    * silently ran unscoped is exactly the leak this exists to prevent.
    *
    * Limits, which review must catch:
    *  - Nested writes (create: { children: { create: [...] } }) are not
    *    intercepted. Create children with their own call, or set churchId on them.
    *  - $queryRaw / $executeRaw are not intercepted. Raw SQL must filter
    *    church_id itself and carry a `-- tenant: <how>` comment.
    *  - Never connect the `church` relation by hand; set nothing and let this add churchId.
    */
   export function tenantExtension(currentChurchId: () => string | null) {
     return Prisma.defineExtension({
       name: 'tenant',
       query: {
         $allModels: {
           async $allOperations({ model, operation, args, query }) {
             if (!TENANT_MODELS.has(model)) return query(args);
             const churchId = currentChurchId();
             if (!churchId) throw new Error(`${model}.${operation} needs a church in context`);
             const a: any = args ?? {};
             switch (operation) {
               case 'create':
                 a.data = { ...a.data, churchId }; break;
               case 'createMany':
               case 'createManyAndReturn':
                 a.data = [a.data].flat().map((d: object) => ({ ...d, churchId })); break;
               case 'upsert':
                 a.where = { ...a.where, churchId };
                 a.create = { ...a.create, churchId }; break;
               default:   // findUnique(OrThrow), findFirst(OrThrow), findMany, count,
                          // aggregate, groupBy, update(Many), delete(Many)
                 a.where = { ...a.where, churchId };
             }
             return query(a);
           },
         },
       },
     });
   }
   ```

   Adding a non-unique field (`churchId`) to `findUnique`/`update`/`delete`
   `where` is allowed by Prisma 5+ ("extended where unique"). If the row exists
   but belongs to another church, you get "not found", which is exactly right.
3. Change `Db` (from 1.9) to build the scoped clients **once**, at startup,
   with a closure that reads CLS at query time:

   ```ts
   // sketch
   private readonly rwScoped = this.rw.$extends(tenantExtension(() => this.cls.get('churchId')));
   private readonly roScoped = this.ro.$extends(tenantExtension(() => this.cls.get('churchId')));
   get client() { return this.cls.get('impersonationId') ? this.roScoped : this.rwScoped; }
   ```

   Interactive transactions keep the extension, so `tx` is scoped too. (In
   2.4a, interactive transactions move to `db.tx(fn)`, which also sets the church
   for row-level security.)
4. There is **no** "unscoped" escape hatch on `Db`. Code that must see more
   than one church (core, and the dev console in `src/modules/platform`)
   injects `PrismaCore` instead, and ESLint already restricts who may (1.9).
5. Raw SQL rule: any file containing `$queryRaw` or `$executeRaw` under
   `src/modules/**` must contain a `-- tenant:` comment in each query. Add a
   tiny script `scripts/check-raw-sql.mjs` run in `npm run lint` that greps for
   it and fails otherwise.
6. **Test that the list is complete:** read `Prisma.dmmf.datamodel.models`;
   every model with a `churchId` field must be in `TENANT_MODELS` or in an
   explicit `CORE_OWNED_MODELS` allowlist in the test file. Adding a table and
   forgetting the list fails CI.

**Check** — e2e (`test/tenant.e2e-spec.ts`): with two churches A and B and a
role in each, set CLS church = A: `db.client.role.findMany()` returns only A's;
`findUnique({ where: { id: roleOfB } })` returns null; `update` of B's role
throws not-found; `create` gets `churchId = A` even if the caller passed B's
id. With no church in CLS, any tenant query throws.

**Commits:** "Scope every church-owned query to the current church";
"Fail CI when a church-owned model is not scoped".

---

## 2.4a — Tenant isolation, layer 2: PostgreSQL row-level security

**Goal:** even if the Prisma extension is bypassed (raw SQL, a nested write,
a bug, a future developer who never heard of it), **Postgres itself** refuses
to return or accept another church's rows. The two layers are independent:
each one alone keeps churches apart, and a test proves that (step 7).

**How it works, in one paragraph.** Every church-owned table gets row-level
security (RLS) turned on, with a policy saying that the roles `irca_app` and
`irca_readonly` see and write only rows whose `church_id` equals the setting
`app.church_id`. The API sets that value **at the start of every
transaction** with `set_config('app.church_id', '<uuid>', true)`. The `true`
makes it transaction-local, so Postgres forgets it at `COMMIT` or `ROLLBACK`.
That matters because Neon's pooler (PgBouncer in transaction mode) hands the
same server connection to different requests. A session-level `SET` would leak
one church's setting into the next request, and a transaction-local one cannot.
When nothing is set, the policy compares against `NULL` and matches **no rows**:
it fails closed. `irca_core` gets its own policy that sees everything, and
only core code has that connection (1.9).

**Do**

1. **A helper function**, in the Phase 2 migration (append to its SQL):

   ```sql
   -- The church this transaction acts for, or NULL. current_setting(..., true)
   -- returns NULL when never set, and '' once a pooled connection has had it set
   -- and then reset at the end of an earlier transaction; nullif turns both into
   -- NULL, and NULL matches no row.
   create function app_church_id() returns uuid
     language sql stable
     as $$ select nullif(current_setting('app.church_id', true), '')::uuid $$;
   grant execute on function app_church_id() to irca_core, irca_app, irca_readonly;
   ```

2. **The policy template.** For **every** church-owned table (everything in
   `TENANT_MODELS`, plus `invitations` from Phase 3), the migration that creates
   the table also runs:

   ```sql
   alter table <table> enable row level security;

   -- Feature code: one church at a time, for reading and for writing.
   create policy <table>_tenant on <table> for all to irca_app, irca_readonly
     using (church_id = app_church_id())
     with check (church_id = app_church_id());

   -- Core code: every church (sign-in, permission resolution, jobs, dev console).
   create policy <table>_core on <table> for all to irca_core
     using (true) with check (true);

   -- Backups: every church, reading only (the role has no write grants anyway).
   create policy <table>_backup on <table> for select to irca_backup using (true);
   ```

   Do **not** use `force row level security`. The table owner (`irca_owner`,
   which runs migrations and backups) must keep seeing everything. No runtime
   role owns a table, so none of them escapes the policies.

   In this phase apply it to `church_memberships` (from Phase 1),
   `church_modules`, `roles`, `role_permissions` and `membership_roles`.
3. **Core-owned tables get RLS too, with no tenant policy at all,** so
   feature code cannot read them even with raw SQL: `sessions`,
   `impersonation_sessions`, `usage_daily`, `platform_usage_daily`,
   `user_activity_daily`, `job_runs`, and later `email_outbox`,
   `password_reset_tokens` and `api_clients`. For each:

   ```sql
   alter table <table> enable row level security;
   create policy <table>_core on <table> for all to irca_core using (true) with check (true);
   create policy <table>_backup on <table> for select to irca_backup using (true);
   -- no policy for irca_app / irca_readonly: they see zero rows and cannot insert
   ```

4. **`audit_events` enforces D16 in the database.** Church-facing reads can
   never see impersonation rows, whatever the query:

   ```sql
   alter table audit_events enable row level security;
   create policy audit_events_tenant_read on audit_events for select to irca_app, irca_readonly
     using (church_id = app_church_id()
            and impersonation_id is null
            and action not like 'impersonation.%');
   create policy audit_events_tenant_insert on audit_events for insert to irca_app
     with check (church_id = app_church_id() and impersonation_id is null);
   create policy audit_events_core on audit_events for all to irca_core using (true) with check (true);
   create policy audit_events_backup on audit_events for select to irca_backup using (true);
   ```

   `AuditQueries.forChurch()` keeps its own filter too. Two layers, as everywhere.
5. **Setting the church on every transaction** (`src/core/database/rls.ts`):
   - **Single queries** (`db.client.role.findMany(...)`): a second client
     extension, applied on top of the tenant extension from 2.4, runs each
     top-level operation as a two-statement batch transaction, first the
     setting and then the query. This is the pattern in Prisma's own RLS
     example:

     ```ts
     // sketch
     export const rlsExtension = (base: TenantClient, churchId: () => string | null) =>
       Prisma.defineExtension({
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
     ```

   - **Interactive transactions** (sequences, finance entries, anything with
     several statements, and **all raw SQL**) go through a new method,
     `db.tx(fn)`. It opens the transaction on the tenant-scoped client (without
     the batch wrapper, which cannot nest), sets the church as the first
     statement, then runs `fn(tx)`:

     ```ts
     // sketch
     async tx<T>(fn: (tx: TenantTx) => Promise<T>, opts?: { isolationLevel?: Prisma.TransactionIsolationLevel }) {
       const base = this.cls.get('impersonationId') ? this.roScoped : this.rwScoped;
       return base.$transaction(async tx => {
         await tx.$executeRaw`select set_config('app.church_id', ${this.cls.get('churchId') ?? ''}, true)`;
         return fn(tx);
       }, opts);
     }
     ```

   - **Rules, enforced by ESLint** (`no-restricted-syntax`): `db.client.$transaction`,
     `db.client.$queryRaw` and `db.client.$executeRaw` are errors under
     `src/modules/**`. Use `db.tx(tx => tx.$queryRaw…)`. Any SQL string
     containing `set app.` or `set session` is an error everywhere: only
     `set_config(..., true)` inside `db.tx` or the extension is allowed.
   - Forgetting all of this fails **closed**. A transaction without the
     setting sees no rows and cannot insert, so the mistake shows up as an
     empty page in development, never as a leak.
   - Every later reference in this plan to `db.client.$transaction(...)` means
     `db.tx(...)`.
6. **Cost, written in the code comment:** each standalone query becomes
   `BEGIN; select set_config(…); <query>; COMMIT`, which is a few extra round
   trips. The API and Neon sit in the same region, so this is about a
   millisecond each. Phase 10, step 10.1 measures it. Grouping a page's reads into
   one `db.tx` is the remedy if a page ever needs it.
7. **Tests** (`test/rls.e2e-spec.ts`, against the real test database):
   - **RLS alone:** construct `Db` with the tenant extension switched off (a
     test-only flag). With church A set, `findMany` on each tenant table
     returns only A's rows, `findUnique` of B's id returns null, and creating a
     row with `churchId: B` fails with Postgres's `new row violates row-level
     security policy`.
   - **The extension alone:** the reverse (policies dropped in a throwaway
     schema copy), which proves 2.4 still stands on its own.
   - **Pooled connections do not leak:** with a pool of **one** connection,
     run a transaction as church A, then a query with **no** church set. The
     second sees zero rows. Then run as B and see only B.
   - **Outside a transaction** `select current_setting('app.church_id', true)`
     is `''` or null, never a church id.
   - **Raw SQL** in `db.tx` as A cannot select B's rows even with an
     explicit `where church_id = B`.
   - **Core sees all:** `PrismaCore` reads every church's rows, and so does a
     plain `select` as `irca_backup`. As `irca_backup`, `insert` fails.
   - **D16 in SQL:** as `irca_app` with the church set, `select * from
     audit_events` returns no `impersonation.*` rows, even though they exist.
   - **Coverage check (CI):** query `pg_class` and `pg_policies`. Every table
     with a `church_id` column, and every table in the core-only list, has
     `relrowsecurity = true` and its expected policies. A new church-owned table
     without RLS fails CI, just as the `TENANT_MODELS` test fails without the
     extension entry.

**Check:** `psql` as `irca_app`: `select count(*) from roles` → `0` (no church
set). Then `begin; select set_config('app.church_id', '<IRCA id>', true);
select count(*) from roles; commit;` → IRCA's count. Then `select count(*)
from roles` again → `0`.

**Commits:** "Keep churches apart in Postgres itself with row-level security";
"Set the church on every transaction, safely behind a pooler"; "Hide
impersonation from church readers in the database too"; "Fail CI when a
church-owned table has no row-level security".

---

## 2.4b — Control plane, tenant plane, and room for dedicated databases

**Goal:** everything that would have to change to give a large church its own
database later is decided and built now, while it is cheap. The full reasoning
is in `multi-tenancy.md`, section 13. Today there is one database, and nothing
behaves differently.

**Do**

1. **Label every model with its plane** in `src/core/database/planes.ts`:

   ```ts
   /** Who and how: always in the shared database. */
   export const CONTROL_MODELS = new Set([
     'Church', 'User', 'Session', 'Permission', 'ChurchMembership', 'ChurchModule', 'Role',
     'RolePermission', 'MembershipRole', 'ImpersonationSession', 'UsageDaily',
     'PlatformUsageDaily', 'UserActivityDaily', 'JobRun', 'ChurchPlacement',
     // Phase 3: 'Invitation', 'PasswordResetToken', 'EmailOutbox'. Phase 5: 'ApiClient'.
   ]);
   /** A church's own records: these move with the church. */
   export const TENANT_PLANE_MODELS = new Set<string>([
     // Phase 4: 'ChurchSequence', 'FinanceIncomeSource', 'FinanceExpenseItem', 'FinanceTransaction', 'ChangeRequest'.
     // Phase 5: 'Registration', 'Person', …, 'ChurchSetting'.
   ]);
   // AuditEvent is split by its `source` column (below).
   ```

   A test fails when a model is in neither list, or in both. (This is separate
   from `TENANT_MODELS` in 2.4, which lists every model with a `churchId`,
   control or tenant plane.)
2. **Placements.** Add to the Phase 2 migration:

   ```prisma
   enum PlacementState {
     ACTIVE
     MOVING      // maintenance: writes refused while the church's data is copied
   }

   model ChurchPlacement {
     churchId String         @id @map("church_id") @db.Uuid
     cluster  String         @default("shared") @db.VarChar(40)
     state    PlacementState @default(ACTIVE)
     movedAt  DateTime?      @map("moved_at") @db.Timestamptz(6)
     @@map("church_placements")
   }
   ```

   Every church gets a row (`shared`, `ACTIVE`) when it is created, and a
   migration backfills existing ones. RLS: core-only policies (2.4a step 3).
3. **`DatabaseRegistry`** (`src/core/database/registry.ts`). It reads
   `TENANT_CLUSTERS` from the environment, a JSON map of cluster name →
   `{ rw, ro, core, backup }` URLs. When the variable is absent, it builds
   `{ shared: { rw: DATABASE_URL, ro: DATABASE_URL_READONLY, core: DATABASE_URL_CORE } }`,
   so **nothing needs configuring today**. It keeps one set of Prisma clients
   per cluster, and a 60-second cache of placements.
   - `forChurch(churchId) → { rwScoped, roScoped, core }` for that church's cluster.
   - `Db` (2.4, 2.4a) now asks the registry instead of holding `PrismaRw` and
     `PrismaRo` itself. Feature code does not change.
   - `coreFor(churchId)`: for core code that must touch a church's
     tenant-plane rows (the usage snapshot, the change-request email lookup).
     **Core code never queries tenant-plane tables through `PrismaCore`
     directly.** ESLint flags `prismaCore.<tenantPlaneModel>` using the list above.
   - `clusters()`: every cluster, for jobs that loop over all of them.
4. **Maintenance mode.** Generalise `ImpersonationReadOnlyGuard` (2.9) into a
   `ReadOnlyGuard` with two reasons: impersonation (as before), or the context
   church's placement is `MOVING` → `503 CHURCH_MAINTENANCE`, "Your church's data
   is being moved. Changes are paused for a few minutes." Only Phase 6's move
   tool sets `MOVING`, but the guard exists from now on.
5. **Audit source.** Add `source String @db.VarChar(10)` (`'core' | 'feature'`)
   to `AuditEvent`. `recordNow` writes `core`, and `recordIn(tx, …)` writes
   `feature`. Feature rows are tenant plane, and core rows (sign-ins,
   impersonation) are control plane.
6. **No cross-plane foreign keys.** Tenant-plane tables may reference other
   tenant-plane tables, and `churches.id`. Each cluster will hold a one-row
   copy of its church. References to users or other control-plane rows are plain
   uuid columns **without** `@relation`. A CI test reads
   `information_schema.referential_constraints` and fails on any foreign key
   from a tenant-plane table to a control-plane table other than `churches`.
7. **One schema, every cluster.** `npm run db:deploy -w @irca/api` runs
   `prisma migrate deploy` once per cluster in `TENANT_CLUSTERS` (today: once).

**Check:** `church_placements` has a row for IRCA and TEST (`shared`,
`ACTIVE`). Set TEST to `MOVING` by SQL: TEST's admin can read but gets `503
CHURCH_MAINTENANCE` on any write, and IRCA is unaffected. Set it back.

**Commits:** "Label every table as control or tenant plane"; "Place each
church's data in a named database, starting with one"; "Pause a church's
writes while its data is moved"; "Keep church records free of foreign keys to
shared tables".

---

## 2.5 — Resolving a person's effective permissions

**Goal:** one function answers "what may this request do?", and it runs once
per request.

**Do** — `src/core/rbac/permission-resolver.service.ts` (uses `PrismaCore`,
core):

1. `forMember(userId, churchId): Promise<Set<PermissionKey>>`:

   ```sql
   -- tenant: filtered by m.church_id = $2
   select distinct rp.permission_key
   from church_memberships m
   join membership_roles mr on mr.membership_id = m.id
   join roles r            on r.id = mr.role_id and r.deleted_at is null
   join role_permissions rp on rp.role_id = r.id
   join permissions p      on p.key = rp.permission_key and p.retired_at is null
   join church_modules cm  on cm.church_id = m.church_id
                          and cm.module_key = r.module_key
                          and cm.enabled
   where m.user_id = $1 and m.church_id = $2 and m.status = 'ACTIVE'
   ```

   The `church_modules … enabled` join is what makes a disabled module's
   roles inert without deleting them.
2. `forDev()`: all `platform.*` permissions. A dev who is also a member of a
   church (unusual) additionally gets `forMember` for their active church.
3. `readOnly(set)`: keep only keys whose `permissionKind(k) === 'read'`, and
   remove `admin.users.impersonate` and `platform.users.impersonate`
   (no nested impersonation).
4. Call the resolver in `SessionGuard` after the session is resolved and put
   the result in CLS `permissions`. (Order matters: 2.8 changes whose
   permissions are resolved when impersonating.)
5. **No cache in this phase.** It is one indexed query. If it ever shows in
   profiles, add a 30 s in-memory cache keyed by `(userId, churchId)` and bump a
   `perm_version` counter on role changes. Do not add it pre-emptively.

**Check:** unit/e2e: a user with the admin role gets the 10 admin permissions;
disable the admin module (by SQL) and they get none (the sync re-enables admin,
so test with a department module later); a deleted role contributes nothing; a
retired permission contributes nothing; the same user in church B gets only B's.

**Commit:** "Work out what each request may do from roles and enabled modules".

---

## 2.6 — `@RequirePermission()` and the permission guard

**Goal:** routes say what they need, and a guard enforces it.

**Do**

1. Decorators (`src/core/rbac/decorators.ts`):

   ```ts
   export const PERMISSIONS_KEY = 'irca:permissions';
   /** The request must hold ALL of these. */
   export const RequirePermission = (...keys: PermissionKey[]) => SetMetadata(PERMISSIONS_KEY, { all: keys });
   /** The request must hold AT LEAST ONE of these. */
   export const RequireAnyPermission = (...keys: PermissionKey[]) => SetMetadata(PERMISSIONS_KEY, { any: keys });
   ```

2. `PermissionsGuard` (after `SessionGuard`, `CsrfGuard` and the read-only
   guard from 2.9):
   - `@Public()` or `@AuthenticatedOnly()` → allow (the session guard already
     did its job).
   - No church in context but the route needs a non-platform permission →
     `403 FORBIDDEN` "Choose a church first."
   - Missing permission → `403 FORBIDDEN` with `details: { required: [...] }`.
     Never say which ones the user *has*.
3. Services also need to check permissions *inside* a handler, for example
   "show prayer requests only if `membership.people.read_sensitive`". Provide
   `RequestAuth` (injectable, reads CLS) with `has(key)`, `require(key)`,
   `userId`, `actorUserId`, `churchId`, `isImpersonating`. **Never read CLS
   directly in feature code.** Use `RequestAuth`.
4. A tiny test controller under `test/fixtures/` (not in `src`) with routes
   for each case, used by the e2e tests in 2.18.

**Check:** e2e: admin → `GET /v1/admin/ping` (temporary, requires
`admin.users.read`) → 200; clerk → 403 with `details.required`.

**Commit:** "Let routes declare the permission they need".

---

## 2.7 — The API refuses to boot with an unprotected route

**Goal:** forgetting to protect a route is impossible to ship.

**Do** — `src/core/rbac/route-audit.service.ts`:

```ts
// sketch
@Injectable()
export class RouteAudit implements OnApplicationBootstrap {
  constructor(private discovery: DiscoveryService, private scanner: MetadataScanner, private reflector: Reflector) {}

  onApplicationBootstrap() {
    const problems: string[] = [];
    for (const w of this.discovery.getControllers()) {
      const cls = w.metatype as Type | undefined;
      if (!cls) continue;
      for (const name of this.scanner.getAllMethodNames(cls.prototype)) {
        const handler = cls.prototype[name];
        const method = Reflect.getMetadata(METHOD_METADATA, handler);   // from @nestjs/common/constants
        if (method === undefined) continue;                              // not a route
        const rule = [IS_PUBLIC, AUTH_ONLY, PERMISSIONS_KEY, PUBLIC_CLIENT_KEY]
          .find(k => this.reflector.getAllAndOverride(k, [handler, cls]) !== undefined);
        if (!rule) problems.push(`${cls.name}.${name} has no access rule`);
        // A write route guarded only by read permissions is almost always a mistake.
        const perms = this.reflector.getAllAndOverride(PERMISSIONS_KEY, [handler, cls]);
        if (perms && method !== RequestMethod.GET) {
          const keys = perms.all ?? perms.any;
          if (!keys.some((k: string) => permissionKind(k) === 'write')
              && !this.reflector.get(ALLOW_READ_ONLY_WRITE, handler)) {
            problems.push(`${cls.name}.${name} is a ${RequestMethod[method]} guarded only by read permissions`);
          }
        }
      }
    }
    if (problems.length) throw new Error('Unsafe routes:\n  ' + problems.join('\n  '));
  }
}
```

`PUBLIC_CLIENT_KEY` is the Phase 5 marker for registration-client routes. The
escape hatch `@WriteWithReadPermission('reason')` exists for the rare
legitimate case (starting an impersonation is a `POST` with a read permission).
It requires a reason string, so review sees why.

**Check:** add a controller method with no decorator → the API refuses to
start and names it. Remove it.

**Commit:** "Refuse to start with a route that has no access rule".

---

## 2.8 — Impersonation in the API: start, stop, expire

**Goal:** an admin or dev can start viewing as someone, and it ends cleanly,
by choice, by timeout, or by logout.

**Rules** (put them in `ImpersonationPolicy.canImpersonate(actor, subject, churchId)`
and unit-test every line):

| Rule | Why |
| --- | --- |
| Actor ≠ subject | Pointless and confusing in the log. |
| Actor is not already impersonating | No chains of "viewing as someone viewing as someone". |
| Subject is not a dev | The dev role is the platform's, not a church's to inspect. |
| Subject has an `ACTIVE` membership in `churchId`, and `users.status = ACTIVE` | An invited or disabled person has no view to see. |
| Church is `ACTIVE` (devs may impersonate into a suspended church) | Suspended churches are closed to their own people, but devs must still be able to investigate. |
| Actor is a dev **or** holds `admin.users.impersonate` in `churchId` | The two groups the owner named. Church admins are limited to their own church by this rule. |

**Endpoints** (`src/core/impersonation/impersonation.controller.ts`):

1. **`POST /v1/impersonation`** — body `{ subjectUserId, churchId? }`.
   **No reason or other detail is asked for** (D16). One click in the portal starts it.
   - `@RequireAnyPermission('admin.users.impersonate', 'platform.users.impersonate')`
     and `@WriteWithReadPermission('changes only the actor\'s own session')`.
   - `churchId`: required for devs, and must be the actor's current church for
     admins.
   - In one transaction (via `PrismaCore`): create the `ImpersonationSession`
     (`expiresAt = now + 30 min`, `previousChurchId = session.activeChurchId`),
     set `sessions.impersonation_id` and `sessions.active_church_id = churchId`,
     and write audit `impersonation.started` (actor, subject, church).
   - Respond with the new `MeResponse`. The portal reloads into the subject's view.
2. **`DELETE /v1/impersonation`** — `@AuthenticatedOnly()` +
   `@AllowWhileImpersonating()`. It ends it (`STOPPED`), restores
   `active_church_id = previousChurchId`, clears `impersonation_id`, and
   writes audit `impersonation.ended`.
3. **Logout** (1.13) gets `@AllowWhileImpersonating()`, and ends any open
   impersonation with `LOGOUT` before revoking the session.
4. **There is no impersonation history endpoint for churches.** The person
   viewed is never told, and church admins, including the one who did it,
   cannot list impersonations. The only reader is the dev console's
   impersonation log (Phase 6, steps 6.3 and 6.4), under `platform.impersonations.read`.

**Session guard changes** (1.12): after resolving the session, if
`session.impersonationId` is set, load it:

- If `endedAt` is set or `expiresAt < now`: end it (`EXPIRED` if it timed out),
  restore the church, clear the column, write audit, and continue **as the
  actor**. The portal shows "Your view-as session ended" (it sees
  `impersonation: null` in `/me`).
- Otherwise set CLS: `userId = subject`, `actorUserId = actor`,
  `churchId = imp.churchId`, `impersonationId = imp.id`,
  `platformRole = subject's` (so a dev impersonating a clerk does **not** keep
  dev powers), `permissions = readOnly(forMember(subject, churchId))`.

**Check:** e2e in 2.18. Manually with curl: admin starts impersonating the
clerk, `/me` shows the clerk plus an `impersonation` block, `DELETE` returns to
admin.

**Commits:** "Let admins and devs view the portal as someone else";
"End view-as sessions on stop, timeout and sign-out".

---

## 2.9 — The three read-only layers

**Goal:** no impersonated request can change church data, even when someone
makes a mistake later.

**Do**

1. **API layer — `ImpersonationReadOnlyGuard`** (`APP_GUARD`, right after
   `CsrfGuard`):

   ```ts
   // sketch
   const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
   canActivate(ctx) {
     if (!this.cls.get('impersonationId')) return true;
     const req = ctx.switchToHttp().getRequest<Request>();
     if (SAFE.has(req.method)) return true;
     if (this.reflector.get(ALLOW_WHILE_IMPERSONATING, ctx.getHandler())) return true;
     throw new AppError(403, ErrorCode.IMPERSONATION_READ_ONLY,
       'You are viewing as someone else. Stop viewing to make changes.');
   }
   ```

   `@AllowWhileImpersonating()` is used on **exactly two** handlers:
   `DELETE /v1/impersonation` and `POST /v1/auth/logout`. A test asserts that
   list (2.18) so a third one needs a deliberate test change and review.
2. **Permission layer:** 2.8 already gives impersonated requests only
   read permissions, so even an exempted route cannot pass a write check.
3. **Database layer:** 2.4's `Db.client` hands out the `irca_readonly` client
   whenever `impersonationId` is set. Nothing else to do, but prove it (2.18).
4. **Infrastructure writes that must still happen during impersonation**
   (audit rows, `sessions.last_seen_at`, usage counters, ending the
   impersonation) all go through `PrismaCore` in `src/core/**`. None of those
   classes are exported to feature modules.

**Check:** 2.18 has one test per layer. The database-layer test uses a fixture
`GET` route that *deliberately* writes. It must fail with a Postgres
permission error, **and** the row must not exist afterwards.

**Commit:** "Make impersonation read-only in the API, in permissions and in the database".

---

## 2.10 — The audit log

**Goal:** every change, every sign-in and every impersonated view is
recorded with who really did it.

**Do** — `src/core/audit/audit.service.ts`:

1. `recordIn(tx, event)`: for **business changes**, called by feature
   services **inside the same transaction** as the change, so the log and the
   change commit or roll back together. `tx` is the scoped client's transaction.
2. `recordNow(event)`: for **infrastructure events** (sign-in, sign-out,
   failed sign-in, impersonation start/end, impersonated views), written
   immediately through `PrismaCore`.
3. Both fill `churchId`, `actorUserId`, `subjectUserId`, `impersonationId`,
   `ip`, `userAgent` and `requestId` from CLS automatically. Callers pass only
   `action`, `entityType`, `entityId`, `summary`, `before`, `after`.
4. **Redaction:** a `redact(obj)` helper removes keys matching
   `/password|token|secret|hash/i` before storing `before`/`after`. Unit-test it.
5. **Action names** are `module.entity.verb` in past tense:
   `auth.login.succeeded`, `auth.login.failed`, `auth.logout`,
   `impersonation.started`, `impersonation.ended`, `impersonation.view`,
   `admin.user.invited`, `admin.role.granted`, `finance.transaction.created`,
   `finance.transaction.voided`. Keep a list in
   `packages/shared/src/audit-actions.ts` so the portal can label them.
6. **`AuditInterceptor`** (global): **while impersonating**, after every
   response, `recordNow({ action: 'impersonation.view', meta: { method, path,
   status, durationMs } })`. A dev can see exactly what the viewer
   looked at, and nobody in the church can (point 8). Outside impersonation it does nothing, because business changes
   are logged explicitly by services, which know what changed.
8. **Impersonation rows are platform-only.** Every row with an
   `impersonationId`, and every `impersonation.*` action, is stored with the
   church's `churchId` (so the dev console can filter by church), but it is
   **excluded from every church-facing read**: the Activity page (3.12), a
   person's recent activity (3.6), and entity history such as a finance entry's
   History (4.11). Put the exclusion in one place, `AuditQueries.forChurch()`,
   which every church-facing audit read must use, and test it (2.18). The only
   reader is `AuditQueries.forPlatform()`, used by `src/modules/platform`.
7. Move the login/logout logging from 1.13 into `recordNow`. A failed login for
   an unknown email is recorded with `churchId: null` and **no email** (store
   `meta: { emailHash: sha256(email) }` so repeated attacks on one address are
   visible without storing addresses of people who have no account).

**Check:** sign in, fail a sign-in, impersonate, open two pages, stop. The
`audit_events` table has one row per event, with actor and subject correct,
and the impersonated page views show `actor = admin`, `subject = clerk`.

**Commit:** "Record every change and every view-as page in an append-only log".

---

## 2.11 — Usage metering

**Goal:** from today, count per church per day everything the dev console
will show, cheaply.

**Do**

1. Metric names in `packages/shared/src/usage-metrics.ts`. The dev console
   reads labels from here:

   | Metric | Counted where |
   | --- | --- |
   | `api.requests` | every request with a church in context |
   | `api.requests.<module>` | same, split by the route's module (controller path prefix) |
   | `api.errors.4xx` / `api.errors.5xx` | response status |
   | `api.latency_ms.sum` | add duration, so average = sum / requests |
   | `api.latency_ms.max` | greatest of the day |
   | `auth.logins` / `auth.login_failures` | AuthService |
   | `auth.sessions_created` | SessionService |
   | `impersonation.started` | ImpersonationService |
   | `audit.events` | AuditService |
   | `email.sent` / `email.failed` | Phase 3 outbox |
   | `registrations.started` / `registrations.submitted` | Phase 5 |
   | `finance.transactions.created` / `finance.transactions.voided` | Phase 4 |
   | `db.rows.<table>` / `db.bytes.<table>` / `db.bytes.total` | Phase 6 nightly snapshot |
   | `storage.bytes` | reserved for attachments |

2. `UsageService` (`src/core/usage/`), singleton:
   - `inc(metric, by = 1)` and `max(metric, value)` read `churchId` from CLS.
     With no church, the metric goes to the platform bucket.
   - Buffer in memory: `Map<string, bigint>` keyed `church|day|metric`.
     `day` is the church's **local** date (cache `churchId → timezone` for 10
     minutes).
   - `flush()` every 60 s and on shutdown (`onModuleDestroy`). It builds one
     `INSERT … VALUES (…),(…) ON CONFLICT (church_id, day, metric) DO UPDATE
     SET value = usage_daily.value + excluded.value` statement (for `.max`
     metrics: `greatest(usage_daily.value, excluded.value)`) and swaps the
     buffer before writing, so increments during the flush are not lost.
   - `touchActiveUser()` → upsert `user_activity_daily` increment, buffered
     the same way.
   - **Accepted limit, written in the code comment:** a crash loses at most
     60 s of counters. They are for capacity and billing-style insight, not
     accounting.
3. `UsageInterceptor` (global): times every request and, on finish, counts
   `api.requests`, the module split, errors, and latency, and touches the active user.
   It records the **subject's** church (that is where the requests land) but
   touches the **actor's** activity, not the subject's. Viewing as Neema must
   not make Neema look active that day, or it would give the impersonation away
   in her "last active" and in the church's active-user counts. When
   impersonating it also adds `impersonation.views`.

**Check:** click around for a minute, wait for the flush, then
`select * from usage_daily order by metric` shows plausible counts.
`user_activity_daily` has one row for you today.

**Commit:** "Count usage per church per day from the first request".

---

## 2.11a — Per-church rate limits, quotas and cache headers

**Goal:** no church can use up capacity the others need, and nothing
church-specific is ever cached where another church could get it
(`multi-tenancy.md`, sections 8 and 12).

**Do**

1. **Three throttler buckets** (`@nestjs/throttler`, with named throttlers and
   custom `getTracker`s), all applied globally:
   - `ip`: 300/min, with the per-route overrides already set (login 10/min,
     public registration per 05 step 5.5);
   - `user`: 300/min, tracked by `actorUserId` (skipped when signed out);
   - `church`: 1,200/min, tracked by `churchId` (skipped with no church). The
     limit is read from `church_settings.limits.api_per_minute` when present
     (cached 60 s).
   A limit hit → `429 RATE_LIMITED`, plus `usage.inc('api.throttled')`. Use an
   in-memory store while there is one API instance, and move the store to Redis
   or Postgres before running two (note this in `docs/deployment.md`).
2. **Quotas.** `QuotaService.consume(key, n = 1)` checks a per-church daily
   counter against `church_settings.limits.<key>` or the default in code
   (`emails_per_day: 500`, `exports_per_day: 50`, `api_clients: 3`) and throws
   `429 QUOTA_EXCEEDED`, "Today's limit of 500 emails for IRCA is reached. It
   resets at midnight." Counters are rows in `usage_daily`, so the dev console
   shows them. Wire it into email enqueue (3.1) and CSV exports (4.6, 5.9) as
   those are built.
3. **Cache headers.** A global interceptor sets `Cache-Control: private,
   no-store` and `Vary: Cookie` on every `/v1` response. The portal already
   fetches with `no-store` (1.17). Write the rule for any future cache into the
   code comment: keys start with `c:{churchId}:`, and go through one helper.
4. Only devs can change `church_settings.limits.*` (the dev console, Phase 6). A
   church admin cannot raise their own limits.

**Check:** a loop of 1,300 requests in a minute as a TEST user gets 429s for
TEST, while an IRCA user in parallel gets none. The response headers show
`no-store`.

**Commits:** "Give every church its own share of the API"; "Cap daily emails
and exports per church"; "Never let church data be cached".

---

## 2.12 — Background jobs

**Goal:** one safe way to run scheduled work.

**Do**

1. `npm i -w @irca/api @nestjs/schedule`.
2. `JobRunner.run(name, fn)` (on `PrismaCore`):
   `select pg_try_advisory_lock(hashtext(name))`. If it is not acquired, return
   (another instance is on it). Otherwise insert a `job_runs` row, run `fn`
   with a CLS context that has **no user and no church** (so a job cannot
   accidentally use request identity), record `ok/error/stats/finishedAt`, and
   release the lock.
3. **`JobRunner.forEachChurch(name, fn, { budgetMs = 60_000 })`** for
   per-church work: for each `ACTIVE` church, run `fn` in a fresh CLS context
   with only `churchId` set (so `Db`, the tenant extension and RLS all apply),
   inside its own `try/catch`, and give up on that church if it runs past the
   budget. Record one `job_runs` row per church (add `churchId String?
   @db.Uuid` to `JobRun`). One church failing or running long never stops the
   others. Platform-wide jobs keep using `run()`, with a comment explaining why
   they must see every church (`multi-tenancy.md`, section 9).
4. First job: **`impersonation-expiry`** every minute. It ends
   impersonations past `expiresAt` that nobody has touched (the guard ends
   them lazily on the next request, but an abandoned tab would otherwise stay
   "open" in reports).
5. Second job: **`session-cleanup`** nightly at 03:00 Africa/Dar_es_Salaam.
   It **marks** sessions past expiry as revoked (`reason: 'expired'`). It
   does not delete them yet. Deletion after 90 days is Phase 6.

**Check:** start an impersonation, set its `expires_at` in the past, wait a
minute: `ended_at` is set with `EXPIRED`, and `job_runs` has rows.

**Commit:** "Run scheduled jobs once, even with several API instances".

---

## 2.13 — `/me` grows up, and switching church

**Goal:** `/me` tells the portal everything it needs to draw itself.

**Do**

1. Final `MeResponse` in `packages/shared/src/auth.ts`:

   ```ts
   export type MeResponse = {
     user: { id: string; email: string; fullName: string; initials: string; platformRole: 'NONE' | 'DEV' };
     church: { id: string; code: string; slug: string; name: string; timezone: string; currency: string } | null;
     churches: { id: string; name: string }[];
     /** Effective permissions for this request (read-only subset when impersonating). */
     permissions: string[];
     /** Enabled modules the user can see at least one page of, in sidebar order,
      *  with nav already filtered by permission. */
     modules: { key: string; name: string; home: string; nav: NavItem[] }[];
     /** Human role labels for the sidebar footer, e.g. "Church administrator · Finance clerk". */
     roleLabels: string[];
     impersonation: null | {
       id: string;
       actor: { id: string; fullName: string };
       startedAt: string;
       expiresAt: string;
     };
   };
   ```

   When impersonating, `user`/`church`/`permissions`/`modules`/`roleLabels`
   describe the **subject**, and `impersonation.actor` is the real person.
2. Sidebar order: department modules in the order of `CHURCH_MODULES`, then
   `admin` last. For devs, prepend a pseudo-module `platform` ("Dev console",
   home `/platform`).
3. **`POST /v1/auth/church`**, body `{ churchId }` (`@AuthenticatedOnly()`):
   switch the active church, if the user has an `ACTIVE` membership there.
   Not allowed while impersonating (the read-only guard already blocks it,
   since it is a `POST` without `@AllowWhileImpersonating`).

**Check:** `/me` for admin lists the Admin module with four nav items; for
clerk, no modules (and the portal shows "no access" in 2.15); for dev, the
platform pseudo-module.

**Commit:** "Tell the portal which modules, pages and actions each person has".

---

## 2.14 — The portal shell

**Goal:** the design's frame (sidebar, top bar, theme), driven entirely by `/me`.

**Layout** (from `../design/admin`, desktop ≥ 900 px):

```
┌────────────┬─────────────────────────────────────────────────────────────┐
│ [I] IRCA   │ ┌ impersonation banner (2.16), only while viewing as ─────┐ │
│ Admin portal│ └─────────────────────────────────────────────────────────┘ │
│            │  Page title                                 ● Live  [Light] │
│ FINANCE    │  Page subtitle                                  [actions…]  │
│ [O] Overview│ ─────────────────────────────────────────────────────────── │
│ [T] Transac…│                                                            │
│            │                        page content                         │
│ ADMIN      │                                                             │
│ [P] People │                                                             │
│ [R] Roles  │                                                             │
│ …          │                                                             │
│            │                                                             │
│ « Collapse │                                                             │
│ (KA) Kaka A│                                                             │
│  Church adm│                                                             │
└────────────┴─────────────────────────────────────────────────────────────┘
  218 px (64 px collapsed)
```

**Do**

1. `src/app/(app)/layout.tsx` (server): `me = await serverApi<MeResponse>('/auth/me')`,
   then render `<SessionProvider me={me}><Shell>{children}</Shell></SessionProvider>`.
2. `Sidebar` (client), matching the design: brand block ("I" mark, "IRCA",
   "Admin portal", where the church name replaces "IRCA" for other churches);
   **one group per module** with a small uppercase module name, then its nav
   items (the 22 px mark square filled with `--accent` when active, the label,
   an optional badge); the **Collapse** button (`«`/`»`, stored in cookie
   `irca_sidebar=collapsed`, read on the server like the theme); the user row
   (initials circle, name, first role label) opening a menu with *Account*,
   *Switch church* (only if `churches.length > 1`) and *Sign out*.
   Active item = longest `href` that prefixes the current path
   (`usePathname`).
3. `Topbar`: title and subtitle come from each page (a `PageHeader`
   component each page renders at its top, not from the layout), the "Live"
   dot, the theme toggle (sets the cookie and flips `data-theme` without a
   reload), and a slot for page actions (e.g. *Export CSV*).
4. **Below 900 px**, the sidebar becomes a drawer opened by a menu button in
   the top bar. At 360 px everything must still be usable.
5. `src/app/(app)/page.tsx` (home): redirect to the first module's `home`.
   With **no** modules, render the "no access" state (2.15).
6. `ChurchSwitcher`: a dialog listing `churches` →
   `POST /api/auth/church` → `router.refresh()`.
7. Error surfaces: `src/app/(app)/error.tsx` (friendly "Something went
   wrong", the `requestId`, and a *Try again* button), `not-found.tsx`, and a
   `ForbiddenState` component used by 2.15.

**Check:** sign in as admin: the sidebar shows **Admin** with People / Roles /
Portals / Activity (their pages can be empty placeholders for now); collapse
and reload keep it collapsed; the theme persists; at 360 px the drawer works.
Sign in as clerk: no sidebar items, "no access" page.

**Commits:** "Draw the portal frame from the signed-in person's modules";
"Collapse the sidebar and keep the choice"; "Fit the portal on a phone".

---

## 2.15 — `can()`, page guards and the "no access" states

**Goal:** the portal shows only what a person may use, and says so kindly
when there is nothing.

**Do**

1. `SessionProvider` exposes `useMe()` and `useCan()`:
   `const can = useCan(); can('finance.transactions.create')`.
   And a component `<Can permission="…">…</Can>` that renders children only
   when allowed.
2. **Every create, edit, delete, void, invite or approve button is wrapped in
   `<Can>`** with its **write** permission. During impersonation the subject's
   write permissions are not in `/me`, so all of them vanish. That is layer 1
   of read-only, with no special impersonation code in pages.
3. Server-side page guard `requirePagePermission(me, key)` in
   `src/lib/auth/guards.ts`. Each page calls it at the top, and on failure
   renders `<ForbiddenState />`: "You don't have access to this page. Ask
   your church administrator if you need it." with a link home. (A 403 page,
   not a redirect, so people understand what happened.)
4. "No access at all" (no modules): "You're signed in, but no portals have
   been given to you yet. Your church administrator can add you." plus the
   admin names (a small `/v1/me/admins` endpoint returning names only).
5. Portal API errors with code `IMPERSONATION_READ_ONLY` show a toast
   "Viewing as someone else. Changes are turned off." It should never happen
   when `<Can>` is used correctly, and seeing it in testing means a button is
   missing its `<Can>`.

**Check:** as admin, all four Admin pages open; typing `/finance` in the
address bar shows the 403 state (the module does not exist yet, so do this
check again in Phase 4).

**Commit:** "Show only what each person may use".

---

## 2.16 — The impersonation banner

**Goal:** nobody can forget they are viewing as someone else.

**Do**

1. `ImpersonationBanner` rendered by the shell above the top bar whenever
   `me.impersonation` is set. It is sticky and full-width, uses `--warn-bg` /
   `--warn-fg` / `--warn-br`, and has `role="status"`:

   > **Viewing as Neema Mollel** (Finance clerk) · read-only · ends in 24 min
   > **[Stop viewing]**

   The banner is shown **only to the actor**, in the actor's own browser.
   Nothing is ever shown to the person being viewed (D16).

2. The countdown updates each minute from `expiresAt`. At 0 it calls
   `router.refresh()`. The API will have ended it, and the banner disappears
   with the toast "Your view-as session ended."
3. **Stop viewing** → `DELETE /api/impersonation` → `router.replace` to the
   page the actor came from (store it in `sessionStorage` when starting), then
   `router.refresh()`.
4. The browser tab title gets a prefix while impersonating:
   `[Viewing as Neema] …`, so it is visible even in a tab strip.
5. Also give the sidebar a 3 px top border in `--warn-br` while impersonating.

**Check:** start an impersonation via curl using the browser's cookie (or wait
for Phase 3's button). The banner, title prefix and countdown show, and Stop
returns you as yourself.

**Commit:** "Make viewing-as impossible to miss".

---

## 2.17 — Writing down how to add a module

**Goal:** the next department is a recipe, not a research project.

**Do** — write `docs/adding-a-module.md` with this checklist (Phase 4 follows
it for Finance and corrects it where it is wrong):

1. `packages/shared/src/modules/<key>.ts`: `defineModule` with permissions
   (`<key>.<resource>.<action>`, each `read` or `write`), 2–3 system roles
   (viewer / editor / manager is a good default when needs are unclear), and nav.
2. Add it to `CHURCH_MODULES` in `packages/shared/src/modules/index.ts`.
3. Prisma models: every one has `churchId`, is added to `TENANT_MODELS`, and
   uses `@map` snake_case. Migration via `--create-only`, reviewed, then applied.
   **Each new table gets the row-level security template from 2.4a in the same
   migration.** Append-only tables get their `revoke` line.
4. `apps/api/src/modules/<key>/`: a Nest module, controllers with
   `@RequirePermission` on every route, services using `Db.client` and
   `audit.recordIn(tx, …)` for every change, and usage counters for the module's key actions.
   Records that must not be changed directly (like finance entries) register a
   `ChangeRequestHandler` (Phase 4, step 4.6a) and get a trigger like
   `finance_txn_guard`. Approvals then appear in Admin → Requests with no new UI.
5. `apps/portal/src/app/(app)/<key>/…`: pages call `requirePagePermission`,
   and every action button is wrapped in `<Can>`.
6. Tests: a permission matrix (each system role × each route), tenant
   isolation (church B cannot see A), impersonation (every write route returns
   `IMPERSONATION_READ_ONLY`), and one Playwright journey.
7. Update `appendix-database.md` and the dev console's metric labels.

**Commit:** "Write down how a new department portal is added".

---

## 2.18 — Tests that prove the skeleton holds

**Goal:** the guarantees in this phase are enforced by CI, not by memory.

**API e2e** (`test/rbac.e2e-spec.ts`, `test/impersonation.e2e-spec.ts`):

- Unprotected route → boot fails (build a throwaway `TestingModule` with a bad controller).
- `@AllowWhileImpersonating` is on exactly `ImpersonationController.stop` and `AuthController.logout`
  (scan metadata like 2.7 and compare to that list).
- Admin can impersonate clerk in the same church; cannot impersonate self,
  a dev, a user of another church, an invited user; cannot nest.
- Dev can impersonate a user in any church and does **not** keep `platform.*` permissions while doing so.
- While impersonating: every fixture `POST/PATCH/DELETE` → `403 IMPERSONATION_READ_ONLY`
  (layer 2); `/me.permissions` contains no write permission (layer 1); the fixture
  `GET` that writes → 500 from a Postgres `42501 insufficient_privilege`, and no row was written (layer 3).
- Impersonation expires: move `expires_at` back → next request acts as the actor, audit has `EXPIRED`.
- Logout while impersonating ends the impersonation with `LOGOUT`.
- Audit: impersonated `GET` requests produce `impersonation.view` rows with the correct actor and subject.
  `update audit_events` as the app role fails.
- **The person viewed is never told (D16):** after an admin views as the clerk,
  none of these contain any trace of it: the clerk's own `/me`, `/me/sessions`
  and account page data; the church Activity feed (`AuditQueries.forChurch()`),
  even for a Church administrator with `admin.audit.read`, including the admin who
  did it; the clerk's `recentActivity` on their People page; and the clerk's
  `lastActiveAt` and `user_activity_daily` (which count the actor, not the subject).
  Only the platform log returns it, and only to a dev.
- `POST /v1/impersonation` accepts no `reason` field (a body with one → 422), so
  nobody reintroduces it by accident.
- Usage: after `flush()`, `usage_daily` has `api.requests` for the church.
- Disabled module: a role in a disabled module grants nothing (use a fixture module in tests).

**Multi-tenancy** (`test/tenancy/*.e2e-spec.ts`, see `multi-tenancy.md` section 15):

- The **route fuzzer:** every church-scoped `GET` route with an id-like
  parameter, called as church A with church B's ids → `404`. Routes are found
  from Nest metadata, so new ones are covered automatically.
- A body carrying another church's `churchId` is ignored.
- `cls.set('churchId'` appears nowhere except the two guards (a source scan).
- Planes: every model labelled exactly once, and no cross-plane foreign keys.
- Maintenance mode: writes refused for the `MOVING` church only.
- Rate-limit fairness: church A throttled, and church B unaffected.
- `forEachChurch`: A throws, B completes, and both are recorded.
- Responses carry `Cache-Control: private, no-store`.

**Portal unit** (vitest): `<Can>` hides and shows; `safeNext`; the banner
countdown formatting; sidebar active-item matching.

**Playwright:** admin sees the Admin nav; clerk sees "no access";
impersonation banner appears and stops (use an API helper to start it until
Phase 3 adds the button).

**Commit:** "Prove the access rules, tenancy and read-only impersonation in CI".

---

## 2.19 — Phase check

- [ ] Every route in the API has an access rule; boot fails otherwise.
- [ ] Two-church tenant tests pass.
- [ ] All three read-only layers have a passing test each.
- [ ] Audit rows are append-only at the database level.
- [ ] `usage_daily` fills as you use the portal.
- [ ] The shell matches the design in both themes, collapsed and expanded, and at 360 px.
- [ ] `docs/adding-a-module.md` exists.
- [ ] This document matches what was built.

# Multi-tenancy, across the whole system

A **church is a tenant**. Keeping churches apart is not a column on a table.
It is a property every layer has to keep: who you are, what you may do, what
the database returns, what an endpoint accepts, where a file lives, what a
cache holds, what a job touches, what a log line says, what a backup
contains, what an alert watches, how much of the system one church may use,
and how all of that is tested.

This document is the single description of that property. Each section gives
the **rule**, **how it is enforced** (so it does not depend on memory), **where it
is built** (phase and step), and **how it is tested**. When you build anything,
check it against the relevant section here.

**Starting point and direction (D20).** All churches share one PostgreSQL
database and one schema. The system is built so that a large church can later
be moved to **its own database** without changing feature code. Section 13 says
exactly what keeps that door open, and how the move is done.

---

## 1. Vocabulary

| Term | Meaning |
| --- | --- |
| **Tenant** | A church (`churches` row). Identified by `church_id` (uuid). Its `code` (`IRCA`) appears in entry numbers, and its `slug` (`irca`) in URLs and API clients. |
| **Tenant context** | The church the current unit of work acts for: `churchId` in the request context (CLS). Set **only** by the server (section 2). |
| **Control plane** | Data about *who* and *how*: churches, users, sessions, memberships, roles and permissions, invitations, API clients, placements, usage, jobs, email outbox, impersonation. It always lives in the shared database. |
| **Tenant plane** | A church's own records: registrations, people, their journey, finance, change requests, sequences, settings, and feature audit events. This is what moves if a church gets its own database. |
| **Cluster** | A PostgreSQL database holding tenant-plane data. At launch there is one, `shared`. |
| **Placement** | Which cluster a church's tenant plane lives in (`church_placements`). |

Every table is labelled with its plane in `appendix-database.md` and in code
(`CONTROL_MODELS` / `TENANT_MODELS`, 02 step 2.4b).

---

## 2. Tenant resolution

**Rule.** The church for a request comes from exactly one of two
server-side sources, and nothing else:

1. the signed-in **session**'s `active_church_id`, re-validated on every
   request against an `ACTIVE` membership in an `ACTIVE` church (01 step 1.11,
   02 step 2.8 for impersonation); or
2. a church's **API client key** (the registration form), whose row names the
   church (05 step 5.4).

It never comes from a header, a query parameter, a request body, a cookie
other than the session, or a subdomain. A subdomain may *suggest* a church
on the login page, but it never decides access.

**Enforced by.** `SessionGuard` and `PublicClientGuard` are the only writers of
CLS `churchId` (a unit test scans `src/` for other `cls.set('churchId'`).
Church-scoped DTOs have no `churchId` field (a lint rule flags `churchId` in
`packages/shared` request schemas outside `platform`).

**Tested.** Sending `churchId` of another church in a body is ignored (the row
is created in the caller's church). A session whose membership was disabled
mid-session loses the church on its next request.

---

## 3. Authentication

**Rules.**

- **Identity is global and access is per church.** One `users` row per
  person (email unique), and one `church_memberships` row per church they
  belong to. A person in two churches signs in once and switches church
  (02 step 2.13). Their roles differ per church.
- **Invitations are church-bound** (the token belongs to one church's
  membership, 03 step 3.2). **Password resets are user-level** (03 step 3.5).
- **Suspending a church** ends its members' sessions *in that church* and
  refuses sign-in to it with "This church's account is paused" (06 step 6.3).
  A member of another church can still work there.
- **Per-church sign-in policy** has a place to live (`church_settings`
  keys `auth.*`, such as `auth.require_2fa` or `auth.session_idle_hours`),
  read by `SessionService`. None is built at launch, but the hook exists, so
  one church's stricter policy never means changing everyone's.
- **Platform identity is separate.** A dev (`platform_role = DEV`) is not a
  member of any church and has no church permissions except through read-only
  impersonation (D16, D11).

**Tested.** 01 step 1.15, 03 step 3.16, and two-church sign-in and switch tests
(02 step 2.18).

---

## 4. Authorization

**Rules.**

- **Roles and permissions are per church** (`roles.church_id`). A role id
  from church B, used in church A, is simply not found (tenant scoping + RLS),
  so granting it fails with `422 ROLE_NOT_AVAILABLE` (03 step 3.2).
- **Modules are enabled per church** (`church_modules`), and permissions
  from a disabled module do nothing (02 step 2.5).
- **Every permission check is relative to the context church.** `RequestAuth.has()`
  has no "which church" argument, by design.
- **Impersonation stays inside one church.** An admin impersonates only in
  their own church. A dev picks the church explicitly (02 step 2.8).
- **Approvals are per church.** A change request is decided only by that
  church's administrators (04 step 4.6a).

**Tested.** The generated permission matrix per module (04 step 4.16, 05 step
5.20), plus a cross-church escalation suite: B's admin tries A's role ids,
user ids, request ids and module toggles, and gets 404/422 every time.

---

## 5. Database: shared schema, two independent isolation layers

**Rules.**

- Every tenant-plane table and every church-scoped control-plane table has
  `church_id uuid not null`.
- **Layer 1:** the Prisma tenant extension adds `church_id` to every query
  and every insert on those models (02 step 2.4).
- **Layer 2:** PostgreSQL row-level security. The church is set
  per transaction with `set_config('app.church_id', …, true)`. Policies let
  feature roles see only that church. Core and backup roles have explicit
  see-all policies. Unset means zero rows (02 step 2.4a).
- **Roles:** `irca_owner` (migrations), `irca_core` (core, sees all),
  `irca_app` (features, one church), `irca_readonly` (impersonation, one church,
  read-only), `irca_backup` (dumps, sees all, read-only). No runtime role has
  `BYPASSRLS` (01 step 1.5, 06 step 6.5).
- **Per-role statement timeouts**: 10 s for feature roles, 60 s for core (01
  step 1.8). One church's runaway query cannot hold a shared connection for long.
- **IDs are UUID v7**. Nobody can guess their way into another church's rows,
  and ids never collide when a church's data is moved between clusters
  (section 13).
- **Per-church counters** (entry numbers, member numbers) live in
  `church_sequences`, keyed by church (04 step 4.4), never in a global
  Postgres sequence.

**Tested.** Each layer on its own (02 step 2.4a, step 7), the pooled-connection
leak test, raw SQL in `db.tx` against another church, and the CI coverage
checks: `TENANT_MODELS` completeness, and RLS on every church table.

---

## 6. API endpoints

**Rules.**

- **Church-scoped routes never take a church id.** `GET /v1/finance/transactions`,
  never `/v1/churches/:id/finance/...`. The church is the session's.
- **Another church's resource is a 404, never a 403.** A 403 would confirm
  that the id exists. Tenant scoping and RLS produce "not found" naturally, and
  handlers must not special-case it.
- **Only the dev console names churches in paths** (`/v1/platform/churches/:id/…`),
  and every such route requires a `platform.*` permission (06 step 6.3).
- **Search, suggestions and exports** (the expense-item combobox, CSV
  downloads, insights) are church-scoped endpoints like any other. They are
  also the most common place for a leak, so each has its own isolation test.
- **Idempotency keys and unique business keys are per church**
  (`unique(church_id, client_request_id)`, `unique(church_id, name_key)`), so
  two churches can have an item called "Electricity bill".

**Tested.** A route fuzzer in `test/tenancy/route-fuzz.e2e-spec.ts` enumerates
every church-scoped `GET` route with an `:id`/`:code`/`:token` parameter (from
Nest's route metadata, like the route audit in 02 step 2.7), calls it as church A
with ids that belong to church B, and expects `404` every time. A new route is
fuzzed automatically.

---

## 7. Files (not built yet; rules fixed now)

The first files will be receipts on finance entries (00-decisions Q7). When
any module stores files:

- **Storage keys** are `churches/{churchId}/{moduleKey}/{uuid}`, in a
  private bucket. Each cluster (section 13) may have its own bucket.
- **A `files` table** (tenant plane, RLS) holds `church_id`, `key`, the owning
  record, size, content type and checksum. The bucket is never listed to find
  files: the table is the index.
- **Downloads** go through the API. It looks up the row (tenant scoping + RLS)
  and returns a signed URL that is valid for 5 minutes. **Uploads** use a signed
  `PUT` with the size and content type fixed in the signature.
- **Limits and accounting:** a per-church storage quota
  (`church_settings.limits.storage_bytes`) and the `storage.bytes` metric
  (06 step 6.1).
- **Lifecycle:** deleting or voiding the record never deletes the file (finance
  evidence). Church export includes files, and offboarding deletes them.
- Files are scanned for malware on upload before they become downloadable.

**Tested (when built):** a signed URL for church A's file cannot be minted
by church B, and guessing a key returns 403 from the bucket.

---

## 8. Caching

**Rules.**

- **Nothing church-specific is cached by any shared layer.** The API sends
  `Cache-Control: private, no-store` on every `/v1` response (a global
  interceptor, 02 step 2.11a). The portal fetches with `cache: 'no-store'`
  (01 step 1.17). No CDN caching of API responses, and no static rendering of
  church pages.
- **In-process caches** (church timezone 10 min, placements 60 s, permissions if
  one is ever added) are **keyed by `churchId`** and small. Permission caches
  also key by `userId` and a `perm_version`.
- **If Redis (or any shared cache) is ever added,** every key is prefixed
  `c:{churchId}:`, and a helper `churchCache.get/set` is the only allowed API,
  so a key without a church cannot be written.

**Tested.** The same URL as two churches in quick succession returns each
church's own data (a regression test against a future cache). The response
headers include `no-store`.

---

## 9. Background jobs

**Rules.**

- **Every job declares its kind:**
  - **per-church** jobs run through `JobRunner.forEachChurch(name, fn)`,
    which, for each `ACTIVE` church, opens a **fresh request context with only
    that church set** and calls `fn` using `Db` (tenant scoping + RLS), with its
    own `try/catch` and a time budget (default 60 s). One church failing or
    running long does not stop or delay the others. `job_runs` records a row per
    church, with its outcome.
  - **platform** jobs (usage snapshot, session cleanup, impersonation expiry)
    run on `PrismaCore`. Each has a comment explaining why it must see every
    church.
- **Queues are fair between churches.** The email outbox worker claims at most
  5 messages per church per tick, round-robin (03 step 3.1). A church sending
  300 reminders cannot delay another church's password reset.
- **Jobs never inherit a request's identity** (02 step 2.12).

**Tested.** A per-church job where church A throws: B's run still completes,
and both outcomes are recorded. The outbox fairness test: 300 queued for A and 1
for B, and B's goes out in the first tick.

---

## 10. Logs and error tracking

**Rules.**

- **Every log line carries `churchId` and `churchCode`**, plus `requestId`,
  `userId` and `actorUserId` (01 step 1.7). Jobs log the church they are
  processing.
- **No personal data in logs.** Bodies, cookies, tokens and passwords are
  redacted (01 step 1.7), and names or phones are never logged, only ids.
- **Churches never read logs.** Logs are for devs. The log provider indexes
  `churchCode`, and the dev console's church page links to the log search
  pre-filtered to that church (06 step 6.9).
- **Error tracking** (Sentry) gets `church.code` as a tag and ids only, never
  request bodies (06 step 6.7).
- **Retention:** 30 days for logs. Audit rows are the long-term record, and
  those are per church and protected by RLS.

**Tested.** A log-capture test asserts that a request as church A produces
lines with `churchCode: 'IRCA'` and no email addresses.

---

## 11. Backups and restore

**Rules.**

- **Whole-database** point-in-time history (Neon) plus a nightly encrypted
  dump as `irca_backup` (06 step 6.8).
- **Per-church logical export**: `church:export --church IRCA` writes an
  encrypted archive of every tenant-plane row of that church, its control-plane
  rows (memberships, roles, settings, users' names and emails only), and its
  files (when files exist). It runs **weekly per church** (kept 8 weeks), and on
  demand (06 step 6.8a).
- **Restoring one church without touching the others:** restore the
  point-in-time copy into a scratch branch, run `church:export` there, then
  `church:import --replace` into production while that church is in maintenance
  (read-only) mode (06 step 6.8a). Other churches are unaffected throughout.
- **The restore drill** (quarterly) includes one per-church restore.

**Tested.** Export then import into an empty database reproduces the church's
data exactly (row counts and checksums per table). `--replace` touches no other
church's rows.

---

## 12. Monitoring, limits and fairness

**Monitoring (06 steps 6.1–6.4, 6.9).** Every metric is per church: requests,
errors, latency, active people, database rows and bytes, emails, registrations
and finance entries. The dev console shows a **noisy-neighbour view**: each
church's share of requests, of total latency and of database size, over time.
Per-church alerts fire on: 5xx rate over 5% for 15 minutes, email failures,
a church throttled more than 50 times in an hour, and a church's database share
rising more than 10 points in a week.

**Rate limits (02 step 2.11a).** Three layers, evaluated together:

| Bucket | Default | Why |
| --- | --- | --- |
| per IP | 300 / min (login 10 / min, public registration per 5.5) | Stops abuse from one address |
| per user | 300 / min | One person's script cannot flood their church |
| **per church** | **1,200 / min**, overridable per church (`church_settings.limits.api_per_minute`) | **One church cannot starve the others** |

A throttled request gets `429 RATE_LIMITED`, is counted in `api.throttled`, and
the church's limit shows on its dev console page.

**Quotas (02 step 2.11a).** Per church, with defaults in code and overrides in
`church_settings.limits.*`: emails per day (500), CSV exports per day (50),
storage bytes (later), API clients (3). Reaching a quota refuses with a clear
message, never a silent drop.

---

## 13. From a shared database to dedicated databases

**Where we start:** one cluster, `shared`. Every church's placement is
`shared`.

**What keeps the door open** (all built in Phase 2, step 2.4b, because
retrofitting any of these later means touching every module):

1. **Two planes, labelled in code.** `CONTROL_MODELS` and `TENANT_MODELS`
   lists, with a CI test that every model is in exactly one.
2. **No foreign keys from the tenant plane to the control plane**, except to
   `churches.id`. Each cluster keeps a one-row copy of its church, synced by
   the move tool and on church edits. References to users (`created_by_id`,
   `requested_by_id` and so on) are plain uuid columns. A CI check reads
   `information_schema` and fails on any cross-plane foreign key. Users are
   never deleted (only disabled), so these references stay valid, and a nightly
   job reports orphans anyway.
3. **Feature code reaches the tenant plane only through `Db`,** and `Db` picks the
   cluster from the church's placement (`DatabaseRegistry.forChurch(churchId)`).
   Today that is always `shared`.
4. **Core code never queries tenant-plane tables through `PrismaCore`.** It asks
   the registry for that church's cluster (`registry.coreFor(churchId)`). The
   usage snapshot, for example, loops over clusters.
5. **Audit rows record their source** (`audit_events.source = 'core' | 'feature'`).
   Feature rows are tenant plane and move with the church. Core rows (sign-ins,
   impersonation) stay in the control plane.
6. **One schema, every cluster.** `db:deploy` runs the same Prisma migrations
   against every cluster in `TENANT_CLUSTERS`. Control-plane tables simply
   stay empty in dedicated clusters.
7. **No cross-church queries in features.** RLS already makes them impossible.
   Cross-church reporting exists only in the dev console, which goes through
   the registry per cluster.

**How a church is moved** (`church:move --church BIGCHURCH --to cluster-b`,
built in Phase 6, step 6.8a, before it is ever needed):

1. Create the new database with the same five roles, add it to
   `TENANT_CLUSTERS`, and run migrations on it.
2. Put the church in **maintenance mode** (`church_placements.state = MOVING`).
   The read-only guard that makes impersonation read-only (02 step 2.9) also
   refuses writes for a church in maintenance, with "Your church's data is being
   moved. Changes are paused for a few minutes." The public registration API
   returns `503` with a retry hint.
3. Copy the church's `churches` row and every tenant-plane row, in foreign-key
   order, including `church_sequences`, so numbering continues.
4. Verify row counts and checksums per table, and exit non-zero on any difference.
5. Flip the placement to the new cluster, clear placement caches, and set the
   state back to `ACTIVE`.
6. Smoke-test as a church admin (read, then write).
7. After 7 days, purge that church's tenant-plane rows from `shared`, with a
   per-church export taken first. Until the purge, rollback is "flip back and
   copy back anything written since".

Small churches move in minutes with this copy approach. For a very large
church, the same steps can use PostgreSQL logical replication for step 3 to
shrink the pause. That is a later refinement, and the sequence stays the same.

**When to move a church:** its database share passes 30%, it
consistently dominates latency in the noisy-neighbour view, or a contract or
data-residency requirement asks for it. The decision is the owner's, and the
dev console shows the evidence.

**Tested.** A second test database, `irca_test_c2`, is registered as a cluster
in e2e. A church is moved to it, the API serves that church from it, the other
church still reads from `shared`, and nothing of the moved church remains
visible in `shared` after the purge step.

---

## 14. Tenant lifecycle

| Stage | How | Where |
| --- | --- | --- |
| **Create** | Dev console or CLI: church row, placement `shared`, admin module enabled, system roles, first admin invited | 03 step 3.15, 06 steps 6.3–6.4 |
| **Configure** | Modules on/off, roles, settings (`church_settings`), limits (dev only) | 03 step 3.11, 02 step 2.11a |
| **Operate** | Per-church usage, alerts, quotas | 06 steps 6.1–6.4, 6.9 |
| **Suspend** | Sessions in the church ended, sign-in refused, registration key refused. Data is untouched | 06 step 6.3 |
| **Move** | Section 13 | 06 step 6.8a |
| **Export** | `church:export`, handed to the church on request (data portability) | 06 step 6.8a |
| **Offboard** | Suspend → final export handed over → after 90 days `church:delete` removes tenant-plane rows, files and memberships (users who belong to other churches are kept), and records a platform audit event | 06 step 6.8a |

---

## 15. Testing, in one list

Everything above is proven by tests that run in CI:

- **Two churches in every e2e run.** The seed and test fixtures always create
  IRCA **and** TEST, with deliberately overlapping names, phone numbers, item
  names and entry dates, so a leak shows up as a wrong row, not an empty page
  (01 step 1.14).
- Per module: list, get by id, search/suggest, export, change requests and
  jobs, each checked across churches (04 step 4.16, 05 step 5.20).
- Each isolation layer alone (02 step 2.4a).
- The route fuzzer (section 6).
- CI coverage checks: `TENANT_MODELS` complete, RLS on every church table,
  planes labelled, no cross-plane foreign keys, no `cls.set('churchId'` outside
  the guards, no session-level `SET`.
- Caching (section 8), jobs (section 9), logs (section 10), backups/export
  round trip (section 11), rate-limit fairness (church A throttled, church B
  unaffected), quotas, and the cluster move (section 13).

---

## 16. Where each part is built

| Concern | Phase / step |
| --- | --- |
| Tenant resolution, sessions, active church | 01 steps 1.11–1.13, 02 step 2.13 |
| Five database roles, timeouts | 01 steps 1.5, 1.8 |
| Prisma tenant extension | 02 step 2.4 |
| Row-level security | 02 step 2.4a |
| Planes, placements, registry, audit source | 02 step 2.4b |
| Per-church rate limits, quotas, cache headers | 02 step 2.11a |
| Per-church jobs, fair queues | 02 step 2.12, 03 step 3.1 |
| Church-scoped authorization, approvals | 02 steps 2.5–2.7, 03, 04 step 4.6a |
| Route fuzzer and two-church fixtures | 01 step 1.14, 02 step 2.18 |
| Per-church usage and dev console | 06 steps 6.1–6.4 |
| Per-church alerts, log links | 06 step 6.9 |
| Export, import, move, offboard | 06 step 6.8a |
| Files | when first needed (section 7) |

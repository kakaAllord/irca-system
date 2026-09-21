# Decisions

Each decision lists what was checked, the options, what each one costs, and
the choice made. When you want to reverse one, add a new entry below the old
one saying why. Do not rewrite history.

---

## Already decided with the owner (21 Sept 2026)

| # | Decision | Choice |
| --- | --- | --- |
| D1 | Tenancy | **Multi-church ready from day one.** `churches` table, `church_id` on every business row. Only IRCA exists at launch. The dev account shows per-church usage of everything that can be collected: database rows and bytes, requests, errors, active users, logins, emails, registrations, transactions. |
| D2 | Repository layout | **Monorepo with npm workspaces.** *Revised 21 Sept (D18): a fresh repository in `~/dev/irca-system`, not the old `irca-administration`.* |
| D3 | Database access | **Prisma**, on PostgreSQL. *Revised 21 Sept: the current majors, **Prisma 7** and **NestJS 12**, not the versions shoprex uses (owner: "no need to match shoprex"). Prisma 7 takes connection strings from `prisma.config.ts` and a driver adapter per client, not from the schema.* |
| D4 | Transaction numbering | **`{CHURCH}-{INC|EXP}-{YYYY}-{MM}-{NNNNNN}`. The counter restarts every month, separately for income and expenses. The month comes from the transaction date.** Transactions are never deleted, only voided, so there are no gaps. |
| D5 | Stack | Next.js (portal, registration), NestJS (API), PostgreSQL. |
| D6 | Impersonation | Designed in from Phase 1. Church admins can impersonate any user in their church. Devs can impersonate anyone. **Read-only by design.** |
| D7 | New users | The admin enters an email, and the person receives an email with a link where they set their password. Admins can only give access to modules that exist and are enabled. |

---

## D8. How the portal proves who you are (sessions)

**Checked:** impersonation needs a server-side switch that the browser cannot
forge or extend. Deactivating a user must lock them out immediately. The portal
and API live on different hosts. shoprex uses JWTs, and the lesson there was that
revoking a JWT needs a denylist anyway.

| Option | Impact |
| --- | --- |
| A. JWT access + refresh tokens | Stateless and fast. Revocation needs a denylist, which is a session table by another name. Impersonation state lives inside a token, so ending it early means waiting for expiry or adding the denylist. More moving parts for juniors (rotation, reuse detection). |
| **B. Opaque session token in an httpOnly cookie, session row in Postgres** | One indexed lookup per request (trivial at church scale). Logout, deactivation and ending impersonation take effect on the next request. Impersonation is one column on the session row. The cookie only ever holds a random string, and the DB stores its SHA-256, so a database leak does not leak live sessions. |
| C. An auth library (Auth.js / better-auth) | Saves writing login code. But it lives in Next, while our authority is Nest. Invitations, impersonation and RBAC would still be custom, and we would fight the library's session model to add read-only impersonation. |

**Choice: B.** Revocation and impersonation are first-class requirements, and B
makes both one-row updates.

**Cookie path.** The browser only ever talks to the portal's own domain. The
portal rewrites `/api/*` to the API (`next.config.ts` `rewrites`). The session
cookie is therefore first-party, host-only, `SameSite=Lax`, with no CORS
configuration at all. Server components call the API directly, forwarding the
cookie.

---

## D9. How roles and permissions are shaped (RBAC)

**Checked:** the owner does not yet know what Media, Outreach or Comms will
need. Code has to check permissions, so permissions cannot be free text typed by
admins. Admins will want to name roles in their own words ("Mhazini",
"Treasurer").

| Option | Impact |
| --- | --- |
| A. Fixed roles in code (`FINANCE_CLERK`) | Simplest. Every new combination needs a deploy. "Clerk who may also void" becomes a new enum value and a migration. |
| **B. Permissions in code, roles in the database** | Code checks permissions, never role names. Modules ship sensible default roles. Admins can create custom roles later without a deploy, and can only choose from permissions that exist. Costs a role-editor page (Phase 3, late step). |
| C. Fully dynamic (admins define permissions too) | Admins would create permissions that no code checks, so they would do nothing. Rejected. |

**Choice: B.** Each role belongs to exactly one module. That makes "only give
access to portals that exist and are enabled" a simple rule: an admin picks
roles, and roles of disabled modules are not offered and are ignored if still
assigned.

---

## D10. How church data is kept apart (tenant isolation)

**Checked:** every business query in every module needs a `church_id` filter.
Forgetting it once leaks one church's tithes to another.

| Option | Impact |
| --- | --- |
| A. Discipline + code review | Free, and it fails silently the first time someone forgets. |
| **B. A Prisma client extension that injects `churchId` from the request context into every query on tenant models, plus a cross-church e2e test suite** *(kept as layer 1; RLS added as layer 2, see D19)* | Forgetting becomes impossible for Prisma calls. Raw SQL is still manual, but it is rare (sequences, reports, usage) and is marked for review. The extension throws if no church is in context, so a misconfigured route fails loudly. |
| C. Postgres Row-Level Security with `SET app.church_id` per request | The strongest option. With Prisma it requires wrapping every request in an interactive transaction to set the variable, which interacts badly with connection poolers (Neon uses PgBouncer) and is hard for juniors to debug. |

**Choice: B**, designed so that C can be added later without touching module
code (the extension already knows the church for every query).

---

## D11. How impersonation is kept read-only

**Checked:** "read-only by design" must survive a junior forgetting a check on
a new endpoint.

Three independent layers. Any one of them alone would stop a write.

1. **UI:** while impersonating, `/me` returns only the subject's `read`
   permissions. Every create/edit/void button is rendered through `can()` and
   simply does not appear. A permanent banner says "Viewing as … — read only".
2. **API:** a global guard rejects every `POST/PUT/PATCH/DELETE` during
   impersonation with `403 IMPERSONATION_READ_ONLY`. Only routes marked
   `@AllowWhileImpersonating()` are exempt, and that is exactly two: *stop
   impersonating* and *log out*. The permission guard also only sees read
   permissions.
3. **Database:** every impersonated request uses a Prisma client connected as
   a Postgres role (`irca_readonly`) that has `SELECT` and nothing else. Even a
   `GET` handler that wrongly writes gets `permission denied` from Postgres.

The audit log and the session "last seen" stamp are infrastructure, not
church data. They are written through a separate, narrow writer that feature
code cannot reach.

---

## D12. How the registration form reaches the backend

**Checked (blast radius in `apps/registration`):** `src/lib/db.ts` (pool),
`src/lib/registration.ts` (all SQL), `src/lib/actions.ts` (server actions using
it), `src/app/api/draft/route.ts` (beacon autosave), `src/app/page.tsx` and
`src/app/r/[token]/**` (call `getByToken`), `src/office/**` (the former
unauthenticated `/admin` pages, taken off the web on 21 Sept 2026 and kept
unrouted for porting, see `05`),
`src/lib/insights.ts`, `scripts/setup-db.mjs`, `scripts/apply-schema.mjs`,
`db/schema.sql`, `vercel.json` (build runs `db:migrate`), `.env*`
(`DATABASE_URL`), and the `irca_token` cookie. `flow.ts`, `validate.ts` and
`dialCodes.ts` are pure and are needed by the API and portal too.

| Option | Impact |
| --- | --- |
| **A. Registration's server actions call the API server-to-server** with a per-church API client key | UI components do not change. `registration.ts` keeps its function names and swaps its body from SQL to `fetch`. The browser never sees the key. The beacon route forwards to the API. The preserved office pages are ported into the Membership portal (behind login), then deleted. |
| B. The browser calls the API directly | Rewrites every client call, needs CORS, puts the client key or anonymous endpoints in the browser, and the cross-origin beacon gets awkward. |
| C. Registration keeps writing the database directly | Two writers of one table, validation in two places, and the "same backend" requirement is not met. |

**Choice: A.** Validation moves into the API (using the shared `flow.ts`),
and the registration app keeps its fast client-side check as a courtesy, as it
does today.

---

## D13. How the live registration data moves

| Option | Impact |
| --- | --- |
| **A. New database for the new schema, and a copy script that preserves tokens and timestamps** | Clean Prisma history from migration 1. The copy is idempotent and re-runnable, with count and checksum verification. The old database stays untouched as a rollback. Links already sent by SMS keep working because tokens are preserved. |
| B. Adopt the existing database in place (Prisma baseline + `ALTER TABLE ADD church_id`) | No copy, but baselining an existing hand-made schema is fiddly, and there is no untouched copy to roll back to. |

**Choice: A.** Cutover runbook in `05` §6.

---

## D14. Where things run

| Piece | Where | Why |
| --- | --- | --- |
| `apps/registration` | Vercel (as today, Root Directory changed to `apps/registration`) | Already there, and it works. |
| `apps/portal` | Vercel, new project, Root Directory `apps/portal` | Same tooling as registration. |
| `apps/api` | A long-running Node host: **Railway or Render** (recommended), or a small VPS. Not Vercel functions. | The API runs background jobs (email outbox every 15 s, nightly usage snapshots, impersonation expiry), and serverless functions do not stay alive for them. |
| Database | Neon, a new database `irca` (dev branch + prod) | Already in use and supports `pg_trgm` and `pg_stat_statements`. |
| Email | **Resend** (recommended: simple API, generous free tier, good deliverability), behind an `EmailProvider` interface so SMTP can replace it | Invitations and password resets. |

---

## D15. Smaller choices made so juniors don't have to

| Topic | Choice | Reason |
| --- | --- | --- |
| Password hashing | `@node-rs/argon2` (argon2id) | OWASP's first choice, and it ships prebuilt binaries (no native build toolchain needed). |
| Validation | **zod** schemas in `packages/shared`, used by the portal forms and by a small `ZodValidationPipe` in Nest | One schema validates on both sides. class-validator cannot run in the browser. |
| IDs | UUID v7 (`@default(uuid(7))`) | Sortable by creation time, which is good for indexes, and not guessable like serial ids. |
| Portal styling | Tailwind CSS v4 with the design's colour tokens as CSS variables, and the Geist font | Matches the design file. The team knows Tailwind from shoprex. |
| Accessible widgets | `@headlessui/react` (Combobox, Dialog, Menu) | The expense-item typeahead must be keyboard- and screen-reader-correct. Hand-rolling that is where juniors lose a week. |
| Logging | `nestjs-pino`, with `requestId`, `churchId`, `userId`, `actorUserId` on every line | Lets you trace one request, including who was really behind an impersonation. |
| Request context | `nestjs-cls` (AsyncLocalStorage) | Lets the tenant extension, audit writer and DB selector read the current church/user without passing it through every function. |
| Jobs | `@nestjs/schedule` + a Postgres advisory lock per job | Safe even if the API is later scaled to two instances. |
| Tests | Vitest + supertest against a real Postgres `irca_test` (API; NestJS 12's default). Vitest + Testing Library (portal). Playwright for the critical journeys. | Mocks do not catch tenant leaks or permission holes. A real database does. |
| Money | `numeric(14,2)`, decimal strings in JSON, `currency char(3)` default `TZS` | Exact arithmetic, and room for other currencies later. |
| Dates | `timestamptz` for moments, `date` for transaction dates, church `timezone` (`Africa/Dar_es_Salaam`) for "today" and month boundaries | A transaction on 30 Sept at 23:30 in Arusha is a September transaction, whatever the server clock says. |

---

## D16. Impersonation is silent, and only devs can read its log (owner, 21 Sept 2026)

**Replaces** the earlier design in which the admin typed a reason and the
person viewed could see who viewed as them and why.

- **No reason or other detail is asked for.** "View as" is one click.
- **The person viewed is never told.** No banner, no email, no "who viewed as
  me", no trace in their "last active" or in the church's active-user counts
  (usage counts the actor, not the subject).
- **Church admins cannot read impersonation history**, not even their own.
  Impersonation rows stay out of every church-facing audit read
  (`AuditQueries.forChurch()`).
- **Only devs** read it, on the dev console's terminal-style impersonation log
  (`/platform/impersonations`, permission `platform.impersonations.read`): who
  viewed as whom, in which church, when, for how long, and every page viewed.
- **Unchanged:** read-only in three layers (D11), the 30-minute expiry, and the
  banner shown to the **actor** so they never forget they are viewing as someone.

**Impact:** nothing to migrate (Phase 2 is not built yet). The
`impersonation_sessions.reason` column and the history endpoints are removed
from the plan. Tests now assert *absence* from the subject's and admins' views.

---

## D17. Finance records change only through an approved request (owner, 21 Sept 2026)

"To edit finance records one has to send a request to admin."

| Option | Impact |
| --- | --- |
| A. Clerks edit notes directly, and only big fields need approval | Two paths to learn and test, and "small" edits (a reference number) still change the books. |
| **B. Every change, including a void, is a request that a church administrator approves, enforced by a database trigger** | One rule, and the database refuses anything else, so a bug or a psql session cannot skip it. Costs an inbox page and a wait for approval. |
| C. Finance managers approve instead of admins | Keeps it inside Finance, but not what the owner asked. |

**Choice: B**, built as a **generic core mechanism** (`change_requests` plus a
handler per record type, decided in **Admin → Requests**), so future
departments get approvals without new infrastructure.

- Approval needs `admin.requests.decide` (Church administrator).
  **Nobody decides their own request.** That is enforced by the API and by a check constraint.
- **Voids are requests too.** A void removes money from the totals just as an
  edit changes it. *This goes beyond the literal wording ("edit"). If the owner
  wants managers to void directly, it is a one-permission change.*
- A change that moves an entry to another month is applied as void + re-issue
  under a new number, with both entries linked, so numbers never lie.
- Supersedes Q6.

---

## D18. A fresh repository, `irca-system` (owner, 21 Sept 2026)

The owner removed the old repository's `.git` and asked for a new
`git init` in `irca-system`, with the design prototype and agent working files kept outside it. The first
commit of the registration app is byte-identical to the deployed `2290ffa`, so
nothing deployed is lost. The first 28 commits stay readable in
`kakaAllord/irca-administration` (to be archived, not deleted). A new GitHub
repository is recommended over force-pushing (see Phase 0, step 0.7). The design
prototype and agent working files live in the working folder around the repository (`~/dev/irca/`), never committed and never listed in `.gitignore`.

---

## D19. PostgreSQL row-level security as a second isolation layer (owner, 21 Sept 2026)

**Revises D10**, which chose the Prisma extension and deferred RLS because of
the connection pooler. RLS is now **in**, alongside the extension. Each layer
alone keeps churches apart, and tests prove each one on its own (02, step 2.4a).

- Policies on every church-owned table let `irca_app` and `irca_readonly` see
  and write only `church_id = app_church_id()`.
- The church is set **per transaction** with `set_config('app.church_id', …,
  true)`. This is safe behind Neon's transaction-mode pooler, because the setting
  dies with the transaction, and session-level `SET` is banned. Unset means zero
  rows (fails closed).
- A new role, **`irca_core`**, has an explicit see-all policy for core code
  (sign-in, permission resolution, audit and usage writes, jobs, dev console).
  A read-only **`irca_backup`** role does the same for backups. No runtime role
  has `BYPASSRLS`.
- `audit_events`' policy also hides impersonation rows from church readers
  (D16 enforced by the database).
- **Cost:** a few extra round trips per standalone query, about 1 ms each in
  region, measured in 6.6. Interactive transactions and raw SQL must go through
  `db.tx()`, which ESLint enforces.

| Option considered | Why not |
| --- | --- |
| Session-level `SET app.church_id` | Leaks between requests through the pooler. |
| A Postgres role per church | Hundreds of roles, grants per church, and one connection pool per role. |
| RLS without the extension | One layer, and every forgotten `where` becomes a silent empty result rather than a caught bug. |

---

## D20. Multi-tenancy is cross-cutting; shared database first, dedicated databases possible (owner, 21 Sept 2026)

Tenant isolation is planned across every layer, not just `church_id` columns:
tenant resolution, authentication, authorization, the database (extension + RLS),
API endpoints, files, caching, background jobs, logs, backups, monitoring, rate
limiting and testing. The single description is **`multi-tenancy.md`**. Each
of its sections names the phase step that builds it.

| Option | Impact |
| --- | --- |
| **A. Shared database and schema now, with the path to dedicated databases built in** | Cheapest to run for one to a few dozen churches. Costs, paid now while cheap: labelling tables as control or tenant plane, a placement table and database registry that today has one entry, no foreign keys from church records to shared tables (except `churches`), and a move tool tested against a second database. |
| B. Schema per church | Migrations multiply per church, and Prisma handles many schemas poorly. It offers no more isolation than RLS here. |
| C. Database per church from the start | The strongest isolation, but many databases to migrate, back up and pay for before there is a second church. |

**Choice: A.** A church moves to its own database when its share of the
database passes about 30%, it dominates latency, or a contract or data-residency
requirement asks. The owner decides, on the dev console's evidence.

---

## Open questions (each with a recommendation — proceed on the recommendation unless the owner overrules)

| # | Question | Recommendation and why |
| --- | --- | --- |
| Q1 | May a church admin give themselves roles in other modules (e.g. Finance manager)? | **Yes, audited.** They can already see everything through impersonation, so blocking it only adds friction. The audit log and the "who has access" page keep it visible. |
| Q2 | Can a church admin impersonate *other admins*? | **Yes** ("admin can impersonate any other user"). Never a dev, never themselves, never while already impersonating. |
| Q3 | Should a dev have direct *write* access to church data? | **No.** A dev sees church data only by impersonating (read-only) and runs platform operations (create a church, invite its first admin, suspend, view usage). Church financial records and prayer requests should never be silently editable by the vendor. If a fix is ever needed, it is a reviewed migration or script, not a click. |
| Q4 | Your notes (17 Sept) describe portal users *requesting* access and an admin approving. This request says the admin invites by email. | **Build the invite flow now (Phase 3), and add "request access" later** as a small `access_requests` table that, once approved, calls the same invite code. |
| Q5 | Should income sources also be a suggest-or-create catalog like expenses? | **Yes.** Same component, same rules, so "Tithe", "Sadaka" and "Harambee" do not end up spelled five ways. |
| Q6 | Can a posted transaction be edited? | *Superseded by D17 (21 Sept 2026): nothing is edited directly; every change is a request an administrator approves.* |
| Q7 | Receipts / attachments on transactions? | **Not in Phase 4.** The schema leaves room (`finance_attachments`). The dev console already reserves a `storage_bytes` metric for it. |
| Q8 | Pledges and per-person tithe tracking (from the 17 Sept notes)? | **After Phase 6**, as a second Finance iteration, once Membership has `Person` records to link money to. Phase 4 is deliberately church-level income and expenses only. |
| Q9 | Language of staff emails and portal UI | **English at launch, with a `locale` column on users** so Swahili can follow without a migration. The registration form stays trilingual as today. |

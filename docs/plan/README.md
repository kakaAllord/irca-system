# IRCA Administration — build plan

This folder is the plan for turning the IRCA registration app into a
multi-church, multi-department administration system. It is written so that a
developer who joined this week can pick up any step, do it, check it, and commit
it without having to ask what was meant.

Read this file first, then `00-decisions.md`, then the phase you are working on.
Phase 0 (`00-restructure.md`) comes before everything else.

| File | What it covers |
| --- | --- |
| `00-restructure.md` | Phase 0 — one repository (`irca-system`), the registration app moved in as deployed, npm workspaces, the design kept local. Mostly done. |
| `00-decisions.md` | Every architectural decision, the options that were weighed, their impact, and which one we took. Also the questions that are still open, each with a recommendation. |
| `01-foundations-and-login.md` | Phase 1 (built) — monorepo, database, NestJS API, sessions, the login page. |
| `02-skeleton-rbac-impersonation.md` | Phase 2 (built) — the portal shell, the module registry, RBAC, read-only impersonation enforcement, audit log, usage metering. |
| `03-admin-portal.md` | Phase 3 (built) — the church Admin portal: users, email invitations, set-password, roles, portals (modules), impersonation UI, audit viewer, account page. |
| `04-finance-portal.md` | Phase 4 (built) — the Finance portal: income sources, expense items with suggestions, transactions with `IRCA-EXP-2026-09-000001` codes, corrections and voids only through change requests that an admin approves, reports. This is the RBAC test case. |
| `05-registration-and-membership.md` | Phase 5 (built; cutover is the owner's) — the registration form moved onto the API, live data migrated, and the Membership portal (Dashboard, Members, Applications, Discipleship, Insights) from the design. |
| `06-dev-console-hardening-launch.md` | Phase 6 — the dev console with per-church usage, security hardening, deployment, cutover, and the runbook for adding the next department. Load testing, backups, per-church moves and monitoring moved to Phase 10. |
| `07-communications.md` | Phase 7 — the Communication system: SMS through Beem, templates approved once and used weekly, audiences, recurring "beat" messages, opt-out, and what it all costs. Central control, departments sending their own routine messages. |
| `08-outreach.md` | Phase 8 — the Outreach & Evangelism portal: the team, Saturday sessions, people reached in four fields, follow-up, one timeline per person, Friday training, the dashboard, and the session report as a PDF. |
| `09-pledges-and-giving-reminders.md` | Phase 9 — pledges: what someone promised, what they have paid, what is left, and reminding them through Communications. |
| `10-strengthening.md` | Phase 10 — strengthening: performance and load, backups and the restore drill, per-church export/move/offboarding, monitoring and alerts. **Starts only when the owner says so**, after every feature phase is done. |
| `docs/modules/*-brief.md` | What a department actually does, in its own words, filled in before its module is built (step 6.12). `comms-brief.md` and `outreach-brief.md` exist. |
| `multi-tenancy.md` | How churches are kept apart everywhere: sign-in, permissions, database (extension + row-level security), endpoints, files, caching, jobs, logs, backups, monitoring, rate limits, testing. Also the path from one shared database to dedicated databases for large churches. |
| `appendix-database.md` | Every table in one place, with what owns it and why it exists. |

---

## 1. What we are building, in one page

```
                         ┌──────────────────────────────┐
  visitor's phone ──────▶│ apps/registration  (Next.js) │──┐
                         └──────────────────────────────┘  │  server-to-server,
                                                           │  API client key
  staff browser  ──────▶ ┌──────────────────────────────┐  │
                         │ apps/portal        (Next.js) │──┤  /api/* is rewritten
                         │  /login  /admin  /finance    │  │  to the API, so the
                         │  /membership  /platform      │  │  session cookie is
                         └──────────────────────────────┘  │  first-party
                                                           ▼
                         ┌──────────────────────────────────────────┐
                         │ apps/api                     (NestJS)    │
                         │  core:    auth · sessions · rbac ·       │
                         │           impersonation · audit · usage ·│
                         │           email outbox · tenancy         │
                         │  modules: admin · finance · membership · │
                         │           platform   (+ media, outreach, │
                         │           comms … later)                 │
                         └───────────────┬──────────────────────────┘
                                         │ Prisma
                          read-write role│      read-only role (used for
                                         ▼      every impersonated request)
                         ┌──────────────────────────────────────────┐
                         │ PostgreSQL (Neon in production)          │
                         │  every business row carries church_id    │
                         └──────────────────────────────────────────┘

  packages/shared — the registration flow (questions, three languages,
  validation), module manifests (permissions, default roles, nav), shared
  types and formatters. Imported by all three apps, so nothing is copied.
```

**Words we use, and exactly what they mean.** Use these words in code, UI
and conversation. Do not invent synonyms.

| Word | Meaning |
| --- | --- |
| **Church** | A tenant. IRCA is the first. Every business row has a `church_id`. A church has a short `code` (`IRCA`) used in transaction numbers and a `slug` (`irca`) used in URLs. |
| **Module** / **portal** | A department area of the system: `admin`, `membership`, `finance`, later `media`, `outreach`, `comms`, `programs`. A module is *defined in code* (its permissions, default roles, pages). A church admin *enables* modules for their church. They cannot invent new ones — a new module is a code change. "Portal" is the word staff see; "module" is the word in code. They are the same thing. |
| **Permission** | One thing a person may do, such as `finance.transactions.create`. Defined in code by the module that owns it. Each permission is either `read` or `write`. That one flag is what makes read-only impersonation possible. |
| **Role** | A named bundle of permissions from **one** module, stored in the database per church, such as "Finance clerk". Each module ships default roles. Admins can later create custom ones. |
| **Membership** (of a church) | The link between a user and a church. Roles are granted to the membership, not to the user, so the same person can hold different roles in two churches. *Not* the same as "church membership" in the pastoral sense. In code that is `Person.stage = CONFIRMED_MEMBER`. See the glossary note in `05`. |
| **Church admin** | A user holding the system role *Church administrator* in the `admin` module of their church. |
| **Dev** | A platform-level user (`users.platform_role = 'DEV'`). Not a member of any church. Can see the dev console (every church's usage) and impersonate anyone, in any church. |
| **Change request** | A request to change a record that may not be changed directly (every finance entry). The person asks with a reason, and a church admin approves or rejects it in Admin → Requests. See D17. |
| **Impersonation** | Viewing the system as another user sees it. **Always read-only, and silent:** the person viewed is never told, and only devs can read the log (D16). Enforced in three layers: the UI, the API and the database. See `02`, steps 2.8 and 2.9. |
| **Actor** / **subject** | During impersonation the *actor* is the real person at the keyboard, and the *subject* is the person being viewed as. Every audit row records both. |

---

## 2. How to use a phase document

Every phase is a list of **steps**. Every step has the same shape:

- **Goal** — one sentence.
- **Do** — numbered instructions, with the exact commands and file paths.
  Code blocks marked `// sketch` show shape and names, not a finished file.
  Complete them. Code blocks with no such mark are meant to be typed as
  shown.
- **Check** — how you prove it works. This is always something you can run or
  click, never "it should work".
- **Commit** — the commit that step ends in. One step is one or more commits.
  Never more than one step per commit.

Do the steps in order. A step never depends on a later one. If a step says
"see 02 step 2.4", read that section before you start.

When something in the plan turns out to be wrong, fix the plan in the same pull
request as the code, and say why in the commit message. A stale plan is worse
than none.

---

## 3. Rules that apply in every phase

### 3.1 The registration app is live

Visitors use the registration form every Sunday. **Every commit on `main` must
leave `apps/registration` deployable and working** against whatever database it
is using at that point. Up to Phase 5 that is its own Neon database, exactly as
today. Phase 5 has a written cutover. Nothing before it touches the live data.

### 3.2 Git

- Work on a branch per step or per group of small steps: `phase-1/login-api`,
  `phase-4/expense-items`. Open a pull request into `main`, even if you review
  it yourself. The PR is where the Check evidence goes (screenshots, test
  output).
- Commit as the repository owner, without touching global git config:

  ```bash
  GIT_COMMITTER_NAME="kakaAllord" GIT_COMMITTER_EMAIL="allordcodes@gmail.com" \
    git commit --author="kakaAllord <allordcodes@gmail.com>" -m "..."
  ```

- **Commit in reviewable slices.** One feature is many commits. For example:
  schema and migration, then service, then controller and route, then page,
  then tests. Each commit builds and passes tests. Never squash a feature into
  one commit.
- **Message style** (same as the existing log): a short plain title, then
  prose paragraphs explaining *why*. No bullet lists, no `feat:`/`fix:`
  prefixes. Say what was wrong or missing and what the change does about it.
- **No attribution lines anywhere.** No `Co-Authored-By`, no "Generated with",
  no robot emoji, in commits, PRs or files.
- Never commit `.env`, `.env.local` or any secret. `.env.example` files are
  committed and kept current.
- **Agent and editor working files and the design prototype never enter the
  repository.** They live in the working folder that contains it
  (`~/dev/irca/`), out of git's reach, rather than being listed in
  `.gitignore`. Next apps set `agentRules: false` so `next dev` does not write
  agent files into them.

### 3.3 Before every commit

```bash
npm run typecheck        # all workspaces
npm run lint
npm test                 # unit tests for everything touched
npm run build -w <app>   # for any app you touched
```

For anything a person clicks, **drive it in a real browser**. Most bugs in the
registration app were only visible that way. Types passing is not a Check.

### 3.4 Code conventions

- TypeScript `strict` everywhere. No `any` without a comment saying why.
- **One source of truth.** Permission keys, module keys, registration steps and
  labels live in `packages/shared`. If you are about to type a permission string
  in an app, import it instead.
- **Deny by default.** Every API route declares its permission, or is
  explicitly `@Public()` or `@AuthenticatedOnly()`. The API refuses to boot if a
  route declares none of them (`02` step 2.7).
- **Every business table has `church_id`, and every query filters by it.** The
  tenant extension does this for you in Prisma calls (`02` step 2.4), and
  **PostgreSQL row-level security** enforces it again in the database (`02`
  step 2.4a). Multi-statement work and all raw SQL go through `db.tx()`, which
  sets the church for the transaction. Never use session-level `SET`. The full
  picture across auth, APIs, files, caches, jobs, logs, backups, monitoring and
  rate limits is in `multi-tenancy.md`.
- **GET never writes business data.** Impersonation relies on it.
- **Money is never a JS `number`.** Amounts travel as decimal strings
  (`"150000.00"`), are stored as `numeric(14,2)`, and are summed in SQL.
- **Never delete financial or audit rows.** Void, deactivate or supersede.
  Finance entries do not even change without an approved change request (D17).
- Comments explain *why*, not *what*. Match the comment density of the
  registration app. It is the house style.
- Next.js here is **version 16**. APIs differ from older tutorials (for example,
  `middleware.ts` is now `proxy.ts`, and `cookies()` / `headers()` / `params`
  are async). Before using a Next API, read the matching guide in
  `node_modules/next/dist/docs/`.

### 3.4a Phase 10 is not started on your own initiative

`10-strengthening.md` holds the work that makes the system survive real use:
load testing, backups, restoring and moving one church, monitoring. None of it
is started until the owner has been asked, in as many words, whether to begin
strengthening the project, and has said yes. It comes after every feature
phase. Finding a reason it should happen sooner is not permission.

### 3.5 Definition of done for a phase

A phase is done when every step's Check passes, its e2e tests pass in CI, the
plan documents are updated to match what was built, and a person other than the
builder has walked the new pages in a browser from a fresh database
(`npm run db:reset && npm run db:seed`).

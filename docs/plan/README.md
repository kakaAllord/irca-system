# IRCA Administration — build plan

This folder is the plan for turning the IRCA registration app into an
administration system for the church's departments. It serves **one church**
(D27). It is written so that a developer who joined this week can pick up the
next step, do it, check it, and commit it without having to ask what was meant.

**New here? Start with "What to do next", just below.** Then read this whole
file, then `00-decisions.md`, then the phase you are working on.

---

## What to do next

**Where the build is (24 September 2026).**

| Phase | State |
| --- | --- |
| 0–6 | **Built.** What is left of Phase 6 is going live, which is the owner's (`06`, step 6.13). |
| 7 — Departments and Communications | **Built** (25 Sept 2026). Left for the owner: the SMS budget, the Beem account at launch, and a second person walking it (`07`, step 7.16). |
| 8 — Outreach | **Next.** First correct its plan for departments (D28): the note at the top of `08` says what changes. |
| 9 — Pledges | After 8, and only once the leadership has answered step 9.0. |
| 10 — Strengthening | Only when the owner says yes (§3.4a). |

**How to find the very next step.** Open the lowest-numbered phase that is not
built. Its "steps at a glance" table lists the steps in order; the next step is
the first one whose **Check** does not pass yet. `git log --oneline` on
`dev-allord` shows the commit titles already made, and each step lists the
commit titles it ends in, so you can match them.

**Your first hour, if you have never touched this code:**

1. Set up your machine: `apps/api/README.md`, "First run". Then
   `npm run dev` and sign in at <http://localhost:3000> as `admin@irca.local` /
   `admin-password-123`.
2. Read `docs/what-works-now.md` and click through what it describes. You
   cannot extend a system you have not used.
3. Run every test once, so you know what "green" looks like:
   `npm run typecheck && npm run lint && npm test && npm run test:e2e -w @irca/api && npm run e2e`.
4. Read `docs/adding-a-module.md`. Phases 7–9 each add a module, and follow it.
5. Open the next phase document and read its "Before you start".

**When you are stuck.** The phase document names the file to copy for almost
every step — the code that already does the same thing somewhere else. Read
that file first. If the plan is wrong about the code, the code is right: fix
the plan in the same commit and say why (§2).

| File | What it covers |
| --- | --- |
| `00-restructure.md` | Phase 0 — one repository (`irca-system`), the registration app moved in as deployed, npm workspaces, the design kept local. Mostly done. |
| `00-decisions.md` | Every architectural decision, the options that were weighed, their impact, and which one we took. Also the questions that are still open, each with a recommendation. |
| `01-foundations-and-login.md` | Phase 1 (built) — monorepo, database, NestJS API, sessions, the login page. |
| `02-skeleton-rbac-impersonation.md` | Phase 2 (built) — the portal shell, the module registry, RBAC, read-only impersonation enforcement, audit log, usage metering. |
| `03-admin-portal.md` | Phase 3 (built) — the church Admin portal: users, email invitations, set-password, roles, portals (modules), impersonation UI, audit viewer, account page. |
| `04-finance-portal.md` | Phase 4 (built) — the Finance portal: income sources, expense items with suggestions, transactions with `IRCA-EXP-2026-09-000001` codes, corrections and voids only through change requests that an admin approves, reports. This is the RBAC test case. |
| `05-registration-and-membership.md` | Phase 5 (built; cutover is the owner's) — the registration form moved onto the API, live data migrated, and the Membership portal (Dashboard, Members, Applications, Discipleship, Insights) from the design. |
| `06-dev-console-hardening-launch.md` | Phase 6 (built; launch is the owner's) — the dev console (health, usage, logs, the view-as log, settings and keys), security hardening, the setup and recovery commands, deployment, runbooks and the training guides. Rewritten for D27. Load testing, backups and monitoring are Phase 10. |
| `07-communications.md` | Phase 7 (built) — departments with their leaders and members (D28), then the Communication system: SMS through Beem, templates approved once and used weekly, audiences, recurring "beat" messages, opt-out, and what it all costs. Central control, departments sending their own routine messages. |
| `08-outreach.md` | Phase 8 (next; correct it for D28 first) — the Outreach & Evangelism portal: the team, Saturday sessions, people reached in four fields, follow-up, one timeline per person, Friday training, the dashboard, and the session report as a PDF. |
| `09-pledges-and-giving-reminders.md` | Phase 9 — pledges: what someone promised, what they have paid, what is left, and reminding them through Communications. Waits for three decisions by the leadership. |
| `10-strengthening.md` | Phase 10 — strengthening: performance and load, backups and the restore drill, monitoring and alerts. **Starts only when the owner says so**, after every feature phase is done. |
| `docs/modules/*-brief.md` | What a department actually does, in its own words, filled in before its module is built (step 6.12). `comms-brief.md` and `outreach-brief.md` exist. |
| `multi-tenancy.md` | Retired by D27 (one church, one deployment). Says where each guarantee that outlived it is enforced now. |
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
                         │  /membership  /dev  /help    │  │  session cookie is
                         └──────────────────────────────┘  │  first-party
                                                           ▼
                         ┌──────────────────────────────────────────┐
                         │ apps/api                     (NestJS)    │
                         │  core:    auth · sessions · rbac ·       │
                         │           impersonation · audit · usage ·│
                         │           email outbox · jobs            │
                         │  modules: admin · finance · membership · │
                         │           dev        (+ media, outreach, │
                         │           comms … later)                 │
                         └───────────────┬──────────────────────────┘
                                         │ Prisma
                          read-write role│      read-only role (used for
                                         ▼      every impersonated request)
                         ┌──────────────────────────────────────────┐
                         │ PostgreSQL (Neon in production)          │
                         │  one church's data; a second church gets │
                         │  its own database (D27)                  │
                         └──────────────────────────────────────────┘

  packages/shared — the registration flow (questions, three languages,
  validation), module manifests (permissions, default roles, nav), shared
  types and formatters. Imported by all three apps, so nothing is copied.
```

**Words we use, and exactly what they mean.** Use these words in code, UI
and conversation. Do not invent synonyms.

| Word | Meaning |
| --- | --- |
| **Church** | The one church this deployment serves (D27): one row of settings, with a short `code` (`IRCA`) used in entry numbers, a name, a timezone and a currency. A second church is a second deployment. |
| **Department** | A part of the church's life that the administrators list in Admin → Departments: the praise team, the choir, Outreach, Finance, Communications. It has one or more **leaders** (confirmed members with a title such as Chairperson, named by an administrator) and **members** (anyone in People, added by its leaders). Most departments have no portal (D28). |
| **Module** / **portal** | A department's area of the system: `membership`, `finance`, later `outreach`, `comms`. **A portal exists because a department does**: it is switched on for the department it belongs to, and a department may have none. Admin and the dev console are the system's own. A module is *defined in code* (its permissions, default roles, pages). A church admin *enables* modules. They cannot invent new ones — a new module is a code change. "Portal" is the word staff see; "module" is the word in code. Every staff account on any portal is made in Admin. |
| **Permission** | One thing a person may do, such as `finance.transactions.create`. Defined in code by the module that owns it. Each permission is either `read` or `write`. That one flag is what makes read-only impersonation possible. |
| **Role** | A named bundle of permissions from **one** module, stored in the database, such as "Finance clerk". Each module ships default roles. Admins can later create custom ones. |
| **Membership** | In the pastoral sense only: `Person.stage = CONFIRMED_MEMBER`. See the glossary note in `05`. (Until D27 the word also meant a user's link to a church, which held their roles; roles now belong to the user.) |
| **Church admin** | A user holding the system role *Church administrator* in the `admin` module. |
| **Dev** | A user holding the *Developer* role of the `dev` module: the dev console, the view-as log, the church's settings and keys, and viewing as anyone. An ordinary role since D27, not a rank above the church. |
| **Change request** | A request to change a record that may not be changed directly (every finance entry). The person asks with a reason, and a church admin approves or rejects it in Admin → Requests. See D17. |
| **Impersonation** | Viewing the system as another user sees it. **Always read-only, and silent:** the person viewed is never told, and only devs can read the log (D16). Enforced in three layers: the UI, the API and the database. See `02`, steps 2.8 and 2.9. |
| **Actor** / **subject** | During impersonation the *actor* is the real person at the keyboard, and the *subject* is the person being viewed as. Every audit row records both. |

---

## 2. How to use a phase document

Phases 7–10 all open the same way, so you always know where to look:

- **In one sentence** — what the phase gives the church.
- **Before you start** — what must already be true, what to read (and why),
  the commands to get your machine ready.
- **What you are building, in plain words** — the idea, before any code.
- **Words used in this phase** — every new term, defined once.
- **The steps at a glance** — a table: step, what, *you are done when*.

Then the steps. Every step has the same shape:

- **Goal** — one sentence.
- **Why** — when the reason is not obvious. Read it: it is what lets you make
  a sensible choice when the plan did not foresee something.
- **Do** — numbered instructions with the exact files and commands. Code
  blocks marked `// sketch` show the shape and the names, not a finished file:
  complete them, keeping the names. Blocks with no such mark are typed as shown.
- **Check** — how you prove it works. Always something you can run or click,
  never "it should work".
- **Commit** — the commit title(s) the step ends in. One step is one or more
  commits; never more than one step in a commit.
- **If it goes wrong** — the known traps, where there are some.

**The loop for every step:**

```bash
git checkout dev-allord && git pull          # always start up to date
# … read the step, do it …
# … run the step's own Check …
npm run typecheck && npm run lint && npm test
npm run test:e2e -w @irca/api                # the API against a real database
npm run e2e                                  # when the step changed a page
git add <the files of this step>
GIT_COMMITTER_NAME="kakaAllord" GIT_COMMITTER_EMAIL="allordcodes@gmail.com" \
  git commit --author="kakaAllord <allordcodes@gmail.com>"   # title from the step
git push origin dev-allord
```

Do the steps in order. A step never depends on a later one. If a step says
"see 02 step 2.4", read that section before you start.

When something in the plan turns out to be wrong, fix the plan in the same
commit series as the code, and say why in the commit message. A stale plan is
worse than none.

---

## 3. Rules that apply in every phase

### 3.1 The registration app is live

Visitors use the registration form every Sunday. **Every commit on `main` must
leave `apps/registration` deployable and working** against whatever database it
is using at that point. Up to Phase 5 that is its own Neon database, exactly as
today. Phase 5 has a written cutover. Nothing before it touches the live data.

### 3.2 Git

- **There are exactly two branches: `main` and `dev-allord`.** All work is
  committed on `dev-allord`. It reaches `main` through a pull request from
  `dev-allord`, opened when a phase (or a useful part of one) is done and its
  Checks pass; the PR is where the Check evidence goes (screenshots, test
  output). **Never create another branch** — not per phase, per step or per
  fix — even if a tool suggests one. (The Dependabot branches on GitHub are
  GitHub's own, for its update PRs.)
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
- **Feature code reaches the database only through `Db`**, which hands out the
  read-only connection while someone is being viewed as. Several statements
  that must stand or fall together go through `db.tx()`; raw SQL uses the `sql`
  tag, which binds every value. No table has a `church_id` (D27); what the
  application may never do is enforced by grants and triggers in the
  migrations (`appendix-database.md`).
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
load testing, backups and the restore drill, monitoring. None of it
is started until the owner has been asked, in as many words, whether to begin
strengthening the project, and has said yes. It comes after every feature
phase. Finding a reason it should happen sooner is not permission.

### 3.5 Definition of done for a phase

A phase is done when every step's Check passes, its e2e tests pass in CI, the
plan documents are updated to match what was built, and a person other than the
builder has walked the new pages in a browser from a fresh database
(`npm run db:reset && npm run db:seed`).

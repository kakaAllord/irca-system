# Phase 6 — Dev console, hardening, deployment and launch

**Outcome.** A developer signs in and sees how the system is doing and what it
is used for — database rows and bytes, requests, errors, active staff,
sign-ins, emails, registrations and finance entries — over time. They can read
the server log and the view-as log, change the church's settings and the
registration form's keys, and view as anyone (read-only). The system is
hardened, there is a written way to deploy it, runbooks for the things that go
wrong, two training guides in the portal, and a recipe for starting the next
department. Backing it up, load-testing it and watching it are Phase 10.

**Rewritten for D27 (one church, one deployment).** This phase was first
written for a console above many churches: every church listed side by side,
one church's page with its tabs, creating and suspending churches, a platform
role outside any church. D27 removed all of that. The console is now an
ordinary portal, `dev`, with ordinary roles; what it shows is this church's
system. The steps below describe that, and say where the original asked for
something that no longer exists.

**Status (24 September 2026).** Every step is built and tested except what
only the owner or the church can do, which is listed in 6.13. The work is on
branch `phase-6/finish`, which stacks on `single-church/strip-multi-tenancy`.

| Step | What | State |
| --- | --- | --- |
| 6.1 | What is collected (the complete list) | built |
| 6.2 | The nightly database snapshot | built |
| 6.3 | Dev console API | built |
| 6.4 | Dev console pages | built |
| 6.5 | Security hardening | built; four checks at launch |
| 6.6 | The command line for setting up and recovering | built |
| 6.7 | Environments and deployment | written; the domain is the owner's |
| — | *(performance, backups, per-church moves and monitoring moved to Phase 10)* | |
| 6.10 | Runbooks | written |
| 6.11 | Launch and training | guides built; the launch is the owner's |
| 6.12 | Starting the next department | two briefs written |
| 6.13 | Phase check | see there |

---

## 6.1 — What is collected (the complete list)

Everything below is per local day, written to `usage_daily` (counters from
2.11, gauges from 6.2). The list lives in
`packages/shared/src/usage-metrics.ts` with each metric's **type** (`counter`
= summed, `max` = greatest, `gauge` = latest snapshot replaces), its label and
its unit. The dev console draws from it, so adding a metric is one line plus
the code that counts it, and `usage-metrics.spec.ts` fails if the code counts a
metric the list does not name.

| Area | Metric | Type | Source |
| --- | --- | --- | --- |
| **Database** | `db.rows.<table>`, `db.bytes.<table>` (with indexes and TOAST) | gauge | 6.2 |
| | `db.bytes.total` (the measured tables), `db.size_bytes` (the whole database) | gauge | 6.2 |
| | `db.connections.max_today` | max | 6.2, `db-sample` every 5 min |
| **Entities** | `entities.people`, `entities.registrations.in_progress`, `entities.registrations.submitted`, `entities.members.confirmed`, `entities.finance.transactions`, `entities.finance.items`, `entities.users.active`, `entities.users.invited`, `entities.users.disabled`, `entities.roles.custom`, `entities.modules.enabled` | gauge | 6.2 |
| **Activity** | `users.active` — staff active that day | gauge | counted from `user_activity_daily` when read, not written |
| **API** | `api.requests`, `api.requests.<module>`, `api.route.<METHOD /template>` | counter | 2.11 |
| | `api.route_ms.<METHOD /template>` — time spent answering that route | counter | 2.11 |
| | `api.errors.4xx`, `api.errors.5xx`, `api.errors.403`, `api.throttled` | counter | 2.11 |
| | `api.latency_ms.sum` (average = sum / requests), `api.latency_ms.max` | counter / max | 2.11 |
| **Auth** | `auth.logins`, `auth.login_failures`, `auth.lockouts`, `auth.password_resets`, `auth.sessions_created` | counter | 1.13, 3.5 |
| | `auth.sessions.active` | gauge | 6.2 |
| **Impersonation** | `impersonation.started`, `impersonation.views`, `impersonation.minutes` | counter | 2.8, 2.11 |
| **Admin** | `admin.invitations.sent`, `admin.invitations.accepted`, `admin.role_changes`, `admin.modules.toggled` | counter | Phase 3 |
| **Email** | `email.sent`, `email.failed`, `email.retries` | counter | 3.1 |
| **Registration** | `registrations.started`, `registrations.submitted`, `membership.reminders.sent` | counter | Phase 5 |
| **Membership** | `membership.people.added`, `membership.applications.submitted`, `membership.members.confirmed`, `membership.attendance.marked` | counter | Phase 5 |
| **Finance** | `finance.transactions.created`, `.voided`, `.replaced`, `finance.catalog.created`, `finance.exports` | counter | Phase 4 |
| **Change requests** | `change_requests.created`, `.applied`, `.rejected`, `.cancelled`, and `change_requests.pending` (gauge) | counter / gauge | 4.6a |
| **Audit** | `audit.events` | counter | 2.10 |
| **Jobs** | last run, duration, ok/failed per job | — | `job_runs` |

`api.route.*` uses the **route template** (`GET /finance/transactions/:code`),
never the real path, so it cannot grow without bound or store codes and tokens.

*Changed from the first version:* `db.share_pct` (a church's share of a shared
database) and the platform-wide table are gone with D27. `api.route_ms.*` is
new, so the API tab can rank routes by time as well as calls. The latency
total had been adding one per request instead of the milliseconds taken,
which would have made every average read as 1 ms; that is fixed and
unit-tested.

---

## 6.2 — The nightly database snapshot

**Goal:** know how big each table is and how it grows.

Job `usage-snapshot`, daily at 02:00 Africa/Dar_es_Salaam, through `JobRunner`
(`core/usage/usage-snapshot.service.ts`):

1. For each table in `MEASURED_TABLES` — the tables that grow with use —
   `count(*)` and `pg_total_relation_size`, written as `db.rows.<table>` and
   `db.bytes.<table>`. `audit_events` is counted through `audit_events_count()`,
   because `irca_app` may not select from it (D16). Then `db.bytes.total` and
   `db.size_bytes`.
2. The entity gauges from 6.1, and `auth.sessions.active`.
3. Clean-up: sessions revoked or expired more than 90 days ago, and
   password-reset tokens older than 7 days, are deleted. Audit rows are kept
   forever.

`db-sample` runs every five minutes and keeps the day's highest connection
count. Full counts are fine to a few million rows; past that, switch the
counts to `tablesample` and scale.

*Changed:* the first version grouped every table by `church_id` and shared out
each relation's size by church. With one church, a table's size is the
church's size.

**Check:** `npm run cli -w @irca/api -- job:run usage-snapshot`; then
`db.rows.finance_transactions` in `usage_daily` equals
`select count(*) from finance_transactions`.

---

## 6.3 — Dev console API

All routes are under `/v1/dev` in `src/modules/dev`, which reaches the
database through `Db` like every other module (the lint exemption it used to
have is gone). Each route needs a `dev.*` permission; the `dev.developer` role
holds all of them, `dev.watcher` the read-only three.

| Route | Permission | Returns / does |
| --- | --- | --- |
| `GET /dev/health` | `dev.health.read` | Database size and connections, the 20 biggest tables, the 10 slowest queries from `pg_stat_statements` (normalised text, never values), the email queue by status, the last run of every job, and 14 days of requests and 5xx. |
| `GET /dev/usage?metrics=a,b&from=&to=` | `dev.usage.read` | Daily series, missing days filled with 0 for counters and carried forward for gauges. `users.active` is counted from `user_activity_daily`. No metrics asked for is an empty answer. |
| `GET /dev/usage/routes?days=` | `dev.usage.read` | Each route's calls and average time over the window, busiest first. |
| `GET /dev/usage/emails` | `dev.usage.read` | The last 50 emails: template, status, tries, error, times, and the address cut short **by the API** (`ne***@gmail.com`). |
| `GET /dev/database` | `dev.usage.read` | Per table: rows, bytes, change against 7 and 30 days ago, share of the total. |
| `GET /dev/logs/server` | `dev.logs.read` | The server's recent log lines, from memory. |
| `GET /dev/logs/actions` | `dev.logs.read` | What people did, from the activity log; with `dev.impersonations.read` the view-as rows too. |
| `GET/PATCH /dev/church` | `dev.church.manage` | The church's name, code, timezone and currency, and whether the code is locked (it is once any finance entry exists; the database enforces it too). Changes are in the activity log. |
| `GET/POST/DELETE /dev/api-clients[/:id]` | `dev.church.manage` | The registration form's keys: list (prefix, last used), make (the key is in that answer only), revoke. Both are in the activity log. |
| `GET /dev/impersonations?actor=&subject=&since=&until=&before=&limit=` | `dev.impersonations.read` | The view-as log, newest first (see 6.4). |
| `GET /dev/impersonations/:idOrPrefix` | `dev.impersonations.read` | One session and every page opened in it. |
| `GET /dev/impersonations/events?after=` | `dev.impersonations.read` | START / VIEW / END after a moment, for `follow`. |

*Not built, because D27 removed what they were for:* listing, creating,
suspending and reactivating churches, and one church's users and activity
(those are Admin → People and Admin → Activity).

---

## 6.4 — Dev console pages

The **Dev console** group in the sidebar, for anyone holding its permissions.

1. **`/dev`, Health** — the figures from `GET /dev/health`: database and
   connections, failed-request rate, emails waiting, requests and failures by
   day, the biggest tables, every job's last run, the email queue, and the
   slowest queries (or a note that `pg_stat_statements` is off).
2. **`/dev/usage`, Usage**, in tabs:
   - **Overview:** staff active today, requests and failure rate over 7 days,
     people on record, data stored, emails in 30 days; 90 days of requests by
     portal, of staff active, and of refused and failed requests.
   - **Every number:** any four metrics from the catalogue on one chart, over
     7 to 365 days, with a total or latest figure for each.
   - **Database:** the ten biggest tables, all the tables together over 90
     days, and a table with rows, growth this week and month, size and share.
   - **API:** requests, average and slowest answer, throttling, refused and
     failed by day, and the busiest and slowest routes (a route needs 20 calls
     to rank as slow).
   - **Sign-ins:** sign-ins, wrong passwords, lockouts, resets, sessions open,
     how often someone was viewed as (who and whom is only in the view-as
     log), and invitations sent and accepted.
   - **Email:** sent, retried and given up on in 30 days, and the last 50.
3. **`/dev/logs`, Logs** — the server's recent lines and what people did.
4. **`/dev/impersonations`, the view-as log**, drawn as a terminal (below).
5. **`/dev/settings`, Settings** — the church (edited in the drawer, the code
   locked once it is on an entry number) and the registration form's keys.

Charts are small inline SVG (`modules/dev/components/Charts.tsx`), in four
series colours checked for colour-blind separation against both themes'
surfaces, with every value readable by pointing at a day and as a table one
click away.

**The view-as log as a terminal.** The only screen where anyone can see who
viewed as whom and when (D16). Read-only: no command changes anything.

```
dev@irca:~$ log --since 24h
2026-09-21 14:02:11 EAT  START  0193a2f1  kaka@irca.org (Church administrator)
                                          → neema@example.com (Finance clerk)
2026-09-21 14:08:40 EAT  END    0193a2f1  stopped · 6m29s · 14 pages
1 session.
dev@irca:~$ show 0193a2f1
2026-09-21 14:02:15 EAT  VIEW   0193a2f1    GET /finance                 200    61ms
```

Background `#0C0C0C` and text `#D4D4D4` in both themes, Geist Mono, the prompt
in `#7FC79C`, START amber `#E5B567`, END cyan `#7CC4D8`, VIEW dim `#8E8880`,
errors `#F2B8B5`, each at least 4.5:1. Commands, parsed in the browser
(`modules/dev/terminal/`): `log [--actor] [--subject] [--since 24h|7d|30d|DATE]
[--until DATE] [--views]`, `show <id>`, `follow` (5 s polling, Ctrl+C stops),
`export`, `clear` / Ctrl+L, `help`. History on ↑/↓, Tab completion, a clicked
id runs `show`, an unknown command suggests the nearest, 2,000 lines of
scrollback. The output is `role="log"`, the prompt a real `<input>`. The
`--church` flag and the `churches` command went with D27.

**Check:** with the demo history (`npm run db:demo`) every tab shows numbers
that match hand-run SQL for at least one metric each. Walked in a browser in
both themes; `e2e/dev.spec.ts` covers health, logs, usage tab by tab,
settings with a key made and revoked, and the view-as log.

---

## 6.5 — Security hardening

The checklist, each item with its evidence, is **`docs/hardening.md`**. In
short, what this step added or found:

- Refusals and 404s went out without `Cache-Control: no-store`, because the
  header was set by an interceptor that only runs after the guards. It is now
  middleware.
- The API refuses to boot in production unless the session cookie's name
  starts with `__Host-`.
- Tokens in request paths (invitation links) are redacted before a log line
  is written.
- The rate limits on forgot, reset, and looking up and accepting an
  invitation are tested, as sign-in and the registration form already were.
- The permission matrix is **generated** from the routes, for every module,
  instead of written out for Finance alone.
- Viewing as someone is read-only in **all three** layers again. The
  single-church work had dropped the read-only database role as though it were
  about tenancy, and deleted the tests for the API and database layers with
  it; both are back, and a new test calls every GET route in the API on the
  read-only connection.

*Changed:* the multi-tenancy items (the route fuzzer, the layer-alone tests,
row-level security in production, cross-church tests) have nothing to check
since D27. What they protected that was never about churches — the activity
log that cannot be rewritten, finance entries that cannot be deleted, the
view-as log only devs can read — is enforced by grants, and checked at launch
with the query in `docs/hardening.md`.

---

## 6.6 — The command line for setting up and recovering

Creating a church and its first administrator used to be a console action,
and went with D27; nothing else could make the church's row on a production
database. The command line (`apps/api/src/cli/main.ts`, every command listed
at its top) now has:

| Command | Does |
| --- | --- |
| `church:setup --code --name [--timezone] [--currency]` | Writes the church's one row of settings. Once only. |
| `user:create-dev --email --name` | Creates or takes over the account, sets its password, and gives it Developer and Church administrator. |
| `user:send-reset --email` | Queues the same email "Forgot password" sends, and says why when it cannot. |
| `role:grant --email --role <built-in key>` | Gives a built-in role back to a locked-out administrator. |
| `sessions:revoke --email` | Signs someone out of every browser now. |

Each writes to the church's activity log as "from the command line".
`api-client:create`, `registrations:import`, `registrations:export-back` and
`person:erase` had kept requiring a `--church` flag their usage no longer
mentioned; that is fixed.

**Check:** run end to end against an empty database, then the API booted on it
and the new developer signed in. `cli.e2e-spec.ts` covers each command.

---

## Moved out: performance, backups, per-church moves and monitoring

Steps 6.6 (old numbering), 6.8, 6.8a and 6.9 are **Phase 10**
(`10-strengthening.md`). They were moved on 23 September 2026 because none of
them is needed to build a feature. Phase 10 does not start until the owner
says so.

---

## 6.7 — Environments and deployment

**`docs/deployment.md`** is the version to follow: the three environments,
the Neon roles (`irca_owner`, `irca_app`, `irca_readonly`, `irca_backup`; the
old `irca_core` is not used) and why the runtime ones are made in SQL, the
connection strings, the API's build, pre-deploy migration and start commands,
every production setting, the two commands for an empty database, the portal
and registration projects on Vercel, email records in Resend, error tracking,
and what to check after each deploy.

**Open: the domain.** Ask the owner. The recommendation is subdomains of one
domain the church controls (`api.`, `portal.`), so email records and
certificates are in one place; the registration form keeps its current domain.

---

## 6.10 — Runbooks

In **`docs/runbooks/`**, each short and with exact commands:
`locked-out-admin.md`, `revoke-access-now.md`, `rotate-registration-key.md`,
`restore.md` (from Neon's history; the nightly dump is Phase 10),
`erasure-request.md`, `cutover-registration.md` (5.18 as a checklist, with
previews on staging rather than a TEST church), and `add-a-module.md`.

*Changed:* `suspend-church.md` is not written. There is one church, and the
people who run it do not suspend it; taking the system down is the host's
switch.

---

## 6.11 — Launch and training

1. **Two one-page guides**, in the portal under **Help** (linked from the
   sidebar for everyone) and printable as one A4 page each with "Print or save
   as PDF": *Getting started* and *Finance in five minutes*. Built. Print one
   of each for the training sessions from the portal itself, so the paper
   never drifts from the screens.
2. A 30-minute session with the pastors on Applications and Discipleship,
   using staging. *The owner's.*
3. Launch order: administrators → the Membership portal (pastors and office)
   → the registration cutover (`docs/runbooks/cutover-registration.md`) →
   Finance, after a week on staging with the finance team entering real
   receipts alongside their current book. *The owner's.*
4. For the first month, every Monday: **Dev → Usage** (failed requests,
   sign-in failures and lockouts, emails given up on) and **Dev → Health**
   (jobs failed, the email queue). *The owner's.*

---

## 6.12 — Starting the next department

The owner does not yet know what Media or Programs need. **Do not build a
module from guesses.** Before writing a manifest, spend an hour with that
department and fill in `docs/modules/<key>-brief.md`:

1. Who is in the department, and who leads it? (These become the roles.)
2. What do they do every week that involves a list, a record or a number?
   (These become the pages.)
3. What would they look up? What would they change? Who must approve what?
   (This splits the permissions into read and write, and finds `decide`-style
   permissions.)
4. What do they need from other portals? Each is an explicit cross-module read
   permission, such as `membership.people.read` granted to a Comms role,
   **never** a copy of the data.
5. What must they never see? (Comms must not see prayer requests; that is
   already `membership.people.read_sensitive`.)
6. What goes out of the system (SMS, emails, printed lists), and who pays for
   it? (This adds usage metrics such as `sms.sent` and its cost.)

Then follow `docs/adding-a-module.md`. The first slice of any new module is a
single read-only list page; the generated permission matrix covers it without
being asked.

**Two are written.** The owner gave the Outreach and Communications
departments' own accounts on 22 September:

- `docs/modules/comms-brief.md` → **Phase 7** (`07-communications.md`).
- `docs/modules/outreach-brief.md` → **Phase 8** (`08-outreach.md`).

Both still have "TBC" where the department itself has to answer — the
Communications budget, the Outreach team's size, which figures they report
upward — and those are step 7.1 and step 8.1. **Phases 7, 8 and 9 were drafted
before D27** and still give their tables a `church_id` and church-scoped
unique keys; each needs the same treatment the schema got before it is built
(see D27, "Impact on the rest of the plan").

| Need from the 17 September notes | Where it is built |
| --- | --- |
| Send messages via Beem: welcome, thanks for giving, reminders | Phase 7, steps 7.4 and 7.7 |
| See names, gender and phone numbers | `membership.people.read` (+ `read_sensitive`), granted to the Comms role |
| See what a person still owes on a pledge | Phase 9, step 9.3's audience provider |
| Filter who gave in a given week | still not planned — see Q8, which says why |
| See visitors and approved members to welcome them | `membership.people.read` + the `church.people` audience |

---

## 6.13 — Phase check (launch)

Done:

- [x] The dev console shows every metric in 6.1 with history (checked against
      eighteen months of demo history; production gains its own from launch).
- [x] Hardening built and recorded, with evidence, in `docs/hardening.md`.
- [x] Deployment written (`docs/deployment.md`); runbooks written
      (`docs/runbooks/`); guides in the portal.
- [x] API unit and end-to-end tests, and every browser journey, pass.

The owner's, or the church's:

- [ ] Choose the domain (6.7).
- [ ] A second person reads the runbooks, and reads each raw query
      (`docs/hardening.md`).
- [ ] Leadership reads `docs/data-inventory.md`; legal advice on the form's
      consent wording.
- [ ] Production has: the developer account, IRCA set up with its first
      administrator, Membership on, and the four launch checks in
      `docs/hardening.md` pasted into the launch PR.
- [ ] The registration cut over (`docs/runbooks/cutover-registration.md`).
- [ ] Finance launched after the parallel-run week.
- [ ] Someone other than the builder walks the new pages from a fresh
      database (`npm run db:reset && npm run db:seed`), per the README's
      definition of done.

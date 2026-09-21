# Phase 6 — Dev console, hardening, deployment and launch

**Outcome.** A dev signs in and sees **every church's usage, from database
rows and bytes to requests, errors, active people, sign-ins, emails,
registrations and finance entries**, over time. Devs can open any church,
create a church and invite its admin, suspend it, manage its API keys, and view
as anyone (read-only). The system is hardened, backed up, monitored and
deployed to production. There are runbooks for the things that go wrong, and a
recipe for starting the next department.

| Step | What |
| --- | --- |
| 6.1 | What is collected (the complete list) |
| 6.2 | The nightly database snapshot |
| 6.3 | Platform API |
| 6.4 | Dev console pages |
| 6.5 | Security hardening |
| 6.6 | Performance and load |
| 6.7 | Environments and deployment |
| 6.8 | Backups and restore drill |
| 6.8a | Per-church export, restore, move and offboarding |
| 6.9 | Monitoring and alerts |
| 6.10 | Runbooks |
| 6.11 | Launch and training |
| 6.12 | Starting the next department |
| 6.13 | Phase check |

---

## 6.1 — What is collected (the complete list)

Everything below is per church per local day, unless marked *platform*. It
is written to `usage_daily` (counters from 2.11, gauges from 6.2) or
`platform_usage_daily`. Put this table in
`packages/shared/src/usage-metrics.ts` with each metric's **type**
(`counter` = summed, `max` = greatest, `gauge` = latest snapshot value replaces),
its label and its unit. The dev console renders from it, so adding a metric is
one line plus the code that counts it.

| Area | Metric | Type | Source |
| --- | --- | --- | --- |
| **Database** | `db.rows.<table>` for every church-owned table | gauge | 6.2 |
| | `db.bytes.<table>` (estimated, including the church's share of indexes) | gauge | 6.2 |
| | `db.bytes.total`, `db.share_pct` (of the whole database) | gauge | 6.2 |
| | *platform:* `db.size_bytes`, `db.connections.max_today`, table and index sizes | gauge | 6.2 |
| **Entities** | `entities.people`, `entities.registrations.in_progress`, `entities.registrations.submitted`, `entities.members.confirmed`, `entities.finance.transactions`, `entities.finance.items`, `entities.users.active`, `entities.users.invited`, `entities.users.disabled`, `entities.roles.custom`, `entities.modules.enabled` | gauge | 6.2 |
| **Activity** | `users.active` (DAU; WAU/MAU derived from `user_activity_daily`) | gauge | `user_activity_daily` |
| **API** | `api.requests`, `api.requests.<module>`, `api.route.<METHOD /template>` | counter | 2.11 |
| | `api.errors.4xx`, `api.errors.5xx`, `api.errors.403` (permission denials) | counter | 2.11 |
| | `api.latency_ms.sum` (average = sum / requests), `api.latency_ms.max` | counter / max | 2.11 |
| **Auth** | `auth.logins`, `auth.login_failures`, `auth.lockouts`, `auth.password_resets`, `auth.sessions_created` | counter | 1.13, 3.5 |
| | `auth.sessions.active` | gauge | 6.2 |
| **Impersonation** | `impersonation.started`, `impersonation.views`, `impersonation.minutes` | counter | 2.8, 2.11 |
| **Admin** | `admin.invitations.sent`, `admin.invitations.accepted`, `admin.role_changes`, `admin.modules.toggled` | counter | Phase 3 |
| **Email** | `email.sent`, `email.failed`, `email.retries` | counter | 3.1 |
| **Registration** | `registrations.started`, `registrations.submitted`, `registrations.reminders` | counter | Phase 5 |
| **Membership** | `membership.applications.submitted`, `.approved`, `.confirmed`, `membership.attendance.marked` | counter | Phase 5 |
| **Finance** | `finance.transactions.created`, `finance.transactions.voided`, `finance.catalog.created`, `finance.exports`, `finance.change_requests.applied` | counter | Phase 4 |
| **Change requests** | `change_requests.created`, `.approved`, `.rejected`, `.cancelled`, and `change_requests.pending` (gauge) | counter / gauge | 4.6a |
| **Audit** | `audit.events` | counter | 2.10 |
| **Storage** | `storage.bytes` (reserved for attachments) | gauge | later |
| **Jobs** | *platform:* last run, duration, ok/failed per job | — | `job_runs` |

`api.route.*` uses the **route template** (`GET /finance/transactions/:code`),
never the real path, so it cannot grow without bound or store codes and tokens.

**Commit:** "List every usage metric in one place with its type and unit".

---

## 6.2 — The nightly database snapshot

**Goal:** know how much of the database each church uses, and how that grows.

**Do** — job `usage-snapshot`, daily at 02:00 Africa/Dar_es_Salaam, via
`JobRunner`. It is a platform job, and it loops over `registry.clusters()`
(02 step 2.4b), running the per-table queries below on each cluster through
that cluster's core client, never through `PrismaCore` alone:

1. The list of church-owned tables comes from the Prisma DMMF: every model
   with a `churchId` field, plus the core tables with `church_id` (`audit_events`,
   `email_outbox`, `usage_daily`, `user_activity_daily`, `invitations`,
   `impersonation_sessions`). Map model names to table names with `dbName`.
2. For each table:

   ```sql
   -- tenant: platform job, grouped by church
   select church_id, count(*)::bigint as rows, coalesce(sum(pg_column_size(t.*)), 0)::bigint as bytes
   from <table> t
   group by church_id;
   ```

   and `pg_total_relation_size('<table>')` for the table including indexes and TOAST.
   The church's estimated bytes = `total_relation_size × church_bytes /
   all_churches_bytes` (its share of the heap, applied to the whole
   relation). Write `db.rows.<table>` and `db.bytes.<table>` as **gauges**
   (`on conflict do update set value = excluded.value`).
3. Totals per church: `db.bytes.total`, and `db.share_pct` = its bytes /
   `pg_database_size(current_database())` × 100 (stored ×100 as an integer to
   keep `bigint`).
4. Entity gauges from 6.1 with simple `count(*) … group by church_id` queries.
5. `auth.sessions.active` = sessions not revoked and not expired, by `active_church_id`.
6. *Platform:* `pg_database_size`, the top 20 tables and indexes by size, and
   `max(numbackends)` observed today (sampled every 5 minutes by a small job
   `db-sample` from `pg_stat_database`).
7. **Cost note in the code:** full counts are fine up to a few million rows.
   Beyond that, switch the byte estimate to `tablesample system (1)` and scale.
8. In the same job: **delete** sessions revoked or expired more than 90 days ago,
   and `password_reset_tokens` older than 7 days. Audit rows are kept forever.

**Check:** run it by hand (`npm run cli -w @irca/api -- job:run usage-snapshot`).
`usage_daily` has `db.rows.finance_transactions` for IRCA equal to
`select count(*) … where church_id = IRCA`.

**Commit:** "Measure each church's share of the database every night".

---

## 6.3 — Platform API

All routes live under `/v1/platform`, in `src/modules/platform`, which is the
only feature module allowed to inject `PrismaCore` (1.9), the connection that
row-level security lets see every church (2.4a). Each route requires a
`platform.*` permission, and so a dev.

| Route | Permission | Returns / does |
| --- | --- | --- |
| `GET /platform/churches` | `platform.churches.read` | Every church: status, created, users (active/invited), modules enabled, last activity, and 7-day and 30-day sums of requests, 5xx errors, active users, sign-ins, emails, registrations and finance entries, plus the latest `db.bytes.total` and `db.share_pct`. |
| `GET /platform/churches/:id` | `platform.churches.read` | The details plus the church's admins. |
| `GET /platform/churches/:id/usage?metrics=a,b&from=&to=` | `platform.usage.read` | Daily series for the requested metrics, with missing days filled with 0 for counters and carried forward for gauges. |
| `GET /platform/churches/:id/database` | `platform.usage.read` | The latest per-table rows and bytes, with the change vs 7 and 30 days ago. |
| `GET /platform/churches/:id/users` | `platform.churches.read` | Users with roles and last active, plus `canImpersonate`. |
| `GET /platform/churches/:id/audit` | `platform.churches.read` | That church's activity log (same shape as 3.12). |
| `POST /platform/churches` | `platform.churches.manage` | Create a church and invite its first admin: the same code as the 3.15 CLI. |
| `POST /platform/churches/:id/suspend` / `reactivate` `{ reason }` | `platform.churches.manage` | A suspended church: its members' sessions in that church are ended, and sign-in to it is refused with "This church's account is paused. Contact support." Its registration key stops working (`403`). Devs can still view and impersonate. Audited with `churchId: null` **and** in the church's own log. |
| `GET/POST/DELETE /platform/churches/:id/api-clients` | `platform.churches.manage` | List (prefix, last used), create (the key is shown once), revoke. |
| `GET /platform/health` | `platform.health.read` | DB size and connections, the top 10 queries from `pg_stat_statements` (by total time: calls, mean ms, and the query text **normalised**, which never includes parameter values), outbox backlog (pending / failed), `job_runs` (last run per job), and platform error rates. |
| `GET /platform/usage?metrics=&from=&to=` | `platform.usage.read` | Platform-wide series (all churches summed, plus `platform_usage_daily`). |

**The impersonation log** (the only place impersonation can be read, D16):

| Route | Permission | Returns |
| --- | --- | --- |
| `GET /platform/impersonations?church=&actor=&subject=&since=&until=&before=&limit=` | `platform.impersonations.read` | Sessions, newest first (keyset by `startedAt, id`, limit ≤ 500): id, church code, the actor's and subject's name, email and role labels, started, ended, end reason, duration, and the number of pages viewed. `actor`/`subject` match name or email (contains, case-insensitive). `since`/`until` accept `24h`, `7d`, `30d` or a date. |
| `GET /platform/impersonations/:id` | `platform.impersonations.read` | One session plus every `impersonation.view` row of it (time, method, route path, status, ms), read through `AuditQueries.forPlatform()`. |
| `GET /platform/impersonations/events?after=<iso>&church=` | `platform.impersonations.read` | START / VIEW / END events after a moment, oldest first, max 200. Used by `follow` on the terminal page (polled every 5 s). |

Impersonation from the dev console uses the normal `POST /v1/impersonation`
with `churchId` (2.8).

`pg_stat_statements`: enable it on Neon (`create extension if not exists
pg_stat_statements;` as the owner). Reading it needs `pg_read_all_stats`,
so grant that to `irca_app`, or read it through a narrow `security definer`
function owned by `irca_owner`. The function is preferred: it exposes only
the columns above.

**Commits:** "List every church with its usage for devs"; "Serve usage series
and database breakdowns per church"; "Create, suspend and reactivate churches";
"Show platform health to devs".

---

## 6.4 — Dev console pages

Devs see a **Dev console** group at the top of the sidebar (2.13). Pages under
`/platform`, all read-only by design except the four actions (create church,
suspend/reactivate, API keys, view as). Follow the `dataviz` guidance in the
repository's skills for charts. For this scale, small inline SVG line and bar
charts are enough, and no chart library is needed.

1. **`/platform`, Churches**

   ```
   Dev console · Churches                                        [+ New church]
   Last 7 days ▾
    Church            Status   People  Portals  Requests  Errors  Active  Emails  Regs  Entries  DB size  Share  Last active
    IRCA              Active   14      3        48,210    3 (0%)  11      12      86    142      41 MB    96%    2 min ago
    ~~~~~~~~~~ sparkline of requests under each row ~~~~~~~~~~
    Test Church       Active   2       1        310       0       1       2       0     4        1.2 MB   3%     3 days ago
   ```

   Sort by any column. The header row shows platform totals.
2. **`/platform/churches/[id]`**, with tabs:
   - **Overview:** stat tiles (Active today, Active this month, Requests 7d,
     Error rate, DB size, Emails 30d) and 90-day charts for requests (split by
     module, stacked), active users, and errors.
   - **Database:** a table per church-owned table (rows, estimated size,
     change in 7d/30d, share of the church's total), and a 90-day line of
     `db.bytes.total`.
   - **Activity:** sign-ins, failures, lockouts, password resets, active
     sessions, the number of impersonations (details are only in the
     impersonation log, 6.4 item 4), and the invitation funnel
     (sent → accepted).
   - **API:** the top routes by calls and by average latency, and 4xx/5xx over time.
   - **Email:** sent, failed, retries, and the last 50 outbox rows (status,
     template, recipient **masked** as `ne***@gmail.com`, error).
   - **Modules & people:** enabled modules, and users with roles and last active,
     each with **View as** (one click, as in 3.9).
   - **Activity log:** the church's audit log (3.12's component, reused).
   - **Settings:** status (Suspend / Reactivate with a reason), code and slug
     (the code is shown as locked once finance entries exist), timezone and
     currency, and API keys.
3. **`/platform/churches/new`:** code, slug, name, timezone, currency, and the
   first admin's name and email → creates and invites (their invitation
   email says the church was set up for them).
4. **`/platform/impersonations`, the impersonation log, drawn as a real terminal.**
   This is the only screen in the system where anyone can see who viewed as
   whom and when. It is read-only: no command changes anything.

   ```
   ┌─ ● ● ●  irca — impersonation-log — 132×40 ───────────────────────────────────────────────────┐
   │ IRCA platform shell. Type `help` for commands.                                                │
   │ dev@irca:~$ log --since 24h                                                                   │
   │ 2026-09-21 14:02:11 EAT  IRCA  START  0193a2f1  kaka@irca.org (Church administrator)          │
   │                                                 → neema@example.com (Finance clerk)          │
   │ 2026-09-21 14:08:40 EAT  IRCA  END    0193a2f1  stopped · 6m29s · 14 pages                    │
   │ 2026-09-21 16:40:03 EAT  TEST  START  0193b7c0  dev@irca.local (dev) → t-admin@example.com    │
   │ 2026-09-21 17:10:03 EAT  TEST  END    0193b7c0  expired · 30m00s · 3 pages                    │
   │ 2 sessions.                                                                                   │
   │ dev@irca:~$ show 0193a2f1                                                                     │
   │ 2026-09-21 14:02:15 EAT  IRCA  VIEW   0193a2f1    GET /finance                 200    61ms   │
   │ 2026-09-21 14:02:22 EAT  IRCA  VIEW   0193a2f1    GET /finance/transactions    200    84ms   │
   │ …                                                                                             │
   │ dev@irca:~$ █                                                                                 │
   └───────────────────────────────────────────────────────────────────────────────────────────────┘
   ```

   **Look.** A window frame with three dots and a title bar, filling the content
   area. Background `#0C0C0C` and text `#D4D4D4` **in both themes** (it is a
   terminal), in a monospace font (load Geist Mono with `next/font`). The
   prompt is `dev@irca:~$` in `#7FC79C`, `START` in amber `#E5B567`, `END`
   in cyan `#7CC4D8`, `VIEW` in dim `#8E8880`, and errors in `#F2B8B5`.
   Every one of those passes 4.5:1 on the background. A blinking block cursor,
   which stops blinking under `prefers-reduced-motion`. Columns are aligned
   with fixed widths, and long lines wrap with a hanging indent as above.
   Times are in each church's timezone, with its abbreviation.

   **Commands** (parsed in the browser; each one calls the endpoints above):

   | Command | Does |
   | --- | --- |
   | `log [--church CODE] [--actor TEXT] [--subject TEXT] [--since 24h\|7d\|30d\|DATE] [--until DATE] [--views]` | List sessions (START and END lines). With `--views`, every page view is indented under its session. `log` alone = the last 24 h. |
   | `show <id>` | One session with every page viewed. The first 8 characters of the id are enough. |
   | `follow [--church CODE]` | Live: print new START/VIEW/END lines as they happen (5 s polling). `Ctrl+C` stops. |
   | `churches` | List church codes and names, for `--church`. |
   | `export [same flags as log]` | Download the output as `impersonations-2026-09-21.log` (plain text). |
   | `clear` (or `Ctrl+L`) | Clear the screen. |
   | `help [command]` | Usage. |

   **Behaviour.** On open, it types and runs `log --since 24h` by itself, so
   the page is useful at a glance. `↑`/`↓` walk the command history (kept in
   `sessionStorage`), `Tab` completes command names, flags and church codes,
   and clicking a session id runs `show <id>`. An unknown command prints
   `irca: command not found: xyz` and suggests the nearest one. Output beyond
   2,000 lines is trimmed from the top, like a real scrollback.

   **Accessibility.** The output area is `role="log"` with `aria-live="polite"`.
   The prompt is a real `<input>` with a visually hidden label, "Command". Text
   can be selected and copied like any page, and nothing is drawn on a canvas.

   **Build it** as `apps/portal/src/modules/platform/terminal/`: a `Terminal`
   component (frame, scrollback, prompt, history, completion), a pure
   `parseCommand(line)` (unit-tested for every command and every bad input), and
   a `commands.ts` map from name to handler. Handlers return lines as
   `{ text, tone }[]` and never touch the DOM, so they are easy to test.

5. **`/platform/health`:** database size and top tables, connections today,
   slow queries, job runs (last run, duration, ok/failed, and the last error),
   outbox backlog, and 5xx rate across the platform.

**Check:** with two churches and a few days of use, every tab shows numbers
that match hand-run SQL for at least one metric each.

**Commits:** one per page, and one per tab of the church page.

---

## 6.5 — Security hardening

Work through this list. Each item is a checkbox in the PR, with evidence.

**HTTP and browser**

- [ ] Portal and registration: `Strict-Transport-Security: max-age=63072000;
      includeSubDomains`, `X-Content-Type-Options: nosniff`, `Referrer-Policy:
      strict-origin-when-cross-origin` (and `no-referrer` on token pages, 3.4),
      `Permissions-Policy` denying camera/microphone/geolocation, and
      `frame-ancestors 'none'`.
- [ ] A **Content-Security-Policy** for the portal with nonces (read the Next 16
      CSP guide in `node_modules/next/dist/docs/`): `default-src 'self'`,
      scripts by nonce, `connect-src 'self'`, `img-src 'self' data:`,
      fonts self-hosted by `next/font`.
- [ ] No `dangerouslySetInnerHTML` anywhere (`grep`). React escapes everything else.
- [ ] The API: `helmet()` defaults, no CORS, and `x-powered-by` off.

**Authentication and sessions**

- [ ] Production cookie name `__Host-irca_session`, `Secure`, `HttpOnly`, `SameSite=Lax`.
- [ ] The login, forgot, reset, accept and public registration rate limits were tested.
- [ ] Password change, reset, disable and suspension each end the right sessions (tests exist).
- [ ] Session and invitation tokens never appear in logs (search a day of production logs for `irk_` and for 43-character base64url strings).

**Multi-tenancy** (every section of `multi-tenancy.md`)

- [ ] The route fuzzer, the layer-alone tests and all CI coverage checks pass.
- [ ] A per-church export and `--replace` import was run on staging without touching the other church.
- [ ] `church:move` was run end to end against a second database.
- [ ] Rate-limit fairness and per-church quotas behave as specified.
- [ ] No cached response contains church data (`no-store` on every `/v1` response).

**Access control**

- [ ] The route audit is on in production (it runs at every boot).
- [ ] Every module has a generated permission-matrix test.
- [ ] Every module has a cross-church test (read, write and suggest endpoints).
- [ ] Impersonation's three layers each have a passing test, and the
      `@AllowWhileImpersonating` list is still exactly two.
- [ ] The raw-SQL check (2.4) passes, and each `$queryRaw` has been read by a second person.
- [ ] `$queryRawUnsafe` and `$executeRawUnsafe` are not used anywhere (`grep`, enforced by ESLint).

**Data**

- [ ] The database roles in production match 1.5 (`\du` output in the PR):
      the runtime uses `irca_app`, `irca_readonly` and `irca_core`, never the
      owner, and **no runtime role has `BYPASSRLS` or superuser**.
- [ ] Row-level security is on for every table in the 2.4a coverage check,
      in production (`select relname from pg_class where relrowsecurity`).
- [ ] `audit_events` and `finance_transactions` have their revokes in production.
- [ ] Personal data inventory written in `docs/data-inventory.md`: what is
      stored about visitors (including prayer requests), staff and money, who
      can see it, and how long it is kept. Tanzania's Personal Data Protection
      Act (2022) applies to this data. **Have the church's leadership read
      the inventory, and take advice on consent wording for the registration
      form** before launch.
- [ ] A dev-run CLI `person:erase --church IRCA --person <id>` for erasure
      requests: it deletes the registration, person, notes and attendance,
      replaces the name in audit summaries with "[erased]", and records that
      it ran (audit, with no personal data).
- [ ] Dependencies: `npm audit --omit=dev` is clean or its exceptions are
      documented, and Dependabot (or Renovate) is enabled for the repository.
- [ ] Secrets live only in the host's environment settings. `git log -p |
      grep -i -E "irk_|re_[A-Za-z0-9]{20,}|postgres://[^ ]*:[^ ]*@"` finds nothing.

**Commits:** one per area, each saying what was tightened and why.

---

## 6.6 — Performance and load

1. **Indexes:** run `EXPLAIN ANALYZE` on the default query of every list page
   (People, Members, Transactions, Activity, Applications) with 10× today's
   data (write a seed option `--scale 10`). Anything showing `Seq Scan` on a
   big table gets an index, in a migration with a comment saying which page needs it.
2. **Sunday peak:** a `k6` script `load/registration.js` simulating 200
   visitors going through the form over 10 minutes (create, step saves,
   drafts, submit) against staging. Target: p95 < 400 ms for step saves and no errors.
3. **Numbering under load:** 20 clerks × 20 expenses in parallel against
   staging → 400 consecutive numbers (this repeats 4.4 on real infrastructure).
4. **Connections:** at runtime the API uses Neon's **pooled** host for
   `DATABASE_URL` and `DATABASE_URL_READONLY`, with Prisma's
   `connection_limit` set to 5 each. If Prisma reports prepared-statement
   errors through the pooler, add `pgbouncer=true` to those URLs (check
   Neon's and Prisma's current docs when you deploy: this changes between
   versions). Migrations use the **direct** host (`DIRECT_DATABASE_URL`).

**Commit:** "Index the list pages for ten times today's data"; "Add a load
test for Sunday registrations".

---

## 6.7 — Environments and deployment

**Three environments**

| | Local | Staging | Production |
| --- | --- | --- | --- |
| Database | local Postgres `irca_dev` | Neon branch `staging` | Neon `main` |
| API | `localhost:4000` | `api-staging.<domain>` | `api.<domain>` |
| Portal | `localhost:3000` | Vercel preview/staging | `portal.<domain>` |
| Registration | `localhost:3001` | Vercel preview | the existing production domain |
| Email | `log` | Resend, to team addresses only | Resend |
| Churches | seeded IRCA + TEST | IRCA copy + TEST | IRCA (+ future) |

Ask the owner for the domain before this step. The recommendation is
subdomains of one domain the church controls, so email DNS is in one place.

**Neon**

1. In the Neon console, create roles `irca_owner` (the console makes it a
   member of `neon_superuser`, which is needed for `create extension`),
   `irca_core`, `irca_app`, `irca_readonly` and `irca_backup`. Set strong
   generated passwords and store them in a password manager. **Check that
   none of the runtime roles has `BYPASSRLS`** (`\du`). If Neon's console gives
   console-made roles `neon_superuser` membership, create the four runtime roles
   with SQL as `irca_owner` instead (`create role … login password …`), so they
   stay ordinary roles that row-level security applies to.
2. Create the database `irca` owned by `irca_owner`, and a branch `staging`.
   Set the statement timeouts from 1.5 (`alter role irca_app set
   statement_timeout = '10s'`, the same for `irca_readonly`, and `'60s'` for
   `irca_core`) as the role that created them.
3. `DIRECT_DATABASE_URL` = the owner on the direct host;
   `DATABASE_URL` = the app role on the pooled host;
   `DATABASE_URL_CORE` = the core role on the pooled host;
   `DATABASE_URL_READONLY` = the read-only role on the pooled host.
   The backup role's URL (direct host) goes only into the backup job's secrets.
   All with `sslmode=verify-full` (see the registration README for why).

**API on Railway or Render** (the same settings on either):

- Root: the repository root. Node 24.
- Build: `npm ci && npm run build -w @irca/shared && npx prisma generate --schema apps/api/prisma/schema.prisma && npm run build -w @irca/api`
- Pre-deploy (release) command: `npm run db:deploy -w @irca/api`. Migrations
  run once per deploy, before the new version takes traffic. A failed
  migration fails the deploy, not the site.
- Start: `node apps/api/dist/main.js`. Health check path: `/health`.
- **One instance** to begin with (jobs are lock-safe if this ever changes, 2.12).
- Env: every variable in `apps/api/.env.example`, with production values.
  `NODE_ENV=production`, `SESSION_COOKIE_NAME=__Host-irca_session`,
  `PORTAL_ORIGIN=https://portal.<domain>`,
  `REGISTRATION_ORIGIN=https://<registration domain>`, `EMAIL_PROVIDER=resend`,
  `TRUST_PROXY` = the number of proxies in front of it (the host's load balancer,
  plus Vercel's rewrite hop. Verify it by logging `req.ip` once and checking it
  is a real client IP).
- After the first deploy, open a shell on the host:
  `npm run cli -w @irca/api -- user:create-dev --email <owner> --name "<owner name>"`,
  then sign in to the portal, and create IRCA from the dev console (or with
  3.15's CLI) with the senior pastor as first admin.

**Portal on Vercel:** a new project, Root Directory `apps/portal`, env
`API_INTERNAL_URL=https://api.<domain>` and
`SESSION_COOKIE_NAME=__Host-irca_session`, domain `portal.<domain>`.

**Email:** in Resend, add the sending domain and create the SPF, DKIM and
DMARC DNS records it shows. Send a test invitation to Gmail and Outlook
addresses, and check it lands in the inbox, not spam.

**Error tracking (recommended):** Sentry for the API and portal (the free
tier is enough), with `beforeSend` scrubbing cookies, authorisation headers and
request bodies.

**Commit:** "Describe how each app is built and deployed" (in
`docs/deployment.md`, with the tables above filled in with real names).

---

## 6.8 — Backups and restore drill

1. Neon keeps point-in-time history. **Check the restore window on the
   current plan** and write it in `docs/deployment.md`.
2. In addition, a scheduled GitHub Action runs nightly
   `pg_dump --format=custom --enable-row-security` as `irca_backup`. That role
   reads every church through its backup policy (2.4a) and can write nothing.
   Without `--enable-row-security`, `pg_dump` refuses any table with row-level
   security on. It then encrypts the dump with
   `age` using a public key committed to the repository, and uploads it to object
   storage (e.g. Cloudflare R2 or Backblaze B2) with 30-day retention. The
   private key is held offline by the owner and one pastor.
3. **Restore drill** (do it before launch, then every quarter): download last
   night's dump, decrypt it, restore it into a scratch Neon branch, point a
   local API at it, sign in, and check that yesterday's finance entries and
   registrations are there. Write the date and the time it took in `docs/runbooks/restore.md`.

**Commit:** "Back up the database nightly and write down how to restore it".

---

## 6.8a — Per-church export, restore, move and offboarding

**Goal:** a church's data can be taken out, put back, moved to its own
database, or removed, **without touching any other church**
(`multi-tenancy.md`, sections 11, 13 and 14). These are CLI commands run by a
dev. The same code backs a dev-console button later if wanted.

**Do**

1. **`church:export --church IRCA [--out dir]`**: for every tenant-plane
   model (02 step 2.4b), in foreign-key order, stream the church's rows to
   `<table>.jsonl` (through `registry.coreFor(church)`), plus `audit_events`
   with `source = 'feature'`, and the church's control-plane rows: the
   `churches` row, placement, modules, roles, role permissions, memberships and
   membership roles, and for its users **only** id, name, email and status (never
   password hashes or sessions). Also a `manifest.json` with row counts and a
   SHA-256 per file, the schema migration name, and the time. Encrypt the whole
   thing with `age`. Scheduled weekly per church by `forEachChurch`, uploaded next
   to the nightly dump, and kept 8 weeks.
2. **`church:import --church IRCA --from archive [--replace] [--target cluster]`**:
   verifies the manifest and that the schema migration matches (refuse otherwise).
   Puts the church in maintenance (`MOVING`). With `--replace`, deletes that
   church's tenant-plane rows in reverse foreign-key order (as the owner role,
   inside one transaction), then inserts the archive in foreign-key order,
   verifies counts and checksums, and returns the church to `ACTIVE`.
   **Never touches rows of any other church**: every statement is
   `where church_id = $1`, and a test proves it.
3. **Restoring one church from a point in time:** restore Neon's history into a
   scratch branch → `church:export` against it → `church:import --replace` into
   production. Write this in `docs/runbooks/restore-one-church.md`.
4. **`church:move --church X --to <cluster>`**: the procedure in
   `multi-tenancy.md` section 13 (maintenance → copy → verify → flip placement →
   smoke → purge after 7 days with `church:purge --church X --cluster shared`,
   which refuses unless the placement points elsewhere and an export from the
   last 24 hours exists). Build and test it now against the e2e second cluster
   (`irca_test_c2`), even though no church needs it yet. A tool that has never
   run is not a migration path.
5. **`church:offboard --church X`**: suspend, run a final export (handed to the
   church), then schedule `church:delete` for 90 days later. That removes
   tenant-plane rows, files, memberships and roles, deletes users who belong to
   no other church, and records a platform audit event with row counts and no
   personal data. `church:delete` refuses to run early without `--now` and a
   typed confirmation of the church code.

**Check:** export IRCA, import it into an empty local database, and compare
counts and checksums. Then `--replace` TEST from its own export: IRCA's
`updated_at` values are unchanged. Move TEST to `irca_test_c2`, and use the
portal as TEST's admin (reads and writes work), then as IRCA's (unaffected).

**Commits:** "Export one church's data on its own"; "Restore one church
without touching the others"; "Move a church to its own database"; "Offboard a
church and delete its data after the grace period".

---

## 6.9 — Monitoring and alerts

| Watch | How | Alert to |
| --- | --- | --- |
| API `/health` every minute | an uptime monitor (UptimeRobot or Better Stack) | owner's phone/email |
| Portal and registration home pages | same | same |
| 5xx rate > 2% over 10 minutes | Sentry alert or a job reading `usage_daily` | owner |
| An email reaching `FAILED` | a job every 15 minutes, which emails the dev (through the outbox itself, with a second provider or plain SMTP as fallback) | owner |
| A job failing twice in a row (for any one church in a per-church job) | `job_runs` check in the same job | owner |
| **Per church:** 5xx rate over 5% for 15 min, a church throttled more than 50 times in an hour, its email failures, its database share up more than 10 points in a week | a job reading `usage_daily` per church (`multi-tenancy.md`, section 12) | owner, naming the church |
| Database above 80% of the plan's storage | the nightly snapshot compares `db.size_bytes` to a configured limit | owner |

Logs are shipped to one log provider (e.g. Better Stack or Axiom) with
`churchCode` indexed. The dev console's church page links to the log search
pre-filtered to that church. Churches never see logs.

**Commit:** "Alert when the system, or any one church, is down, failing,
throttled, or filling up".

---

## 6.10 — Runbooks

Write each as a short page in `docs/runbooks/`, with exact commands:

- `restore.md`: restore from Neon history and from the nightly dump.
- `locked-out-admin.md`: the only admin lost access →
  `cli user:send-reset --email …` (a dev command that enqueues a reset
  email), or as a last resort `cli role:grant --church IRCA --email … --role admin.administrator`
  (audited as done by the dev).
- `revoke-access-now.md`: disable a person from the portal. If they are a
  dev, or the portal is unavailable: `cli sessions:revoke --email …`.
- `rotate-registration-key.md`: create the new key → set it in Vercel →
  redeploy → revoke the old one.
- `suspend-church.md`.
- `cutover-registration.md`: 5.18, kept for reference.
- `add-a-module.md`: link to `docs/adding-a-module.md`.

**Commit:** "Write the runbooks for the things that go wrong".

---

## 6.11 — Launch and training

1. Two one-page guides (in the portal under **Help**, and as PDFs to hand out):
   - *Getting started*: accepting your invitation, signing in, forgetting your
     password, what the sidebar shows you, and what "Viewing as" means if an
     admin mentions it.
   - *Finance in five minutes*: recording an expense (the suggest-or-create
     field), recording a stack of receipts with "Record another", reading an
     entry number, voiding a mistake, and printing the monthly statement.
2. A 30-minute session with the pastors on Applications and Discipleship,
   using the staging copy.
3. Launch order: admins → the Membership portal (pastors and office) → the
   registration cutover (5.18) → Finance (after a week on staging with the
   finance team entering real receipts in parallel with their current book).
4. For the first month, look at the dev console every Monday: errors, emails
   failed, sign-in failures, and any church growing unexpectedly.

---

## 6.12 — Starting the next department

The owner does not yet know what Media, Outreach, Comms or Programs need.
**Do not build a module from guesses.** Before writing a manifest, spend an
hour with that department and fill in `docs/modules/<key>-brief.md`:

1. Who is in the department, and who leads it? (These become the roles.)
2. What do they do every week that involves a list, a record or a number?
   (These become the pages.)
3. What would they look up? What would they change? Who must approve what?
   (This splits the permissions into read and write, and finds `decide`-style
   permissions.)
4. What do they need from other portals? (For example, the 17 Sept notes say
   Comms needs names, gender and phone numbers from Membership, finance
   balances to remind people of pledges, and "who gave in week X". Each of
   those is an explicit cross-module read permission, such as
   `membership.people.read` granted to a Comms role, **never** a copy of the
   data.)
5. What must they never see? (For example, Comms must not see prayer requests.
   This is already true, since that is `membership.people.read_sensitive`.)
6. What goes out of the system (SMS through Beem, emails, printed lists), and
   who pays for it? (This adds usage metrics such as `sms.sent` and its cost.)

Then follow `docs/adding-a-module.md`. The first slice of any new module
should be a single read-only list page plus its permission matrix test. That
gets the department something to react to within days, and proves the RBAC
wiring before any writes exist.

**Example: the Comms module brief, drafted from the 17 Sept notes (confirm with the department):**

| Need from the notes | Likely permission | Depends on |
| --- | --- | --- |
| Send messages via Beem: welcome to Bible study, thanks for giving, pledge reminders | `comms.messages.send` (write) | a Beem account, `sms.sent` metric |
| See names, gender and phone numbers | `membership.people.read` (granted to the Comms role) | Membership |
| See what a person still owes on a pledge | `finance.pledges.read` | the Finance pledges iteration (00-decisions Q8) |
| Filter who gave in a given week | `finance.transactions.read` scoped to a "givers" view | Finance per-person income (Q8) |
| See visitors and approved members to welcome them | `membership.people.read` + `membership.applications.read` | Membership |

---

## 6.13 — Phase check (launch)

- [ ] The dev console shows every metric in 6.1 for IRCA with at least 7 days of history.
- [ ] Hardening checklist complete, with evidence.
- [ ] The load test passed on staging.
- [ ] A restore drill was done and written down, including restoring one church on its own.
- [ ] Monitors and alerts were triggered on purpose once, and arrived.
- [ ] Runbooks exist and a second person has read them.
- [ ] Production has: a dev account, IRCA with its first admin, Membership on, and the registration cut over.
- [ ] Finance launched after the parallel-run week.

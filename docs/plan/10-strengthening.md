# Phase 10 — Strengthening

> **In one sentence:** make what has been built survive real use — fast
> enough on a busy Sunday, backed up and proven restorable, and watched, so a
> failure is noticed before a person reports it.

## This phase does not begin until the owner says so

Before starting **any** step here, ask the owner plainly:

> *"Shall I start strengthening the project?"*

and wait for a yes. Do not begin because a feature phase finished, because a
step looks small, or because something here would have prevented a problem
you just saw. The owner decided on 23 September 2026 that the feature work
comes first and that this phase is theirs to open (`README.md` §3.4a).

**Status:** **built** (25 September 2026), the day the owner said yes ("Do
phase 10"). Everything that can be built and proved on a development machine
is: the scripts, the migration, the backup job, the alerts, and the runbooks,
each checked locally. What only the owner can do is listed in 10.5: the runs on
staging, the real keys and bucket, the uptime monitor, and the restore drill
with real data. **Comes after:** Phases 7, 8 and 9, and the owner's yes.

---

## Before you start

**1. What must already be true.**

- The system is deployed (`docs/deployment.md`), with a staging copy on a Neon
  branch. Every step here is tried on **staging**, never first on production.
- The owner has said yes (above).

**2. Read these first:**

| Read | Why |
| --- | --- |
| `00-decisions.md`, D27 | One church, one database. Earlier versions of this phase moved churches between databases; that is gone. |
| `docs/deployment.md` | Where everything runs, and the database roles. |
| `docs/runbooks/restore.md` | The restore procedure this phase adds to. |
| `docs/hardening.md` | What is already checked, so you don't redo it. |

**3. Tools you will install** (each step says when): `k6` for load tests
(<https://k6.io>), `age` for encrypting backups (<https://age-encryption.org>),
`pg_dump` and `pg_restore` matching the production Postgres version.

**4. The loop for every step** is the same as every phase (`README.md` §2),
with one addition: anything you change on staging or production, write down
in the step's runbook with the date.

---

## What you are building, in plain words

Nothing a church member will see. Four kinds of insurance:

1. **Speed under load** — the registration form stays quick when two hundred
   visitors fill it in on a Sunday morning.
2. **Backups you have actually restored** — a backup never restored is a hope,
   not a backup.
3. **(Removed)** — moving one church between databases. See 10.3.
4. **Alarms** — the owner's phone buzzes when the site is down, messages are
   failing, or the SMS credit is running out.

## The steps at a glance

| Step | What | You are done when |
| --- | --- | --- |
| 10.1 | Performance and load | The Sunday load test passes on staging. |
| 10.2 | Backups and the restore drill | A backup was restored into a scratch copy and checked, and it is written down. |
| 10.3 | *Removed by D27* | — |
| 10.4 | Monitoring and alerts | Every alert was triggered on purpose once, and arrived. |
| 10.5 | Phase check | Every box ticked. |

---

## 10.1 — Performance and load

**Goal.** The busy pages and the Sunday form stay fast with ten times today's
data and a Sunday's crowd.

**Do.**

1. **More data to test with.** Add a `--scale <n>` option to
   `apps/api/prisma/demo.ts` that multiplies the people, registrations and
   finance entries it writes. On a **local** database:
   `npm run db:reset && npm run db:seed && npm run db:demo -w @irca/api -- --scale 10`.
2. **Find the slow queries.** For the default query of each list page —
   Members, People (Admin), Transactions, Activity, Applications, and Outreach
   Reached — run it with `explain analyze` in `psql`. Copy the query from the
   service file, or turn on `LOG_LEVEL=debug` to see it. A `Seq Scan` on a big
   table means a missing index: add it in a migration, with a comment naming
   the page that needs it.
3. **A Sunday, simulated.** Write `load/registration.js` for `k6`: 200 visitors
   over 10 minutes, each starting a registration, saving each step, and
   submitting. Run it against **staging** only:
   `k6 run -e BASE_URL=https://<staging registration> load/registration.js`.
   Target: 95% of step saves under 400 ms, and no errors.
4. **Numbers under load.** 20 clerks recording 20 expenses each at the same
   time on staging must produce 400 consecutive entry numbers with no gaps and
   no repeats (the Phase 4 test, on real infrastructure).
5. **Connections.** The API reaches Neon through its **pooled** host with a
   pool of five per role (`prisma-clients.ts`). If Prisma reports
   prepared-statement errors through the pooler, add `pgbouncer=true` to the
   two pooled URLs — check Neon's and Prisma's current documentation first.
6. **More than one API instance** needs the rate-limit counters out of memory
   (`core/limits/rate-limit.guard.ts` says so). Only do this if load shows one
   instance is not enough; otherwise write down that one was enough, and at
   what load.

**Check.** The `k6` summary meets the target; the list pages' `explain analyze`
shows index scans; the numbering run has 400 consecutive numbers.

**Commit.** "Index the list pages for ten times today's data"; "Add a load test
for Sunday registrations".

**As built.**

- **No index was needed.** With `db:demo --scale 10` (12,549 people, 7,917
  registrations, 6,194 finance entries, 6,020 people reached; Outreach was
  added to the demo for this), every list page's default query and every name
  search, captured from the running API, took under 10 ms. The sequential
  scans left are whole-table counts and facets, where a scan is the right
  plan, and `like '%…%'` searches across several columns, which only four
  trigram indexes on `people` would help, at a cost to every registration
  step, which writes to `people`. Revisit at ten times *that*.
- **What was slow was the job log.** `job_runs` gains about five million rows
  a year (the outboxes run every fifteen seconds) and nothing pruned it. The
  Health page's `distinct on (job)` took 3.5 s over a year of runs and would
  have passed the 10 s statement limit in about three. It now steps through
  the index one job at a time (0.3 ms over the same rows), and the nightly
  snapshot forgets successful runs after 30 days and failures after 180.
- **The load test found a dropped request.** One autosave in 3,596 was lost
  to a reset connection: Node closed idle keep-alive connections after about
  five seconds, and a client that does not honour the Keep-Alive header, as
  proxies do, could send on one as it closed. Reproduced with a raw socket at
  six seconds' idle, fixed by keeping connections 65 s (longer than proxies
  keep theirs), and the probe then passed.
- `load/registration.js` calls the API as the registration form does after
  its cutover (the form's server is a thin forwarder), with each visitor's
  own address, since the limits are per visitor. `load/numbering.js` adds the
  numbering run; `load/README.md` has how to run both, the SQL that checks the
  numbers, how to put staging back, and the results.
- **Connections (point 5).** The Railway deployment has no pooler in front of
  Postgres (`docs/deploy-railway.md` §2.3), so there is nothing to set.
  `pgbouncer=true` matters only if the database is ever on Neon's pooled host.
- **One instance (point 6)** was nowhere near busy at a Sunday's load, and
  cannot be two anyway while the API holds the files volume (D24).

---

## 10.2 — Backups and the restore drill

**Goal.** The church can lose its database and get it back, and someone has
proven it.

**Do.**

1. **Neon's own history.** Look up the restore window on the current Neon plan
   and write it in `docs/deployment.md` and `docs/runbooks/restore.md`.
2. **Give the backup role something to read.** Since D27, no migration grants
   `irca_backup` anything, so a dump as that role fails today. Add a migration:

   ```sql
   grant usage on schema public to irca_backup;
   grant select on all tables in schema public to irca_backup;
   alter default privileges for role irca_owner in schema public
     grant select on tables to irca_backup;
   -- A restore must know which migrations the dump contains.
   do $$ begin
     if to_regclass('public._prisma_migrations') is not null then
       grant select on table _prisma_migrations to irca_backup;
     end if;
   end $$;
   ```

   The backup role reads everything, including the activity log and the
   view-as log: that is what a backup is. It can write nothing.
3. **A nightly dump, encrypted, kept off Neon.** A scheduled GitHub Action
   (`.github/workflows/backup.yml`, `on: schedule`) that:
   - runs `pg_dump --format=custom` as `irca_backup` against the direct host
     (its URL is a GitHub secret, never in the repository);
   - encrypts the file with `age`, to a public key committed in
     `ops/backup.pub` (the private key is held offline by the owner and one
     pastor, never on a server);
   - keeps it off Railway, since the files volume is on the same platform
     as the database (where, and for how long, is decided in this step), for
     30 days. The files volume needs a backup of its own: Railway's volume
     backups, or a copy of `FILES_DIR` alongside the dump.
4. **The restore drill** — before launch, then every three months:
   1. download last night's dump and decrypt it with the private key;
   2. restore it into a **new Neon branch** (never `main`) with `pg_restore`;
   3. point a local API at that branch, sign in, and check that yesterday's
      finance entries and registrations are there;
   4. write the date, who did it, and how long it took in
      `docs/runbooks/restore.md`, then delete the branch.

**Check.** The Action has run on its schedule at least once; the drill is
written down with a date; a second person has read `restore.md`.

**Commit.** "Let the backup role read the database"; "Back up the database
nightly, encrypted, and write down how to restore it".

**As built.**

- **A cron service beside the database, not a GitHub Action.** The
  repository is public, so workflow artifacts could be downloaded by anyone
  signed in to GitHub, and an Action would need the database reachable from
  the internet, which the Railway guide switches off. `ops/backup/` is a small
  container (PostgreSQL 18's client, `age`, `curl`) that Railway runs once a
  night on a cron schedule over the private network. It dumps as
  `irca_backup`, checks `pg_restore` can list the dump, encrypts it to every
  key in `ops/backup/recipients.txt`, and uploads it with a signed `curl` to
  any S3-compatible bucket off Railway (Cloudflare R2 suggested), whose
  lifecycle rule keeps 30 nights. It refuses to run until a key is committed.
  `docs/deploy-railway.md` §9 sets it up.
- **Two keys, not one shared.** The owner and a pastor each make their own
  pair; either opens any backup. `age` encrypts to both at once.
- **Files.** The cron service cannot reach the API's volume, so the files
  are covered by Railway's volume backups (Daily, Weekly), which live on
  Railway. They are session reports, which the office also holds; if that is
  not enough, the next step is the API copying them to the same bucket.
- **Neon's window (point 1)** is not written down: the deployment is on
  Railway, whose backup schedules (daily kept 6 days, weekly 27, monthly 89)
  are in the Railway guide. The restore runbook covers both hosts.
- **Proved locally, not yet for real.** A scratch copy at ten times today's
  data was backed up through a local S3 stand-in, downloaded, decrypted with
  the second key, restored into an empty database, and compared (rows,
  grants, triggers, migration state), in about a minute. A wrong bucket
  secret and a missing key both fail loudly. The real drill is the owner's.

---

## 10.3 — Removed by D27

This step used to export, restore, move and delete **one church** inside a
database shared by many. Since D27 there is one church per deployment, so
there is nothing to separate: backing up the church *is* backing up the
database (10.2), and restoring one church *is* the restore drill.

If the church ever wants all its data handed over, or a deployment shut down,
that is the 10.2 dump plus the files volume (`FILES_DIR`), handed over encrypted.
Write a runbook for it only if it is asked for.

The step number is kept so references to 10.4 stay correct.

---

## 10.4 — Monitoring and alerts

**Goal.** The owner hears about a problem from an alert, not from a pastor on
Sunday.

**Do.** Set up each row, then trigger it on purpose once.

| Watch | How | Alert to |
| --- | --- | --- |
| API `/health` every minute | an uptime monitor (UptimeRobot or Better Stack, free tier) | owner's phone and email |
| Portal and registration home pages | the same monitor | same |
| More than 2% of requests failing over 10 minutes | a job reading `usage_daily` (`api.requests`, `api.errors.5xx`) every 10 minutes | owner |
| An email given up on (`FAILED`) | a job every 15 minutes; it alerts by the outbox itself, with plain SMTP as a fallback in case email is what is broken | owner |
| Any job failing twice in a row | the same job, reading `job_runs` | owner |
| SMS credit below a floor | the hourly balance read from Phase 7 (`sms.balance`), against a setting `comms.balanceAlertFloor` | owner and the Communications lead |
| SMS failing: more than 10% of a day's messages `FAILED` | a job reading `comms_recipients` | owner and the Communications lead |
| Database over 80% of the plan's storage | the nightly snapshot compares `db.size_bytes` to a setting | owner |

Put the alerting jobs in `apps/api/src/core/jobs/scheduled-jobs.service.ts`,
through `JobRunner`, and send the alerts as ordinary emails through the email
outbox (plus SMS through Phase 7 for the credit alarm). Settings for the
thresholds go in the `settings` table with defaults in code, like Membership's.

**Logs.** Ship the API's log to one provider (Better Stack or Axiom) so they
survive a restart; the dev console's Logs page keeps only the last few
thousand lines in memory. Add the provider to `docs/deployment.md`.

**Check.** Stop the staging API: the uptime alert arrives. Make a staging
email fail on purpose: the alert arrives. Set the credit floor above the
current balance: the alert arrives. Write each in the PR with its time.

**Commit.** "Alert when the system is down, failing, or running out of credit";
"Keep the server log where a restart cannot lose it".

**As built.**

- **One job, every ten minutes** (`alerts`, in core), checks failing
  requests, emails given up on, jobs failing twice and storage; Comms checks
  its own (`sms-alerts` every ten minutes, and the credit after each hourly
  reading). An `alerts` table remembers what has been said, so each alert is
  sent when it starts, again at most every twelve hours while it lasts, and
  once when it clears.
- **Failing requests** are measured from the day's counters between two
  checks, and judged only with at least fifty requests in the window. After a
  restart the first check only takes a reading.
- **Who hears** is worked out by permission, not role: everyone active who
  may read the Health page (the Developer and Watcher roles), and for credit
  and failing texts also whoever runs Comms → Settings. Dev → Settings →
  Alerts lists them, with the phone each text would go to, and sends a test
  alert on purpose.
- **The fallback when email is broken is a text, not SMTP.** SMTP would need
  a second email account, and would probably fail for the same reason.
  Emails given up on, and low credit, are also texted to each recipient's
  phone, straight to Beem: a message to the staff, not from the church, so it
  is not in Comms' history or counted against the daily limit.
- **Thresholds** are in `settings` with the plan's defaults in code. The
  credit floor is in Comms → Settings (500 to start, 0 for never). The
  database's storage size has no default, since the system cannot ask the
  host, so that alarm waits until it is set in Dev → Settings.
- **The server log** is not shipped to a provider. Railway keeps each
  service's log across restarts and redeploys (7 days on Hobby, 30 on Pro),
  which is what the plan asked for, without sending request logs, with their
  addresses and user ids, to another company. If the church needs more than
  that, a log forwarder can be added then (`docs/deploy-railway.md` §6).
- **Down** is left to the uptime monitor, as planned: the owner sets it up.

---

## 10.5 — Phase check

- [x] The owner said yes before this phase began (25 Sept 2026).
- [ ] The load test passed on staging, and the result is written down.
  *Passed on a development machine (`load/README.md`); staging is the owner's.*
- [ ] The backup role can read the database, and the nightly dump runs.
  *The role reads everything (migration `backup_read`); the job ran locally.
  The keys, the bucket and the Railway service are the owner's.*
- [ ] A restore drill was done and written down, with a date.
  *Proved locally and written down as such; the real drill is the owner's.*
- [ ] Every alert in 10.4 was triggered on purpose once, and arrived.
  *Each is triggered in `test/alerts.e2e-spec.ts`. On staging: the uptime
  monitor (stop the API), a test alert from Dev → Settings, and the credit
  floor set above the credit.*
- [ ] `docs/deployment.md` and `docs/runbooks/restore.md` are updated, and a second person has read them.
  *Updated; the second reader is the owner's to find.*

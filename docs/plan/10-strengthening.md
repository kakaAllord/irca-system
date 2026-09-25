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

**Status:** not started. **Comes after:** Phases 7, 8 and 9 — and the owner's
yes.

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
   - uploads it to the object storage from Phase 8 (a separate bucket or
     prefix, `backups/`) and keeps 30 days.
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

---

## 10.3 — Removed by D27

This step used to export, restore, move and delete **one church** inside a
database shared by many. Since D27 there is one church per deployment, so
there is nothing to separate: backing up the church *is* backing up the
database (10.2), and restoring one church *is* the restore drill.

If the church ever wants all its data handed over, or a deployment shut down,
that is the 10.2 dump plus the object storage bucket, handed over encrypted.
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

---

## 10.5 — Phase check

- [ ] The owner said yes before this phase began.
- [ ] The load test passed on staging, and the result is written down.
- [ ] The backup role can read the database, and the nightly dump runs.
- [ ] A restore drill was done and written down, with a date.
- [ ] Every alert in 10.4 was triggered on purpose once, and arrived.
- [ ] `docs/deployment.md` and `docs/runbooks/restore.md` are updated, and a second person has read them.

# Phase 10 — Strengthening

**This phase does not begin until the owner says so.**

> Before starting any step here, ask the owner plainly: *"Shall I start
> strengthening the project?"* Wait for a yes. Do not begin because a feature
> phase finished, because a step looks small, or because something in it would
> have prevented a problem. The owner decided on 23 September 2026 that all
> the feature work comes first and that this phase is theirs to open.

**Goal of the phase.** Make what has been built survive real use: fast enough
under Sunday load, backed up and proven restorable, movable church by church,
and watched so a failure is noticed before a person reports it.

Everything here was originally written as part of Phase 6. It was moved out
because none of it is needed to *build* a feature, and mixing it into the
build order meant the features kept waiting behind infrastructure. The work
itself is unchanged.

**When it happens.** After Phases 7 (Communications), 8 (Outreach) and 9
(Pledges) are done — and after the owner has confirmed.

| Step | What | Was |
| --- | --- | --- |
| 10.1 | Performance and load | 6.6 |
| 10.2 | Backups and restore drill | 6.8 |
| 10.3 | Per-church export, restore, move and offboarding | 6.8a |
| 10.4 | Monitoring and alerts | 6.9 |
| 10.5 | Phase check | part of 6.5 and 6.13 |

---

## 10.1 — Performance and load

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

---

## 10.2 — Backups and restore drill

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

---

## 10.3 — Per-church export, restore, move and offboarding

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

---

## 10.4 — Monitoring and alerts

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

---

## 10.5 — Phase check

These were Phase 6's, and moved here with the work that satisfies them.

- [ ] The load test passed on staging.
- [ ] A restore drill was done and written down, including restoring one church on its own.
- [ ] Monitors and alerts were triggered on purpose once, and arrived.
- [ ] A per-church export and `--replace` import was run on staging without touching the other church.
- [ ] `church:move` was run end to end against a second database.
- [ ] Rate-limit fairness and per-church quotas behave as specified.
- [ ] `docs/runbooks/restore.md` and `restore-one-church.md` exist and a second person has read them.

# Deploying to Railway

A step-by-step guide to running the IRCA system on [Railway](https://railway.com):
the database, the API and the portal in one Railway project, and the
registration form kept where it is until its cutover.

`docs/deployment.md` is the general deployment document: what each app
needs, whatever the host. This page is the Railway version of it, with
Railway's own settings. Where the two differ, this page says why.

> **Check Railway's side as you go.** The names of Railway's settings and
> commands below were right when this was written (25 Sept 2026), but they
> are Railway's and they change. If a setting has moved, the value it needs
> has not: the table in each step is what matters.

---

## 0. What you will end up with

```
                   Railway project "irca" (environment: production)
  ┌──────────────────────────────────────────────────────────────────────┐
  │                                                                      │
  │   portal  ── https://portal.<domain> ── the browser talks only here  │
  │     │  /api/* rewritten, and server pages call the API directly,     │
  │     │  over Railway's private network                                │
  │     ▼                                                                │
  │   api  ──── https://api.<domain> ─ public only for /health and Beem  │
  │     │                                                                │
  │     ▼  private network, three roles                                  │
  │   Postgres  (private; its public proxy only while you work on it)    │
  │                                                                      │
  └──────────────────────────────────────────────────────────────────────┘

  registration form ── stays on Vercel, calling https://api.<domain>
                       after its cutover (docs/runbooks/cutover-registration.md)
```

| Service | What it is | Replicas |
| --- | --- | --- |
| `Postgres` | Railway's PostgreSQL | 1 |
| `api` | `apps/api`, NestJS | **exactly 1** (see §3) |
| `portal` | `apps/portal`, Next.js | 1 |
| `backup` | `ops/backup`, a nightly cron job (§9) | runs once a night, then stops |

**Why the registration form stays on Vercel for now:** visitors use it every
Sunday, and it moves only at its written cutover. Moving its host at the same
time would be two changes at once on the one page the public sees. Section 7
covers moving it later, if you want everything in one place.

**What it costs:** Railway charges for what the services use, on top of a
monthly plan. Three small services and a small database are modest, but check
Railway's pricing page for the current figures before you commit, and set a
usage limit in the project's settings so a mistake cannot run up a bill.

---

## 1. Before you start

- A Railway account, on a paid plan. The free trial pauses services, and a
  church cannot have its portal paused on a Sunday.
- The Railway CLI on your own machine (`npm i -g @railway/cli`, then
  `railway login`). You need it once, for the first-deploy commands in §5.
- The GitHub repository connected to Railway (Railway asks for access the
  first time you create a service from a repo). Deploy from the `main`
  branch: `dev-allord` reaches `main` through a pull request whose CI passed.
- A domain the church controls, for `api.<domain>` and `portal.<domain>`.
  Railway's own `*.up.railway.app` addresses work for a trial run, but the
  portal's session cookie and the email records belong on the church's
  domain.
- A password manager. You will generate six secrets below, and they live
  there and in Railway's variables, nowhere else.

---

## 2. The database

### 2.1 Create it

In the project: **New → Database → PostgreSQL**. Keep Railway's name for it,
`Postgres`, because the variables below refer to it by that name.

**Check the Postgres version** in the service's settings or with
`select version();`. The system is developed and tested on **PostgreSQL 18**
(CI runs 18). It has no known dependency on 18 — the migrations avoid
18-only functions on purpose — but if Railway offers a choice, take 18, and
at least 16.

**Keep it off the internet once it is set up.** The API reaches it over
Railway's private network and needs nothing else. Railway's Postgres comes
with a public TCP proxy, which `railway connect` (§2.2) uses; once §2.2 is
done, remove the proxy in the `Postgres` service's **Settings → Networking**,
and add it back only for the minutes you need a shell.

### 2.2 Create the database and its four roles

Railway's Postgres comes with a superuser, `postgres`. The running system
must never use it: the system's safety rules — the activity log cannot be
rewritten, finance entries cannot be deleted, viewing as someone cannot
write — are grants on **ordinary** roles, and a superuser ignores grants.

Open a shell on it from your machine, inside the project folder:

```bash
railway link            # choose the irca project and the production environment
railway connect Postgres
```

That opens `psql` as `postgres`. Run the three blocks below in order, each
as its own paste. `create database` cannot run inside a transaction, and
Railway's web **Data → Query** tab and most GUI clients wrap a multi-statement
paste in one, so it has to go on its own; in plain `psql` the split costs
nothing.

First the roles, with four passwords you have just generated (at least 32
characters each, letters and digits only, so they need no escaping in a URL):

```sql
create role irca_owner    login password '<owner password>' createdb;
create role irca_app      login password '<app password>';
create role irca_readonly login password '<readonly password>';
create role irca_backup   login password '<backup password>';
```

Then the database, alone:

```sql
create database irca owner irca_owner;
```

Then the role settings and the check:

```sql
alter role irca_app      set statement_timeout = '10s';
alter role irca_readonly set statement_timeout = '10s';
alter role irca_owner    set timezone = 'UTC';
alter role irca_app      set timezone = 'UTC';
alter role irca_readonly set timezone = 'UTC';
alter role irca_backup   set timezone = 'UTC';

-- None of the runtime roles may step around the grants. All must say f, f.
select rolname, rolsuper, rolbypassrls from pg_roles where rolname like 'irca_%';
```

Keep the output of that last query for `docs/hardening.md`.

Why a separate database `irca`, not Railway's default one: the owner role
owns it outright, which is what the migrations expect, and `postgres`'s own
database stays Railway's.

`irca_backup` is for the nightly backup (§9). A migration gives it read
access to every table and nothing else, so it must exist before the first
deploy, like the others.

**Optional, for Dev → Health's slowest-queries table:** while still
connected, `\c irca` and run
`create extension if not exists pg_stat_statements; grant pg_read_all_stats to irca_app;`.
If Railway's Postgres was not started with that extension loaded, this
fails harmlessly and the page says query statistics are off. Nothing else
depends on it.

### 2.3 The three connection strings

The API uses three roles, each with its own URL. On Railway they go over the
private network, using the database service's private host name, which you
refer to with a Railway **reference variable** rather than typing it:

| Variable (on the `api` service) | Value |
| --- | --- |
| `DATABASE_URL` | `postgresql://irca_app:<app password>@${{Postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/irca` |
| `DATABASE_URL_READONLY` | `postgresql://irca_readonly:<readonly password>@${{Postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/irca` |
| `DIRECT_DATABASE_URL` | `postgresql://irca_owner:<owner password>@${{Postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/irca` |

**How this differs from Neon** (`docs/deployment.md` §2): there, the URLs end
in `?sslmode=verify-full`, because they cross the public internet to Neon.
Here the traffic never leaves Railway's private network, which is encrypted
between services, and Railway's Postgres certificate is not one a client
can verify by name. So there is no `sslmode`. **Never** point these URLs at
the database's public address without TLS; if you ever need to reach it from
outside, use `railway connect`, as in §2.2, which goes over TLS through the
proxy.

There is no separate pooled URL: Railway's Postgres has no pooler in front of
it, and the API opens at most five connections per role, which a small
database handles comfortably.

### 2.4 Backups

Two copies, for two different disasters:

- **Railway's own.** In the `Postgres` service's **Backups** tab, turn on
  **Daily** (kept 6 days) and **Weekly** (kept 27 days). These restore in a
  few clicks, but they live on Railway, so they do not help if the account
  or the platform is what is lost.
- **The church's own, off Railway:** the nightly encrypted dump of §9. Set it
  up once the database has its data.

---

## 3. The API

### 3.1 Create the service

**New → GitHub Repo →** `kakaAllord/irca-system`. Rename the service `api`
(the portal refers to it by this name).

Leave **Root Directory empty**: the API is built from the repository root,
because it depends on `packages/shared`, which npm workspaces link from the
root.

### 3.2 Settings

| Setting (service → Settings) | Value |
| --- | --- |
| Source branch | `main` |
| Root Directory | *(empty — the repository root)* |
| Builder | Railpack (Railway's default). It reads the Node version from `engines` in the root `package.json` (24). |
| Custom Build Command | `npm run build -w @irca/shared && npm run build -w @irca/api` |
| Pre-deploy Command | `npm run db:deploy -w @irca/api` |
| Custom Start Command | `node apps/api/dist/main.js` |
| Healthcheck Path | `/health` |
| Replicas | **1** |
| Watch Paths | `apps/api/**`, `packages/shared/**`, `package-lock.json` |
| Restart policy | On failure |

Why each one matters:

- **Build.** The builder installs dependencies itself (`npm ci`). The API's
  build generates the Prisma client first; that step reads only the schema
  and needs no database, so it runs at build time without one.
- **Pre-deploy** runs the migrations once per deploy, as `irca_owner`,
  before the new version takes traffic. A migration that fails stops the
  deploy and leaves the running version untouched, rather than breaking the
  site. It needs the private network, which the pre-deploy step has.
- **Health check.** `/health` sits outside `/v1`, is never rate-limited, and
  answers only once the database answers, so Railway switches traffic to a
  new deploy only when it can actually serve.
- **One replica, not two.** The sign-in rate limits are counted in memory,
  and the background jobs (the email outbox, the SMS sender, the nightly
  snapshot) are safe to run twice but pointless. Scaling out needs the
  counters moved first (Phase 10).
- **Watch paths** stop a change to the portal alone from redeploying the API.

### 3.3 Variables

In the `api` service's **Variables** tab. Everything in `apps/api/.env.example`
applies; these are the production values:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | `4000` |
| `DATABASE_URL`, `DATABASE_URL_READONLY`, `DIRECT_DATABASE_URL` | from §2.3 |
| `PORTAL_ORIGIN` | `https://portal.<domain>` |
| `REGISTRATION_ORIGIN` | `https://<the registration form's domain>` |
| `SESSION_COOKIE_NAME` | `__Host-irca_session` — the API refuses to start in production without the `__Host-` prefix |
| `SESSION_ABSOLUTE_HOURS` | `168` |
| `SESSION_IDLE_HOURS` | `12` |
| `TRUST_PROXY` | `2` to start with; check it after the first deploy (§6) |
| `LOG_LEVEL` | `info` |
| `EMAIL_PROVIDER` | `resend` (or `log` until Resend is set up: emails are then only printed in the API's logs) |
| `EMAIL_FROM` | `IRCA <no-reply@<domain>>` |
| `RESEND_API_KEY` | from Resend (`docs/deployment.md` §6) |
| `BEEM_SETTINGS_KEY` | 32 random bytes, base64: `openssl rand -base64 32`. **Make it once and keep it** — a new one makes the saved Beem account unreadable until Communications saves it again |
| `BEEM_INBOUND_SECRET` | `openssl rand -hex 24`. The password in the reply URL given to Beem |
| `FILES_DIR` | `/data/files`, on the volume of §8 (`docs/deployment.md` §6b). Unset, uploads are refused and nothing else changes |

The Beem key and secret are **not** variables: Communications types them into
Comms → Settings in the portal (D26). `SMS_LIVE` is left unset in
production: production sends through Beem once an account is saved.

**For a staging environment**, never production's values: its own database,
`EMAIL_PROVIDER=log` until its recipients are team-only, and no Beem account
saved. Railway's **environments** (project → Environments → New) give you a
copy of these services with their own variables for exactly this.

### 3.4 Public address

**Settings → Networking → Custom Domain:** `api.<domain>`, port `4000`.
Railway shows a CNAME record; add it where the domain's DNS is held, and
wait for Railway to issue the certificate.

The portal does not use this address (it uses the private network), but two
things outside Railway do: the registration form after its cutover, and
Beem's reply callback (`docs/deployment.md` §6a).

---

## 4. The portal

### 4.1 Create the service

**New → GitHub Repo →** the same repository again. Rename it `portal`.

### 4.2 Settings

| Setting | Value |
| --- | --- |
| Source branch | `main` |
| Root Directory | *(empty — the repository root)* |
| Custom Build Command | `npm run build -w @irca/shared && npm run build -w @irca/portal` |
| Custom Start Command | `npm run start -w @irca/portal` |
| Healthcheck Path | `/login` |
| Replicas | 1 |
| Watch Paths | `apps/portal/**`, `packages/shared/**`, `package-lock.json` |

### 4.3 Variables

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | `3000` — the portal's start script listens on 3000, and Railway routes to the port in `PORT` |
| `API_INTERNAL_URL` | `http://${{api.RAILWAY_PRIVATE_DOMAIN}}:4000` |
| `SESSION_COOKIE_NAME` | `__Host-irca_session` — the same as the API's |

`API_INTERNAL_URL` is the API's **private** address, over plain `http`,
which is safe inside the private network. The portal uses it twice: its
server pages call the API directly, and it rewrites the browser's `/api/*`
to the API, which is why the session cookie is first-party and there is no
CORS to configure. **The rewrite is fixed at build time**, so changing
`API_INTERNAL_URL` needs a redeploy, not only a restart.

### 4.4 Public address

**Custom Domain:** `portal.<domain>`, port `3000`, with its CNAME as for the
API. The `__Host-` cookie works only over HTTPS on this exact host, which
Railway's certificate gives you.

---

## 5. The first deploy

### 5.1 The order

1. `Postgres`, with §2.2 done.
2. `api`, with its variables. Its first deploy runs every migration in the
   pre-deploy step. Watch its **Deploy Logs**: the last line should be the
   API listening, and `https://api.<domain>/health`
   should answer with `"status":"ok"` and `"db":"ok"` (a 503 means the
   database is not reachable).
3. `portal`, once the API is healthy.

### 5.2 The church, and the first account

A fresh database has no church and nobody who can sign in. Two commands put
them there, run **once**, on the API service itself (it is the only place
with the private network and the owner's URL):

```bash
railway ssh --service api
```

Then, in that shell:

```bash
node apps/api/dist/cli/main.js church:setup --code IRCA \
  --name "International Revival Church Arusha" \
  --timezone Africa/Dar_es_Salaam --currency TZS

node apps/api/dist/cli/main.js user:create-dev \
  --email <your email> --name "<your name>"
```

`church:setup` writes the church's one row of settings and refuses a second
time. `user:create-dev` asks for a password twice and gives the account the
Developer and Church administrator roles.

Do **not** run `npm run db:seed` or `db:demo` in production: they are for
development, with made-up people and known passwords.

### 5.3 In the portal

Sign in at `https://portal.<domain>` with that account, then:

1. **Admin → Departments:** create the departments that have portals —
   Membership, Finance, Communications, Outreach — and give each its portal.
   A portal cannot be switched on until a department has it (D28).
2. **Admin → Portals:** turn on Membership, and the others as each
   department is ready (Finance only when its week of parallel running
   starts, `06` step 6.11).
3. **Admin → People → Invite:** the senior pastor, with Church
   administrator, and the office, with their Membership roles. Invitation
   emails need §3.3's Resend variables; with `EMAIL_PROVIDER=log` the link is
   in the API's logs instead.
4. **Admin → Departments → a department → Name a leader** for each
   department, once its leaders are confirmed members.
5. **Dev → Settings → Registration form keys → New key**, for the form's
   cutover. The key is shown once; it goes straight into the form's
   variables (§7).

---

## 6. After every deploy

The checks in `docs/deployment.md` §8 apply as written:

- `https://api.<domain>/health` answers `"status":"ok"` and `"db":"ok"`.
- **Dev → Health:** the jobs table shows `usage-snapshot`, `db-sample`,
  `email-outbox`, `impersonation-expiry` and `session-cleanup`, none failed.
- Sign in, open one page in each portal, sign out.

**After the first deploy only, check `TRUST_PROXY`.** The API must see each
person's real address, or the sign-in rate limit would throttle everyone
together. A request reaches the API through Railway's edge and then the
portal, which is two hops, hence `2`. Confirm it: sign in, then from
`railway connect Postgres` (`\c irca`):

```sql
select ip, created_at from sessions order by created_at desc limit 1;
```

The address must be your own public one. If it is a private `10.x`/`fd..`
address, raise `TRUST_PROXY` by one and redeploy the API; if it looks right
but is a Railway address, lower it. Check again.

**Logs.** Each service's **Deploy Logs** hold what it printed. The API's
request log never contains request bodies, cookies or tokens, by design; the
dev console's **Dev → Logs** shows the recent part of it too.

---

## 7. The registration form

**Until its cutover, change nothing:** it keeps running on Vercel against its
own database, exactly as today.

**At the cutover** (`docs/runbooks/cutover-registration.md`), its Vercel
project gets:

```
REGISTRATION_BACKEND=api
API_INTERNAL_URL=https://api.<domain>
REGISTRATION_API_KEY=<the key from §5.3, step 5>
```

and is redeployed. It calls the API's **public** address, since Vercel is not
on Railway's private network. Rolling back is setting
`REGISTRATION_BACKEND=db` and redeploying.

**Moving it to Railway later** (optional, after the cutover has settled): a
fourth service from the same repository, with Build
`npm run build -w @irca/shared && npm run build -w @irca/registration`,
Start `npm run start -w @irca/registration`, Watch Paths
`apps/registration/**`, `packages/shared/**`, `package-lock.json`, the three
variables above (with `API_INTERNAL_URL` switched to
`http://${{api.RAILWAY_PRIVATE_DOMAIN}}:4000`), and the form's existing domain
moved over from Vercel last, once the Railway copy has been tried on its
`*.up.railway.app` address. Do it on a weekday, never the day before a
Sunday.

---

## 8. Files, for Outreach's session reports

Outreach's Saturday reports (Phase 8, step 8.9) are PDFs kept on a Railway
volume attached to the `api` service, so they survive every deploy: the
service's own disk does not. `api` service → **+ New → Volume**, mount path
`/data`, then `FILES_DIR=/data/files` in its variables. `docs/deployment.md`
§6b has the rest: what a volume costs (no replicas, a short stop on each
deploy) and backing it up. **Turn on the volume's backups** (the volume →
**Backups**, Daily and Weekly): the nightly dump of §9 holds the database,
not these files.

---

## 9. The nightly backup

Every night a small cron service dumps the database as `irca_backup` (which
can read everything and change nothing), encrypts the dump to the
keyholders' public keys, and puts it in a bucket that is **not on Railway**.
The job is `ops/backup/` in the repository; `docs/plan/10-strengthening.md`,
step 10.2, says why it is built this way. Restoring it is
`docs/runbooks/restore.md`.

### 9.1 The keys (once, by people, not servers)

The owner and one pastor each make a key pair on their own computer, with
[age](https://age-encryption.org):

```bash
age-keygen -o irca-backup-<name>.key
```

Each keeps their `.key` file **offline** (a USB stick in a safe place, and a
printed copy), and sends the `Public key: age1…` line it prints to be added
to `ops/backup/recipients.txt`, which is committed. Any one private key opens
any backup; nobody else, including Railway and whoever runs the bucket, can.
Until a key is in that file, the job refuses to run.

### 9.2 The bucket (off Railway)

Any S3-compatible storage works. Cloudflare R2 is the suggestion: its free
allowance (10 GB) holds years of these dumps, and it charges nothing to
download one.

1. Create a bucket, `irca-backups`, **private**.
2. Add a lifecycle rule that deletes objects **30 days** after they were
   made. The job never deletes anything itself, so this rule is what keeps
   the bucket from growing forever.
3. Create an API token that may **write objects to this bucket only**. It
   needs no read or delete: the job only adds files. Note its access key id
   and secret, and the bucket's S3 endpoint.

### 9.3 The service

**New → GitHub Repo →** the same repository. Rename it `backup`.

| Setting | Value |
| --- | --- |
| Source branch | `main` |
| Root Directory | `ops/backup` (Railway then builds its `Dockerfile`) |
| Cron Schedule | `30 0 * * *` — Railway's schedules are in UTC, so this is 03:30 in Arusha, after the API's nightly jobs |
| Watch Paths | `ops/backup/**` |
| Restart policy | Never (a cron run that fails is reported, not retried in a loop) |

| Variable | Value |
| --- | --- |
| `BACKUP_DATABASE_URL` | `postgresql://irca_backup:<backup password>@${{Postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/irca` |
| `BUCKET_URL` | the bucket's S3 address, such as `https://<account id>.r2.cloudflarestorage.com/irca-backups` |
| `BUCKET_REGION` | `auto` for R2; the bucket's region elsewhere |
| `BUCKET_ACCESS_KEY_ID`, `BUCKET_SECRET_ACCESS_KEY` | from 9.2, step 3 |
| `HEARTBEAT_URL` | optional: a heartbeat monitor's address (Better Stack or healthchecks.io, free), which alerts when a night passes with no backup |

The database stays private: the job reaches it over Railway's private
network, like the API.

### 9.4 Check it

Press **Run now** on the service (or wait for the night). Its log ends with
`Backed up <n> tables to irca-<date>.dump.age`, and the file is in the
bucket. Then, before launch and every three months, do the restore drill in
`docs/runbooks/restore.md`: a backup nobody has restored is a hope.

**If it fails:** `No public key` means 9.1 is not done; `403` from curl means
the bucket's token or address is wrong; `permission denied for table` means
the `backup_read` migration has not run (it runs with every API deploy).

---

## 10. When something goes wrong

| What you see | What it usually is |
| --- | --- |
| The API's deploy fails in **pre-deploy** | A migration failed. The running version is untouched. Read the log line; the usual cause is a role missing from §2.2, or `DIRECT_DATABASE_URL` pointing at the wrong database |
| The API crashes on start with a list of variables | The environment check found one missing or wrong, and names it. `SESSION_COOKIE_NAME` without `__Host-` is the common one |
| `/health` says `db` is not ok | The private host name or a password in §2.3 is wrong, or the Postgres service is down |
| The portal shows its error page on every page | `API_INTERNAL_URL` is wrong, or the API is down. Remember it is fixed at build time: redeploy after changing it |
| Signed in, then immediately signed out | `SESSION_COOKIE_NAME` differs between `api` and `portal`, or the portal is being opened over `http` or on a different host than its domain |
| Everyone is "too many attempts" at once | `TRUST_PROXY` is too low: every sign-in looks like it comes from Railway. §6 |
| Invitations never arrive | `EMAIL_PROVIDER` is still `log`, or the Resend domain is not verified. **Dev → Usage → Email** shows each failure's reason |

The runbooks in `docs/runbooks/` (locked-out admin, revoking access, restoring
the database, rotating the registration key) apply unchanged: where they say
"on the API host's shell", that is `railway ssh --service api`.

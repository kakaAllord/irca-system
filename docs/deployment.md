# Deploying the IRCA system

How each app is built, where it runs, what it needs, and the order to bring a
fresh environment up in. The runbooks in `docs/runbooks/` cover what to do when
something goes wrong after that.

**Deploying to Railway?** `docs/deploy-railway.md` is this page with
Railway's own settings, step by step, database and portal included.

One deployment serves one church (D27). A second church would get a second copy
of everything below — its own database, its own apps, its own domain — never a
row in this one.

**Still to decide: the domain.** Everything below is written with `<domain>`.
The recommendation is subdomains of one domain the church already controls
(`api.<domain>`, `portal.<domain>`), so the email records, the certificates and
the renewals all live in one place, and the registration form keeps the domain
it has today.

---

## 1. The three environments

|                  | Local                         | Staging                          | Production                        |
| ---------------- | ----------------------------- | -------------------------------- | --------------------------------- |
| Database         | local Postgres `irca_dev`     | Neon branch `staging`            | Neon branch `main`                |
| API              | `localhost:4000`              | `api-staging.<domain>`           | `api.<domain>`                    |
| Portal           | `localhost:3000`              | Vercel, staging domain           | `portal.<domain>`                 |
| Registration     | `localhost:3001`              | Vercel preview                   | the existing production domain    |
| Email            | `log` (printed by the API)    | Resend, to team addresses only   | Resend                            |
| Data             | `db:seed` (+ `db:demo`)       | a copy of production             | IRCA                              |

Staging is a Neon branch of production, so it starts as a real copy and can be
reset from it. Never point staging's email at real members: until its
`EMAIL_FROM` and recipients are team-only, keep `EMAIL_PROVIDER=log`.

---

## 2. The database (Neon)

### Roles

| Role            | Used by                                  | May                                                          |
| --------------- | ---------------------------------------- | ------------------------------------------------------------ |
| `irca_owner`    | migrations, `person:erase`               | everything; owns the schema                                  |
| `irca_app`      | the running API                          | read and write, except rewriting the activity log or deleting a finance entry |
| `irca_readonly` | feature code while someone is viewed as  | select only, and never the view-as rows                      |
| `irca_backup`   | the nightly dump (Phase 10)              | select only                                                  |

The grants for `irca_app` and `irca_readonly` are in the migrations, so the
roles must exist before the first migration runs. `irca_backup` has no grants
yet: Phase 10, step 10.2, adds them with the nightly backup.

1. In the Neon console, create the project and the database `irca`, owned by
   `irca_owner`. The console makes console-made roles members of
   `neon_superuser`; that is right for the owner (it needs `create extension`)
   and wrong for anything the running app uses. So create the other three as
   the owner, in SQL, where they stay ordinary roles:

   ```sql
   create role irca_app      login password '<generated>';
   create role irca_readonly login password '<generated>';
   create role irca_backup   login password '<generated>';

   alter role irca_app      set statement_timeout = '10s';
   alter role irca_readonly set statement_timeout = '10s';
   alter role irca_owner    set timezone = 'UTC';
   alter role irca_app      set timezone = 'UTC';
   alter role irca_readonly set timezone = 'UTC';
   alter role irca_backup   set timezone = 'UTC';
   ```

   Generate each password (at least 32 characters) and keep them in the
   password manager, nowhere else. `timezone = 'UTC'` is why dates are the same
   whichever role reads them (`01`, step 1.5); the church's own clock is a
   setting, not the database's.

2. Check that no runtime role can step around the grants, and keep the output
   for the hardening record (`docs/hardening.md`):

   ```sql
   \du
   select rolname, rolsuper, rolbypassrls from pg_roles where rolname like 'irca_%';
   ```

   `irca_app`, `irca_readonly` and `irca_backup` must show `f` for both.

3. For the Health page's slowest queries, as the owner:

   ```sql
   create extension if not exists pg_stat_statements;
   grant pg_read_all_stats to irca_app;
   ```

   Without these the page says query statistics are off, and nothing else is
   affected.

4. Create the branch `staging` from `main` once the production data is in.

### Connection strings

| Variable                 | Role            | Host                                  |
| ------------------------ | --------------- | ------------------------------------- |
| `DATABASE_URL`           | `irca_app`      | pooled (`-pooler`)                    |
| `DATABASE_URL_READONLY`  | `irca_readonly` | pooled                                |
| `DIRECT_DATABASE_URL`    | `irca_owner`    | direct (migrations cannot use a pooler) |

All three end in `?sslmode=verify-full`, not the `sslmode=require` Neon hands
out; `apps/registration/README.md` explains why. The backup role's URL goes only
into the backup job's own secrets, in Phase 10.

---

## 3. The API (Railway or Render)

The same settings on either.

| Setting            | Value |
| ------------------ | ----- |
| Root               | the repository root |
| Node               | 24 |
| Build              | `npm ci && npm run build -w @irca/shared && npm run build -w @irca/api` |
| Pre-deploy command | `npm run db:deploy -w @irca/api` — migrations run once per deploy, before the new version takes traffic, and a failed migration fails the deploy rather than the site |
| Start              | `node apps/api/dist/main.js` |
| Health check       | `/health` (outside `/v1`, never rate-limited) |
| Instances          | **one.** Rate-limit counters are in memory, and jobs are lock-safe but pointless twice over. Two instances needs the counters moved first (Phase 10). |

### Environment

Every variable in `apps/api/.env.example`. The ones that differ from
development:

| Variable                 | Production value |
| ------------------------ | ---------------- |
| `NODE_ENV`               | `production` |
| `DATABASE_URL`, `DATABASE_URL_READONLY`, `DIRECT_DATABASE_URL` | from §2 |
| `PORTAL_ORIGIN`          | `https://portal.<domain>` |
| `REGISTRATION_ORIGIN`    | `https://<registration domain>` |
| `SESSION_COOKIE_NAME`    | `__Host-irca_session` — the API refuses to start in production without the `__Host-` prefix |
| `SESSION_ABSOLUTE_HOURS` / `SESSION_IDLE_HOURS` | `168` / `12` |
| `TRUST_PROXY`            | the number of proxies in front: the host's load balancer plus Vercel's rewrite, so `2`. Check it once after the first deploy (below) |
| `LOG_LEVEL`              | `info` |
| `EMAIL_PROVIDER`         | `resend` |
| `EMAIL_FROM`             | `IRCA <no-reply@<domain>>` |
| `RESEND_API_KEY`         | from Resend |
| `BEEM_SETTINGS_KEY`      | 32 random bytes, base64 (`.env.example` says how). Seals the Beem key in the database. Make it once and keep it: a new one makes the saved Beem account unreadable until it is saved again |
| `BEEM_INBOUND_SECRET`    | at least 24 random characters. The password in the reply URL given to Beem (§6a) |
| `FILES_DIR`              | where files are kept: the files volume's mount path, such as `/data/files` (§6b). Unset, uploads are refused and nothing else changes |

The Beem key and secret are **not** environment variables: Communications
types them into Comms → Settings (D26).

The host's environment settings are the only place secrets live. Nothing in
the repository holds one, and `.env` files are never committed.

### First deploy

A fresh database has no church, and nobody can sign in, until these run once
on the API host's shell (`node apps/api/dist/cli/main.js …`, or
`npm run cli -w @irca/api -- …` from a checkout):

```bash
node apps/api/dist/cli/main.js church:setup --code IRCA \
  --name "International Revival Church Arusha" \
  --timezone Africa/Dar_es_Salaam --currency TZS
node apps/api/dist/cli/main.js user:create-dev --email <owner's email> --name "<owner's name>"
```

`church:setup` writes the church's one row of settings and refuses a second
time. `user:create-dev` asks for a password twice and gives the account the
Developer and Church administrator roles. Then, in the portal:

1. Sign in as that account.
2. **Admin → Portals:** turn on Membership, and Finance when its week of
   parallel running starts (`06`, step 6.11).
3. **Admin → People → Invite:** the senior pastor, with Church administrator,
   and the office, with their Membership roles.
4. **Dev → Settings → Registration form keys → New key**, for §5.

---

## 4. The portal (Vercel)

| Setting            | Value |
| ------------------ | ----- |
| Project            | new, Root Directory `apps/portal` |
| Framework          | Next.js (Vercel detects it) |
| Environment        | `API_INTERNAL_URL=https://api.<domain>`, `SESSION_COOKIE_NAME=__Host-irca_session` |
| Domain             | `portal.<domain>` |

The browser only ever talks to the portal: `/api/*` is rewritten to the API on
the server, so the session cookie is first-party and there is no CORS to get
wrong. The rewrite is baked in at build time, so changing `API_INTERNAL_URL`
needs a redeploy.

---

## 5. The registration form (Vercel, existing project)

Nothing changes until the cutover (`05`, step 5.18, and
`docs/runbooks/cutover-registration.md`). At the cutover its project gets:

```
REGISTRATION_BACKEND=api
API_INTERNAL_URL=https://api.<domain>
REGISTRATION_API_KEY=<the key from Dev → Settings, shown once>
```

and is redeployed. Rolling back is setting `REGISTRATION_BACKEND=db` and
redeploying; its old database stays untouched until the owner retires it.

---

## 6. Email (Resend)

1. Add the sending domain in Resend and create the SPF, DKIM and DMARC records
   it shows, at whoever holds the domain's DNS.
2. Wait for Resend to show the domain verified.
3. From the portal, invite a Gmail and an Outlook address you control. Both
   must land in the inbox, not spam. If either does not, check DMARC alignment
   before anything else.
4. Watch **Dev → Usage → Email** for the first week: anything given up on shows
   its reason there.

## 6a. Text messages (Beem)

1. Communications signs in, opens **Comms → Settings**, and saves the Beem key,
   secret and the sender name Beem registered, then presses **Test
   connection**. It shows the credit left. Until an account is saved, every
   message is only written to the API's log. Production sends through Beem
   once an account is saved; staging and every developer's machine do not,
   unless `SMS_LIVE=true` is set there on purpose, so a Beem key typed in for
   a test still texts nobody.
2. If the church wants spending held to a figure, Communications saves a
   **daily limit** on the same page; a send that would pass it is refused.
   With none saved, there is no limit (owner, 25 Sept 2026).
3. In Beem's dashboard, under two-way SMS, set the callback URL for replies to
   `https://api.<domain>/v1/public/comms/inbound?key=<BEEM_INBOUND_SECRET>`.
   Beem signs nothing, so the secret in the URL is what proves the call is
   Beem's; keep the URL out of screenshots. A reply of STOP (or ACHA, SIMAMA,
   TOKA, UNSUBSCRIBE) blocks the number for good.
4. Delivery is not reported to us: the API asks Beem every five minutes about
   messages sent in the last two days (docs.beem.africa, checked 24 Sept 2026).
   Nothing to set up.
5. Send one message to a phone you hold, and watch it become **Delivered** in
   Comms → History within ten minutes.

## 6b. File storage (a Railway volume)

Files such as Outreach's Saturday reports are kept on a Railway volume
attached to the API (D24): a disk that survives every deploy and restart.
Only its own deletion loses what is on it. Files are private: the browser
sends them to the API and reads them back through it, after the permission
check, so there is nothing public to configure.

1. **Attach the volume.** Railway → the `api` service → **+ New → Volume**,
   mount path `/data`. One volume per service; Hobby gives 5 GB, Pro 50 GB,
   which is years of PDFs at 10 MB each.
2. **Say where files go.** In the `api` service's variables:
   `FILES_DIR=/data/files`. The API makes the folders it needs.
3. **If the files cannot be written**, the image runs as a user other than
   root: add `RAILWAY_RUN_UID=0` to the same variables (Railway's own advice
   for volumes).
4. **What the volume costs you.** The API cannot have replicas while it has a
   volume, and each deploy stops it for a moment while the new one takes the
   disk over, so deploy when nobody is using it, never on a Sunday morning.
5. **Back it up.** The database's backups do not include these files. Turn on
   the volume's backups in Railway if the plan has them, and keep the Phase 10
   copy (`10-strengthening.md`, step 10.2) in mind.
6. **Check it before launch.** Attach a PDF to a Saturday in Outreach, redeploy
   the API, and open it again: it must still be there. Try a 12 MB PDF and a
   `.docx`: both are refused, and nothing is kept.

Every night at 03:30 the API removes files more than a day old that no file
row points at (an upload abandoned half-way) and lists rows whose file has
gone. Both appear in the dev console's job log as the `files-sweep` result;
anything under "missing" needs a person to look into it.

---

## 7. Error tracking (recommended, not yet wired)

Sentry's free tier covers both the API and the portal. When it is added, its
`beforeSend` must drop cookies, the authorisation header and every request
body, for the same reason the request log never records a body: tokens and
personal details travel there. Until then, the dev console's Logs page and the
host's own log retention are the record.

---

## 8. After every deploy

- `/health` answers `{"status":"ok","db":"ok"}`.
- **Dev → Health:** the jobs table shows `usage-snapshot`, `db-sample`,
  `email-outbox`, `impersonation-expiry` and `session-cleanup`, none failed.
  The two nightly ones appear after their first night.
- Sign in, open one page in each portal, sign out.
- After the first deploy only, check `TRUST_PROXY`: as the owner, the address
  on your own sign-in must be your real one, not the host's or Vercel's. If it
  is theirs, the rate limits would throttle everyone together.

  ```sql
  select ip, created_at from sessions order by created_at desc limit 1;
  ```

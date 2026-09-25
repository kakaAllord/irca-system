# Security hardening: the record

The checklist from `docs/plan/06-dev-console-hardening-launch.md`, step 6.5,
with the evidence for each item: the test that proves it, or the command that
shows it. Items that can only be checked against production are marked
**at launch**, with the exact check; tick them in the launch pull request.

Checked on 24 September 2026, on branch `phase-6/finish`.

## HTTP and the browser

- [x] **Security headers on both web apps.** `Strict-Transport-Security:
      max-age=63072000; includeSubDomains`, `X-Content-Type-Options: nosniff`,
      `Referrer-Policy: strict-origin-when-cross-origin`, a `Permissions-Policy`
      denying camera, microphone and geolocation, and `X-Frame-Options: DENY`
      plus `frame-ancestors 'none'`. One definition, `securityHeaders()` in
      `packages/shared/src/web-security.ts`, used by both `next.config.ts`
      files. Pages whose address carries a token (`/r/…`, `/reset-password`,
      `/accept-invite`) send `Referrer-Policy: no-referrer`, set in each app's
      `proxy.ts`. *Evidence:* `e2e/security.spec.ts`.
- [x] **A nonce-based Content-Security-Policy** on both apps, built per request
      in `proxy.ts`: `default-src 'self'`, scripts only by nonce with
      `strict-dynamic`, `connect-src 'self'`, `img-src 'self' data: blob:`,
      fonts self-hosted by `next/font`, no objects, no framing.
      *Evidence:* `e2e/security.spec.ts` fails on any CSP violation in the
      console while real pages run.
- [x] **No `dangerouslySetInnerHTML`.** `grep -rn dangerouslySetInnerHTML apps
      packages` finds nothing outside `node_modules`.
- [x] **The API:** `helmet()` defaults, no CORS, no `X-Powered-By`.
      *Evidence:* `auth.e2e-spec.ts`, "answers with the safe headers…", which
      sends a foreign `Origin` and gets no `Access-Control-Allow-Origin` back.

## Sign-in and sessions

- [x] **The session cookie** is `HttpOnly`, `SameSite=Lax`, `Path=/`, no
      domain, `Secure` in production (`session.cookie.ts`). In production its
      name must start with `__Host-`: the API refuses to boot otherwise
      (`env.ts`). *Evidence:* `auth.e2e-spec.ts` "signs in … and sets a safe
      cookie"; `env.spec.ts` "refuses a production session cookie without the
      __Host- prefix".
- [x] **Every public rate limit has been tried**, each from its own address:
      sign-in, forgot password (5 per 15 min), reset (10 per 15 min),
      looking up an invitation (20 a minute), accepting one (20 a minute), and
      the registration form. *Evidence:* `auth.e2e-spec.ts`,
      `admin.e2e-spec.ts`, `registration.e2e-spec.ts` — the tests named
      "limits…" and "slows down…".
- [x] **The right sessions end.** A password change signs out every other
      session; a reset signs out all of them; disabling someone signs them out
      at once and ends anyone viewing as them; `sessions:revoke` does the same
      from the command line. (Suspending a church no longer exists, D27.)
      *Evidence:* `auth.e2e-spec.ts` "signs out every older session when the
      password changes", `admin.e2e-spec.ts` "lets someone reset…" and
      "signs someone out … the moment their access is disabled",
      `cli.e2e-spec.ts` "signs someone out of every browser at once".
- [x] **Tokens never reach the request log.** Bodies are never logged; any
      long random-looking path segment is replaced with `[redacted]` before a
      line is written (`redactUrl`, `logging.module.ts`). Cookies,
      authorisation headers and password fields were already redacted.
      *Evidence:* `logging.module.spec.ts`.
- [ ] **At launch:** after a day of production traffic, search the host's logs
      for `irk_` and for 43-character base64url strings
      (`[A-Za-z0-9_-]{43}`). Both must find nothing.

## Keeping answers private

(The plan's multi-tenancy section is retired with D27: there is one church,
so there is no other church's data to keep out. What was never about tenancy
stays.)

- [x] **No answer is cached anywhere shared.** Every response, refusals and
      404s included, carries `Cache-Control: private, no-store` and
      `Vary: Cookie`, from middleware that runs before anything can answer.
      *Evidence:* `auth.e2e-spec.ts` "tells every cache not to keep an answer,
      signed in or not".

## Access control

- [x] **The route audit runs at every boot**, production included
      (`RouteAudit.onApplicationBootstrap`): the API refuses to start if a
      route declares no permission and is not explicitly public, or guards a
      write with only read permissions.
- [x] **A permission matrix for every module**, generated from the routes
      themselves: for each route that declares a permission, someone holding
      every other permission is refused, and someone holding only that one is
      let past the check. *Evidence:* `permission-matrix.e2e-spec.ts`, which
      also fails if it ever finds too few routes to mean anything.
- [x] **Viewing as someone is read-only in all three layers.** The portal
      offers nothing that changes anything (`e2e/finance.spec.ts` "viewing as a
      clerk shows the books with no way to change them"); the API refuses
      every write (`impersonation.e2e-spec.ts` "refuses every change…"); and the
      database connection cannot write (`impersonation.e2e-spec.ts` "is
      refused by the database itself…", and "can open every page of every
      portal on the read-only connection", which calls every GET route).
      The routes allowed to run while viewing are still exactly two, sign-out
      and stop (`impersonation.e2e-spec.ts` "allows exactly two routes…").
- [x] **Raw SQL cannot be built from strings.** Every raw query uses the `sql`
      tag (`core/database/sql.ts`), which binds each value;
      `$queryRawUnsafe`/`$executeRawUnsafe` are refused by ESLint and appear
      nowhere.
- [ ] **A second person has read each raw query.** There are 51 calls to
      `$queryRaw`/`$executeRaw` in `apps/api/src`
      (`grep -rhoE '\$(queryRaw|executeRaw)' apps/api/src --exclude-dir=generated | wc -l`).
      This is the owner's to arrange.

## Data

- [ ] **At launch: the database roles.** Run the checks in
      `docs/deployment.md` §2 and paste the output into the launch PR:
      `\du`, and `select rolname, rolsuper, rolbypassrls from pg_roles where
      rolname like 'irca_%'`, where every runtime role shows `f` for both.
- [ ] **At launch: the grants that protect the books and the log hold in
      production.** As the owner, every line must say `f`:

      ```sql
      select has_table_privilege('irca_app', 'audit_events', 'select')      as app_reads_log,
             has_table_privilege('irca_app', 'audit_events', 'update')      as app_rewrites_log,
             has_table_privilege('irca_app', 'finance_transactions', 'delete') as app_deletes_entries,
             has_table_privilege('irca_readonly', 'people', 'insert')       as readonly_writes;
      ```

      Row-level security, which the original checklist asked about, was
      removed with D27; these grants are what remains, and what D16 and D17
      rely on.
- [x] **The personal data inventory** is written: `docs/data-inventory.md`.
- [ ] **Leadership has read the inventory, and legal advice has been taken on
      the registration form's consent wording** (Tanzania's Personal Data
      Protection Act, 2022). The church's to do, before launch.
- [x] **Erasure on request:** `person:erase`, with a dry run and the id typed
      back; the runbook is `docs/runbooks/erasure-request.md`.
      *Evidence:* `person-erase.e2e-spec.ts`.
- [x] **Dependencies.** `npm run audit` passes: no unexplained advisory, three
      accepted with a reason and a review date in `scripts/audit-check.mjs`.
      CI runs it on every pull request, and Dependabot is enabled
      (`.github/dependabot.yml`).
- [x] **No secret in the history.**
      `git log -p --all | grep -iE "irk_[A-Za-z0-9_-]{20,}|re_[A-Za-z0-9]{20,}|postgres(ql)?://[^ ]*:[^ ]*@"`
      finds only the local development defaults (`postgres:postgres@localhost`,
      the `*_local_pw` test roles) and the seed's deliberately fake form key.
      Production secrets live only in the hosts' environment settings.

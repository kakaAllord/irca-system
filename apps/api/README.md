# @irca/api

The NestJS 12 API behind the IRCA portal and registration form. How it is
built, step by step, is in `docs/plan/` (Phase 1 onwards).

This is an ES-module project: relative imports end in `.js`.

## First run

1. Postgres 18 running locally, with the roles and two databases from
   `docs/plan/01-foundations-and-login.md`, step 1.5 (run that SQL once as the
   Postgres superuser, including the timeouts and `timezone = 'UTC'`). The
   `irca_core` role it creates is no longer used (D27); the others are.
2. From the repository root:

   ```bash
   npm install
   cp apps/api/.env.example apps/api/.env
   npm run db:migrate -w @irca/api      # applies migrations to irca_dev
   npm run db:seed -w @irca/api         # the church, and the accounts below
   npm run db:demo -w @irca/api         # optional: eighteen months of history
   npm run start:dev -w @irca/api       # http://localhost:4000/health
   ```

Seeded accounts (development and test only; the seed refuses to run anywhere else):

| Email                 | Password                | What they are                              |
| --------------------- | ----------------------- | ------------------------------------------ |
| `dev@irca.local`      | `dev-password-123`      | Developer and Church administrator         |
| `admin@irca.local`    | `admin-password-123`    | Church administrator                       |
| `pastor@irca.local`   | `pastor-password-123`   | Church administrator and Membership pastor |
| `office@irca.local`   | `office-password-123`   | Membership secretary                       |
| `followup@irca.local` | `followup-password-123` | Membership follow-up                       |
| `clerk@irca.local`    | `clerk-password-123`    | Finance clerk                              |
| `mhazini@irca.local`  | `manager-password-123`  | Finance manager                            |

## Commands

```bash
npm run test -w @irca/api          # unit tests (Vitest)
npm run test:e2e -w @irca/api      # end-to-end tests against irca_test
npm run lint -w @irca/api          # oxlint, type-aware
npm run cli -w @irca/api -- user:create-dev --email you@example.com --name "Your Name"
```

In production, run the command line from the build: `node apps/api/dist/cli/main.js ...`.
Every command is listed at the top of `src/cli/main.ts`; `docs/deployment.md`
says which to run on a fresh database, and `docs/runbooks/` when to reach for
the rest.

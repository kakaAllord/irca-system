# @irca/api

The NestJS 12 API behind the IRCA portal and registration form. How it is
built, step by step, is in `docs/plan/` (Phase 1 onwards).

This is an ES-module project: relative imports end in `.js`.

## First run

1. Postgres 18 running locally, with the five roles and two databases from
   `docs/plan/01-foundations-and-login.md`, step 1.5 (run that SQL once as the
   Postgres superuser, including the timeouts and `timezone = 'UTC'`).
2. From the repository root:

   ```bash
   npm install
   cp apps/api/.env.example apps/api/.env
   npm run db:migrate -w @irca/api      # applies migrations to irca_dev
   npm run db:seed -w @irca/api         # IRCA and TEST churches, accounts below
   npm run start:dev -w @irca/api       # http://localhost:4000/health
   ```

Seeded accounts (development and test only; the seed refuses to run anywhere else):

| Email              | Password             | What they are           |
| ------------------ | -------------------- | ----------------------- |
| `dev@irca.local`   | `dev-password-123`   | platform dev, no church |
| `admin@irca.local` | `admin-password-123` | member of IRCA          |
| `clerk@irca.local` | `clerk-password-123` | member of IRCA          |
| `admin@test.local` | `admin-password-123` | member of TEST          |

## Commands

```bash
npm run test -w @irca/api          # unit tests (Vitest)
npm run test:e2e -w @irca/api      # end-to-end tests against irca_test
npm run lint -w @irca/api          # oxlint, type-aware
npm run cli -w @irca/api -- user:create-dev --email you@example.com --name "Your Name"
```

In production, run the command line from the build: `node apps/api/dist/cli/main.js ...`.

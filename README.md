# IRCA system

The administration system for International Revival Church Arusha, built to
serve more than one church: a visitor registration form, a staff portal with
role-based access per department (Membership, Finance, and more to come), and
the API and database behind them.

```
apps/
  registration/   the visitor registration form (Next.js), live today
  api/            NestJS API
  portal/         staff portal (Next.js)
packages/
  shared/         code the apps must agree on
e2e/              browser journeys (Playwright)
docs/plan/        the build plan: start with docs/plan/README.md
```

Everything about how this is built, and in what order, is in
[`docs/plan/README.md`](docs/plan/README.md).

## Running it locally

Set up the database roles once (`docs/plan/01-foundations-and-login.md`,
step 1.5), then follow the first-run sections of `apps/api/README.md` and
`apps/portal/README.md`. The registration form runs on its own as before
(`apps/registration/README.md`).

```bash
npm install
npm run typecheck && npm run lint && npm test   # what CI runs first
npm run e2e                                     # the browser journeys
```

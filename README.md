# IRCA system

The administration system for International Revival Church Arusha, built to
serve more than one church: a visitor registration form, a staff portal with
role-based access per department (Membership, Finance, and more to come), and
the API and database behind them.

```
apps/
  registration/   the visitor registration form (Next.js), live today
  api/            NestJS API (Phase 1)
  portal/         staff portal (Next.js) (Phase 1)
packages/
  shared/         code the apps must agree on (Phase 1)
docs/plan/        the build plan: start with docs/plan/README.md
```

Everything about how this is built, and in what order, is in
[`docs/plan/README.md`](docs/plan/README.md).

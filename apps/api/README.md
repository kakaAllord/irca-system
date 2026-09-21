# @irca/api

The NestJS API behind the IRCA portal and registration form. How it is built,
step by step, is in `docs/plan/` (Phase 1 onwards).

```bash
npm install                        # at the repository root
npm run start:dev -w @irca/api     # http://localhost:4000
npm run test -w @irca/api          # unit tests (Vitest)
npm run test:e2e -w @irca/api      # end-to-end tests against a real Postgres
```

This is an ES-module project (NestJS 12): relative imports end in `.js`.

# @irca/portal

The staff portal (Next.js 16). How it is built, step by step, is in
`docs/plan/` (Phase 1 onwards).

## First run

The API must be running first (see `apps/api/README.md`). Then, from the
repository root:

```bash
cp apps/portal/.env.example apps/portal/.env.local
npm run dev -w @irca/portal        # http://localhost:3000
```

Sign in with one of the seeded accounts listed in `apps/api/README.md`.

The browser never calls the API directly: `/api/*` is rewritten to
`API_INTERNAL_URL` (`next.config.ts`), so the session cookie belongs to the
portal's own origin. `API_INTERNAL_URL` must be set when the portal is
**built**, because Next bakes rewrites in at build time.

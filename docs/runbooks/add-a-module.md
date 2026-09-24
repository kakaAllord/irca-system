# A department wants its own portal

A new portal is a code change, never a setting: its permissions, roles and
pages are defined in `packages/shared/src/modules/`, and an administrator only
turns it on.

1. **Do not build from guesses.** Spend an hour with the department and fill
   in `docs/modules/<key>-brief.md` (the questions are in
   `docs/plan/06-dev-console-hardening-launch.md`, step 6.12).
2. Follow [`docs/adding-a-module.md`](../adding-a-module.md). The first slice is
   one read-only list page; the generated permission matrix
   (`apps/api/test/permission-matrix.e2e-spec.ts`) covers its routes the
   moment its controller exists.
3. Once deployed, an administrator turns it on in **Admin → Portals**, which
   creates its built-in roles, and gives them out in **Admin → People**.

# Adding a department portal

A "portal" (a **module** in code) is a department's part of the system:
Finance, Membership, and later Media, Outreach or Comms. This is the recipe.
Finance (Phase 4) was built with it, and Membership (Phase 5) too.

Before writing anything, fill in the brief in `docs/plan/06-dev-console-hardening-launch.md`,
step 6.12: who is in the department, what they do weekly, what they may
change, what they must never see, and what leaves the system. **Do not build a
module from guesses.**

## 1. Describe it (`packages/shared/src/modules/<key>.ts`)

```ts
export const mediaModule = defineModule({
  key: 'media',
  name: 'Media',
  description: 'What the media team keeps track of.',
  kind: 'department',
  home: '/media',
  permissions: {
    'media.items.read':   { kind: 'read',  label: 'See the media library' },
    'media.items.manage': { kind: 'write', label: 'Add and change items' },
  },
  systemRoles: [
    { key: 'media.viewer', name: 'Media viewer', description: '…', permissions: ['media.items.read'] },
    { key: 'media.editor', name: 'Media editor', description: '…', permissions: ['media.items.read', 'media.items.manage'] },
  ],
  nav: [{ label: 'Library', href: '/media', icon: 'lists', permission: 'media.items.read' }],
});
```

- Permission keys are `<module>.<resource>.<action>` and must start with the
  module key; the definition refuses anything else.
- `icon` names one of the sidebar's drawings (`NavIcon` in
  `packages/shared/src/rbac/define.ts`). If none of them fits, add one to that
  list and draw it in `apps/portal/src/components/shell/NavIcon.tsx`, in the
  same weight as the others.
- Mark each one `read` or `write` honestly. That single flag is what makes
  viewing as someone read-only, and what stops a write route being guarded by
  a read permission.
- Two or three system roles is usually right when needs are unclear: viewer,
  editor, manager. Administrators can make their own later.

Add it to `CHURCH_MODULES` in `packages/shared/src/modules/index.ts`. That one
line puts it in the Portals page, the role editor and the sidebar.

## 2. Give it tables (`apps/api/prisma/schema.prisma`)

- Every table has `churchId` and `@@map`/`@map` to snake_case names.
- Add each model to `TENANT_MODELS` **and** `TENANT_PLANE_MODELS`, and each
  table name to `TENANT_TABLES` and `TENANT_PLANE_TABLES`
  (`apps/api/src/core/database/planes.ts`). A test fails if you forget.
- References to people are plain `@db.Uuid` columns with **no relation**: a
  church's records may not point at shared tables (see `multi-tenancy.md`,
  section 13). References within the module are ordinary relations.
- Create the migration with `--create-only`, then add by hand:

  ```sql
  alter table <table> enable row level security;
  create policy <table>_tenant on <table> for all to irca_app, irca_readonly
    using (church_id = app_church_id()) with check (church_id = app_church_id());
  create policy <table>_core on <table> for all to irca_core using (true) with check (true);
  create policy <table>_backup on <table> for select to irca_backup using (true);
  ```

  Add `revoke delete, truncate ... from irca_app` for anything that must never
  be deleted, and a trigger for anything that must never change after the fact
  (see `finance_txn_guard`). Then `npx prisma migrate dev`.

## 3. Build the API (`apps/api/src/modules/<key>/`)

- A Nest module with controllers and services. Register it in `AppModule`.
- **Every route** carries `@RequirePermission(...)` (or `@RequireAnyPermission`).
  The API refuses to start otherwise, and a `POST` guarded only by read
  permissions is refused too.
- Services take `Db` and never a Prisma client. Single queries use
  `db.client`; anything with several statements, and **all raw SQL**, uses
  `db.tx`. Never pass a church id: the church comes from the request.
  Raw SQL through `db.client` returns nothing and inserts nothing: the tenant
  extension cannot see inside a raw query, and only the transaction tells
  Postgres which church this is. Filter `church_id` in the SQL as well, with a
  `-- tenant:` comment saying so.
- Let Prisma create rows unless there is a reason not to: ids are UUID v7,
  which sort by creation time. A raw `insert` with `gen_random_uuid()` quietly
  breaks that.
- Numbers people will read (receipt numbers, member numbers) come from
  `SequenceService.next(tx, key)`, inside the same transaction as the row
  that uses them. Called anywhere else, the numbering grows gaps.
- Log every change with `audit.recordIn(tx, …)` in the same transaction, and
  count what matters with `usage.inc('<key>.<thing>')`.
- Records that must not be changed directly go through the change-request
  mechanism instead (Phase 4, step 4.6a): implement `ChangeRequestHandler` and
  register it from the module's own provider in `onModuleInit`, so core never
  imports the module. The handler decides what may be proposed, what it means
  in words, and how an approved change is applied.

## 4. Build the pages (`apps/portal/src/app/(app)/<key>/…`)

- Each page calls the API through `serverApi`, and starts with `PageHeader`.
- Every action is wrapped in `<Can permission="…">`. Nothing else is needed to
  make the page behave correctly while someone is viewing as another person.
- Filters live in the URL and update as you type (see the People page).
- Anything with fields in it opens in the right-hand `Drawer`: inviting
  someone, a new role, a new item, asking for a correction. A plain yes-or-no
  question keeps the centred `Dialog`, because it should interrupt.
- A form that waits on the network while the person keeps typing must merge
  into current state, not into the state its handler was rendered with: pass
  an updater (`onChange((previous) => …)`), as the finance entry fields do.
  The bug it prevents is a created item wiping an amount typed meanwhile.

## 5. Prove it

- A permission matrix test: each system role against every route, 2xx or 403
  from a table in the test file, so a new route without a row fails.
- A cross-church test: another church cannot read, search, export or change
  any of it.
- An impersonation test: every write route answers `IMPERSONATION_READ_ONLY`.
- One Playwright journey through the main task. Journeys run against a built
  portal, not `next dev`: in development the portal compiles routes on demand
  and Fast Refresh reloads the page, which cancels a navigation a journey has
  just started. Runs also share a database, so generate names per run and
  expect the near-duplicate guard to ask about the last run's.

## 6. Write it down

Update `docs/plan/appendix-database.md`, the metric labels in
`docs/plan/06-dev-console-hardening-launch.md` (step 6.1), and
`docs/what-works-now.md`.

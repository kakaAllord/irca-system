# Adding a department portal

A "portal" (a **module** in code) is a department's part of the system:
Finance, Membership, and later Media, Outreach or Comms. This is the recipe.
Finance (Phase 4) was built with it, and Membership (Phase 5) too.

Before writing anything, fill in `docs/modules/<key>-brief.md` with the
questions in `docs/plan/06-dev-console-hardening-launch.md`, step 6.12: who
is in the department, what they do weekly, what they may change, what they
must never see, and what leaves the system. **Do not build a module from
guesses.**

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

- `@@map`/`@map` every model and column to snake_case names.
- No `church_id`: this deployment serves one church (D27), and a second church
  gets a database of its own. References to people and to other modules'
  records are ordinary relations.
- The application role and the read-only role get their grants on new tables
  automatically (the default privileges in the migrations). What they must not
  do is written into the migration by hand: create it with `--create-only`,
  then add a `revoke delete, truncate ... from irca_app` for anything that
  must never be deleted, and a trigger for anything that must never change
  after the fact (see `finance_txn_guard`). Then `npx prisma migrate dev`.
- A table that holds something a church must never read through a raw query
  (as `audit_events` holds the view-as log) loses `select` for both runtime
  roles and is read through a `security definer` function instead; see the
  init migration's `church_audit_events()`.

## 3. Build the API (`apps/api/src/modules/<key>/`)

- A Nest module with controllers and services. Register it in `AppModule`.
- **Every route** carries `@RequirePermission(...)` (or `@RequireAnyPermission`).
  The API refuses to start otherwise, and a `POST` guarded only by read
  permissions is refused too.
- Services take `Db` and never a Prisma client (lint refuses the import).
  Single queries use `db.client`; anything with several statements uses
  `db.tx`. Either way, `Db` hands out the read-only connection while someone
  is being viewed as, so a GET that writes by mistake fails in the database.
  Raw SQL is written with the `sql` tag from `core/database/sql.ts`, which
  binds every value; the `Unsafe` variants are banned by lint.
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
- Required fields carry the red star (`required` on `Input`/`Select`, or
  `<RequiredMark />` on a group's legend), and the submit is a `SubmitButton`
  with `missing={[...]}` so a greyed-out button says what it is waiting for
  rather than leaving someone to hunt for it.
- A form that waits on the network while the person keeps typing must merge
  into current state, not into the state its handler was rendered with: pass
  an updater (`onChange((previous) => …)`), as the finance entry fields do.
  The bug it prevents is a created item wiping an amount typed meanwhile.

## 5. Prove it

- The permission matrix is generated: `apps/api/test/permission-matrix.e2e-spec.ts`
  reads every route's declared permission and checks that holding everything
  else is refused and holding only that is let through. A new module is in it
  the moment its controller exists; its own tests say what the routes do.
- Viewing as someone is covered the same way: `impersonation.e2e-spec.ts`
  opens every GET route in the API on the read-only connection, so a page that
  writes on read fails there. Write routes are refused with
  `IMPERSONATION_READ_ONLY` by the guard, whatever the module.
- One Playwright journey through the main task. Journeys run against a built
  portal, not `next dev`: in development the portal compiles routes on demand
  and Fast Refresh reloads the page, which cancels a navigation a journey has
  just started. Runs also share a database, so generate names per run and
  expect the near-duplicate guard to ask about the last run's.

## 6. Write it down

Update `docs/plan/appendix-database.md` and `docs/what-works-now.md`. Every
metric the module counts goes into `packages/shared/src/usage-metrics.ts`
with its label and unit; a test fails if the code counts one that is not
listed, and the dev console's Usage pages draw from that list.

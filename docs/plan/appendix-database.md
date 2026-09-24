# Appendix — Every table

One database serves one church (D27). No table carries a `church_id`; a second
church would have a database of its own. The schema is
`apps/api/prisma/schema.prisma`; the rules the database keeps for itself —
grants, triggers, check constraints, partial unique indexes — are written by
hand in the migrations, mostly the init migration.

| Table | Phase | Owner / purpose | Special rules |
| --- | --- | --- | --- |
| `church` | 1 | The church's settings: code, name, timezone, currency. | Exactly one row (`check (id = 1)`). `code` frozen once finance entries exist (trigger `church_code_frozen`). Written by `church:setup`, changed in Dev → Settings. |
| `users` | 1 | People who can sign in: email, name, phone, password hash, status. `person_id` (7) links the account to the person it belongs to. | Email stored normalised. `person_id` unique; set when someone is named a department leader, and what their leadership is found by. |
| `sessions` | 1 | Signed-in browsers: token hash, address, browser, impersonation link. | Raw token never stored. Revoked, then deleted 90 days later by the nightly job. |
| `permissions` | 2 | Mirror of the permissions defined in code, with kind. | Written only by the registry sync; retired, not deleted. |
| `module_state` | 2 | Which portals are turned on. | Turning one off keeps the row, the roles and the data. |
| `roles` | 2 | Built-in and custom roles, each in one portal. | Built-in roles synced from code by `system_key`; custom roles soft-deleted. |
| `role_permissions` | 2 | Which permissions a role has. | A permission must belong to the role's portal. |
| `user_roles` | 2 | Which roles a person holds. | Only roles of portals that are on count. |
| `impersonation_sessions` | 2 | Every view-as: actor, subject, times, how it ended. No reason is stored. | Read only through the dev console's view-as log (D16). |
| `audit_events` | 2 | Append-only activity log, with actor and subject. | `update`, `delete`, `truncate` revoked from `irca_app`. **`select` revoked from both runtime roles:** read through `church_audit_events()` (never a view-as row), `impersonation_audit_events()` (only view-as rows, for the dev console) and `audit_events_count()`, all `security definer`. Written through `insertAuditEvent`, which asks for nothing back. Kept forever. |
| `usage_daily` | 2 | Per-day counters and gauges (6.1). | Counters summed, max keeps the greatest, gauges replace. |
| `user_activity_daily` | 2 | Who was active each day. | The source of `users.active`. |
| `job_runs` | 2 | Background job history. | Jobs hold an advisory lock, so two instances never run one twice. |
| `email_outbox` | 3 | Queued and sent emails. | One-time links scrubbed from the payload once sent. |
| `invitations` | 3 | One-time invitation tokens (hash). | 72 h, single use. |
| `password_reset_tokens` | 3 | One-time reset tokens (hash). | 1 h, single use. Deleted after 7 days. |
| `sequences` | 4 | Gapless counters: `finance:EXP:2026-09`, `membership:member_number`. | Incremented only inside the transaction that uses the number. |
| `finance_income_sources` | 4 | The list of income sources. | Unique by normalised name. Turned off, never deleted. |
| `finance_expense_items` | 4 | The list of expense items. | Same. |
| `change_requests` | 4 | Requests to change a protected record (first user: finance entries), decided in Admin → Requests. | One pending per record. The decider is never the requester (check constraint). |
| `finance_transactions` | 4 | Income and expense entries with their codes. | `delete`, `truncate` revoked. **Any** update refused by trigger `finance_txn_guard` unless it applies a newly approved change request. The number never changes, and a void is final. A month move is a void plus a new linked entry. |
| `registrations` | 5 | Visitors' own answers (moved from the form's first database). | One per phone (partial unique index). Tokens preserved from before. |
| `people` | 5 | The church's record of a person: stage, confirmed salvation and baptism, member number. | Member number unique. |
| `person_stage_events` | 5 | History of stage moves. | |
| `person_notes` | 5 | Notes, visits and calls. | Sensitive: only with `membership.people.read_sensitive`. |
| `membership_applications` | 5 | Applications: review, approve, confirm. | One open per person. Confirmed after the probation period. |
| `foundation_groups` | 5 | Class groups (Thursday, Saturday). | |
| `foundation_enrollments` | 5 | Who is in which class. | One open per person. |
| `foundation_attendance` | 5 | Session ticks and misses. | |
| `registration_reminders` | 5 | When someone was sent their link, and how. | |
| `settings` | 5 | Key–value settings (probation days, sessions, the demo marker). | Defaults in code. |
| `api_clients` | 5 | Keys for the church's own apps (the registration form). | Hash stored, shown once. Revoked, never deleted. |
| `departments` | 7 | The church's departments (D28), and the portal that belongs to each, if any (`module_key`). | Name unique; a portal belongs to one department (unique `module_key`), and a department portal is switched on only for its department. Archived, never deleted (`delete`, `truncate` revoked). |
| `department_leaders` | 7 | Who leads each department, with their title. Named only by an administrator, and only a confirmed member. | One open leadership per person per department (partial unique index). Ended, never deleted (`delete`, `truncate` revoked); erased with the person. What a leader may do is worked out from these rows by the permission resolver, never from a role. |
| `department_members` | 7 | Who is in each department, added by its leaders. Anyone in People. | Same as leaders: one open per person per department, ended, never deleted, erased with the person. |

**Database roles:** `irca_owner` owns the schema and runs migrations and
`person:erase`. `irca_app` is everything the API does, with the revokes above.
`irca_readonly` is what feature code runs on while someone is viewed as: select
on every table except `audit_events`, and the church's side of the log through
its function (migration `readonly_impersonation`). `irca_backup` reads for the
nightly dump (Phase 10). None of them is a superuser or has `BYPASSRLS`. The
`irca_core` role from 01 step 1.5 is no longer used.

**Retired with D27:** `church_memberships`, `membership_roles`,
`church_modules` (now `module_state`), `church_sequences` (now `sequences`),
`church_settings` (now `settings`), `church_placements`,
`platform_usage_daily`, `users.platform_role`, and row-level security on every
table.

**Naming:** tables and columns are `snake_case` (via `@map`/`@@map`), models
and fields are `camelCase` in TypeScript, and ids are UUID v7.

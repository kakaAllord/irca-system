# Appendix — Every table

**Plane** (see `multi-tenancy.md`): **control plane** tables stay in the shared
database forever: `churches`, `users`, `sessions`, `permissions`,
`church_memberships`, `church_modules`, `roles`, `role_permissions`,
`membership_roles`, `impersonation_sessions`, `usage_daily`,
`platform_usage_daily`, `user_activity_daily`, `job_runs`, `church_placements`,
`invitations`, `password_reset_tokens`, `email_outbox`, `api_clients`, and
`audit_events` rows with `source = 'core'`. **Every other table is tenant
plane** and moves with its church if the church gets a dedicated database.
That includes `audit_events` rows with `source = 'feature'`. Tenant-plane tables
have no foreign keys to control-plane tables except `churches`.

**Tenant?** = has `church_id` and is scoped automatically by the Prisma
extension (it is in `TENANT_MODELS`). **Core** = has or may have `church_id`,
but is written only by core code through the read-write client. **Global** =
not church-owned.

| Table | Phase | Kind | Owner / purpose | Special rules |
| --- | --- | --- | --- | --- |
| `churches` | 1 | Global | Tenants: code, slug, name, timezone, currency, status. | `code` is frozen once finance entries exist (trigger). |
| `users` | 1 | Global | People who can sign in: email, name, password hash, platform role. | Email stored normalised. `platform_role` only set by CLI. |
| `church_memberships` | 1 | Tenant | A user's access to a church, with status. | Roles only count when `ACTIVE`. |
| `sessions` | 1 | Core | Signed-in browsers: token hash, active church, impersonation link. | Raw token never stored. Revoked, never deleted (deleted after 90 days by the nightly job). |
| `permissions` | 2 | Global | Mirror of code-defined permissions, with kind. | Written only by the boot sync, retired not deleted. |
| `church_modules` | 2 | Tenant | Which modules a church has turned on. | Disabling keeps the row, roles and data. |
| `roles` | 2 | Tenant | System and custom roles, each in one module. | System roles synced from code, custom roles soft-deleted. |
| `role_permissions` | 2 | Tenant | Which permissions a role has. | A permission must belong to the role's module. |
| `membership_roles` | 2 | Tenant | Which roles a membership holds. | Only roles of enabled modules count. |
| `impersonation_sessions` | 2 | Core | Every view-as: actor, subject, church, times, how it ended. No reason is stored. | Read-only enforcement keyed on it. Readable only by devs (D16). |
| `audit_events` | 2 | Core | Append-only activity log, with actor and subject. | `UPDATE/DELETE/TRUNCATE` revoked from the app role. Kept forever. Impersonation rows are excluded from every church-facing read (`AuditQueries.forChurch()`). |
| `usage_daily` | 2 | Core | Per-church per-day counters and gauges. | Counters summed, max takes the greatest, gauges replace. |
| `platform_usage_daily` | 2 | Global | Counters with no church. | |
| `user_activity_daily` | 2 | Core | Who was active each day (DAU/WAU/MAU). | |
| `job_runs` | 2 | Global | Background job history. | |
| `church_placements` | 2 | Core | Which database cluster holds each church's tenant-plane data (`shared` at launch), and whether it is being moved. | Maintenance state `MOVING` makes that church read-only. |
| `email_outbox` | 3 | Core | Queued and sent emails. | Token links scrubbed after sending. |
| `invitations` | 3 | Tenant | One-time invitation tokens (hash). | 72 h, single use. |
| `password_reset_tokens` | 3 | Global | One-time reset tokens (hash). | 1 h, single use. Deleted after 7 days. |
| `church_sequences` | 4 | Tenant | Gapless counters: `finance:EXP:2026-09`, `membership:member_number`. | Incremented only inside the transaction that uses the number. |
| `finance_income_sources` | 4 | Tenant | The list of income sources. | Unique by normalised name. Turned off, never deleted. |
| `finance_expense_items` | 4 | Tenant | The list of expense items. | Same. |
| `change_requests` | 4 | Tenant | Requests from any portal to change a protected record (first user: finance entries), decided in Admin → Requests. | One pending per record. The decider is never the requester (check constraint). |
| `finance_transactions` | 4 | Tenant | Income and expense entries with their codes. | `DELETE` revoked. **Any** update refused by trigger unless it applies a newly approved change request. The number never changes, and a void is final. A month move = void + a new linked entry. |
| `registrations` | 5 | Tenant | Visitors' own answers (moved from the first database). | Unique phone per church (partial index). Token preserved from before. |
| `people` | 5 | Tenant | The church's record of a person: stage, confirmed salvation/baptism, member number. | Member number unique per church. |
| `person_stage_events` | 5 | Tenant | History of stage moves. | |
| `person_notes` | 5 | Tenant | Notes, visits and calls. | Sensitive: only with `membership.people.read_sensitive`. |
| `membership_applications` | 5 | Tenant | Applications: review, approve, confirm. | One open per person. Confirm after the probation period. |
| `foundation_groups` | 5 | Tenant | Class groups (Thursday, Saturday). | |
| `foundation_enrollments` | 5 | Tenant | Who is in which class. | One open per person. |
| `foundation_attendance` | 5 | Tenant | Session ticks and misses. | |
| `registration_reminders` | 5 | Tenant | When someone was sent their link, and how. | |
| `church_settings` | 5 | Tenant | Per-church settings (probation days, sessions). | Defaults in code. |
| `api_clients` | 5 | Core | Keys for a church's apps (the registration form). | Hash stored, shown once. |

**Row-level security:** every **Tenant** table has RLS on, with a tenant
policy for `irca_app`/`irca_readonly` (`church_id = app_church_id()`), a see-all
policy for `irca_core`, and a read policy for `irca_backup`. Every **Core** table
has RLS on with **only** the core and backup policies, so feature code sees
nothing in it. `audit_events` additionally hides impersonation rows from church
readers. Global tables (`churches`, `users`, `permissions`) have no
church dimension. See 02 step 2.4a.

**Database roles:** `irca_owner` (migrations, table owner), `irca_core` (core
code, sees every church), `irca_app` (feature code, one church per transaction),
`irca_readonly` (impersonated requests, one church, SELECT only), `irca_backup`
(nightly dump, every church, SELECT only). See 01 steps 1.5 and 1.8.

**Naming:** tables and columns are `snake_case` (via `@map`/`@@map`), models
and fields are `camelCase` in TypeScript, and ids are UUID v7.

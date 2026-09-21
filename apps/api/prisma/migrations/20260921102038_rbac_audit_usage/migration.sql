-- CreateEnum
CREATE TYPE "PermissionKindDb" AS ENUM ('READ', 'WRITE');

-- CreateEnum
CREATE TYPE "ImpersonationEndReason" AS ENUM ('STOPPED', 'EXPIRED', 'LOGOUT', 'REVOKED');

-- CreateEnum
CREATE TYPE "PlacementState" AS ENUM ('ACTIVE', 'MOVING');

-- CreateTable
CREATE TABLE "permissions" (
    "key" VARCHAR(80) NOT NULL,
    "module_key" VARCHAR(40) NOT NULL,
    "kind" "PermissionKindDb" NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "retired_at" TIMESTAMPTZ(6),

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "church_modules" (
    "church_id" UUID NOT NULL,
    "module_key" VARCHAR(40) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "enabled_at" TIMESTAMPTZ(6),
    "enabled_by_id" UUID,
    "disabled_at" TIMESTAMPTZ(6),
    "disabled_by_id" UUID,

    CONSTRAINT "church_modules_pkey" PRIMARY KEY ("church_id","module_key")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
    "module_key" VARCHAR(40) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(300) NOT NULL DEFAULT '',
    "system_key" VARCHAR(80),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "church_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "permission_key" VARCHAR(80) NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_key")
);

-- CreateTable
CREATE TABLE "membership_roles" (
    "church_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "granted_by_id" UUID,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_roles_pkey" PRIMARY KEY ("membership_id","role_id")
);

-- CreateTable
CREATE TABLE "impersonation_sessions" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "subject_user_id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
    "previous_church_id" UUID,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "ended_at" TIMESTAMPTZ(6),
    "end_reason" "ImpersonationEndReason",

    CONSTRAINT "impersonation_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "church_id" UUID,
    "source" VARCHAR(10) NOT NULL DEFAULT 'feature',
    "actor_user_id" UUID,
    "subject_user_id" UUID,
    "impersonation_id" UUID,
    "action" VARCHAR(80) NOT NULL,
    "entity_type" VARCHAR(60),
    "entity_id" VARCHAR(80),
    "summary" VARCHAR(300),
    "before" JSONB,
    "after" JSONB,
    "meta" JSONB,
    "ip" VARCHAR(64),
    "user_agent" VARCHAR(400),
    "request_id" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_daily" (
    "church_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "metric" VARCHAR(80) NOT NULL,
    "value" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "usage_daily_pkey" PRIMARY KEY ("church_id","day","metric")
);

-- CreateTable
CREATE TABLE "platform_usage_daily" (
    "day" DATE NOT NULL,
    "metric" VARCHAR(80) NOT NULL,
    "value" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "platform_usage_daily_pkey" PRIMARY KEY ("day","metric")
);

-- CreateTable
CREATE TABLE "user_activity_daily" (
    "church_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "user_activity_daily_pkey" PRIMARY KEY ("church_id","user_id","day")
);

-- CreateTable
CREATE TABLE "job_runs" (
    "id" UUID NOT NULL,
    "job" VARCHAR(60) NOT NULL,
    "church_id" UUID,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "ok" BOOLEAN,
    "error" TEXT,
    "stats" JSONB,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "church_placements" (
    "church_id" UUID NOT NULL,
    "cluster" VARCHAR(40) NOT NULL DEFAULT 'shared',
    "state" "PlacementState" NOT NULL DEFAULT 'ACTIVE',
    "moved_at" TIMESTAMPTZ(6),

    CONSTRAINT "church_placements_pkey" PRIMARY KEY ("church_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_church_id_module_key_name_key" ON "roles"("church_id", "module_key", "name");

-- CreateIndex
CREATE UNIQUE INDEX "roles_church_id_system_key_key" ON "roles"("church_id", "system_key");

-- CreateIndex
CREATE INDEX "role_permissions_church_id_idx" ON "role_permissions"("church_id");

-- CreateIndex
CREATE INDEX "membership_roles_church_id_idx" ON "membership_roles"("church_id");

-- CreateIndex
CREATE INDEX "membership_roles_role_id_idx" ON "membership_roles"("role_id");

-- CreateIndex
CREATE INDEX "impersonation_sessions_church_id_started_at_idx" ON "impersonation_sessions"("church_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "impersonation_sessions_subject_user_id_started_at_idx" ON "impersonation_sessions"("subject_user_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "impersonation_sessions_actor_user_id_started_at_idx" ON "impersonation_sessions"("actor_user_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "audit_events_church_id_created_at_idx" ON "audit_events"("church_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_events_entity_type_entity_id_idx" ON "audit_events"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_events_actor_user_id_created_at_idx" ON "audit_events"("actor_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_events_subject_user_id_created_at_idx" ON "audit_events"("subject_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "usage_daily_day_idx" ON "usage_daily"("day");

-- CreateIndex
CREATE INDEX "user_activity_daily_church_id_day_idx" ON "user_activity_daily"("church_id", "day");

-- CreateIndex
CREATE INDEX "job_runs_job_started_at_idx" ON "job_runs"("job", "started_at" DESC);

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_impersonation_id_fkey" FOREIGN KEY ("impersonation_id") REFERENCES "impersonation_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "church_modules" ADD CONSTRAINT "church_modules_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_key_fkey" FOREIGN KEY ("permission_key") REFERENCES "permissions"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "church_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "church_placements" ADD CONSTRAINT "church_placements_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Row-level security: the second layer that keeps churches apart.
--
-- Feature code (irca_app, and irca_readonly while impersonating) sees only the
-- church set for the current transaction. Core code (irca_core) sees every
-- church, because signing in, resolving permissions, writing the audit log and
-- running jobs all happen before or across any one church. Backups (irca_backup)
-- read everything. Nothing is set means no rows: it fails closed.
--
-- `force row level security` is deliberately not used: the table owner
-- (irca_owner) runs migrations and backups and must keep seeing everything. No
-- runtime role owns a table, so none of them escapes these policies.
-- ---------------------------------------------------------------------------

-- The church this transaction acts for, or NULL. current_setting(..., true)
-- returns NULL when never set, and '' once a pooled connection has had it set
-- and cleared at the end of an earlier transaction; nullif turns both into NULL.
create function app_church_id() returns uuid
  language sql
  stable
  as $$ select nullif(current_setting('app.church_id', true), '')::uuid $$;

grant execute on function app_church_id() to irca_core, irca_app, irca_readonly, irca_backup;

-- Church-owned tables: one church at a time for feature code.
do $$
declare t text;
begin
  foreach t in array array[
    'church_memberships', 'church_modules', 'roles', 'role_permissions', 'membership_roles'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for all to irca_app, irca_readonly using (church_id = app_church_id()) with check (church_id = app_church_id())',
      t || '_tenant', t);
    execute format('create policy %I on %I for all to irca_core using (true) with check (true)', t || '_core', t);
    execute format('create policy %I on %I for select to irca_backup using (true)', t || '_backup', t);
  end loop;
end $$;

-- Core-owned tables: feature code has no policy at all, so it sees nothing in
-- them and cannot write to them, whatever query it sends.
do $$
declare t text;
begin
  foreach t in array array[
    'sessions', 'impersonation_sessions', 'usage_daily', 'platform_usage_daily',
    'user_activity_daily', 'job_runs', 'church_placements'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for all to irca_core using (true) with check (true)', t || '_core', t);
    execute format('create policy %I on %I for select to irca_backup using (true)', t || '_backup', t);
  end loop;
end $$;

-- A church is visible to itself, and can be edited by its own administrators.
alter table churches enable row level security;
create policy churches_tenant on churches for all to irca_app, irca_readonly
  using (id = app_church_id()) with check (id = app_church_id());
create policy churches_core on churches for all to irca_core using (true) with check (true);
create policy churches_backup on churches for select to irca_backup using (true);

-- People are global identities, so feature code may read only those who belong
-- to the church it is working in, and may not write them at all: creating and
-- changing an account is core's work (invitations, profile, password).
alter table users enable row level security;
create policy users_tenant_read on users for select to irca_app, irca_readonly
  using (exists (select 1 from church_memberships m
                 where m.user_id = users.id and m.church_id = app_church_id()));
create policy users_core on users for all to irca_core using (true) with check (true);
create policy users_backup on users for select to irca_backup using (true);

-- The activity log is evidence: nothing that runs the app may rewrite it.
revoke update, delete, truncate on table audit_events from irca_app, irca_core;

-- Impersonation is invisible to churches, in the database as well as in code
-- (D16): a church reader never sees a view-as row, whatever query it sends.
alter table audit_events enable row level security;
create policy audit_events_tenant_read on audit_events for select to irca_app, irca_readonly
  using (church_id = app_church_id()
         and impersonation_id is null
         and action not like 'impersonation.%');
create policy audit_events_tenant_insert on audit_events for insert to irca_app
  with check (church_id = app_church_id() and impersonation_id is null);
create policy audit_events_core on audit_events for all to irca_core using (true) with check (true);
create policy audit_events_backup on audit_events for select to irca_backup using (true);

-- The permission list is the same for every church, and read-only to everyone
-- but the boot-time sync.
revoke insert, update, delete on table permissions from irca_app, irca_readonly;

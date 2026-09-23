-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "PermissionKindDb" AS ENUM ('READ', 'WRITE');

-- CreateEnum
CREATE TYPE "ImpersonationEndReason" AS ENUM ('STOPPED', 'EXPIRED', 'LOGOUT', 'REVOKED');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "ChangeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FinanceKind" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "FinanceStatus" AS ENUM ('POSTED', 'VOIDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'MOBILE_MONEY', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "PersonStage" AS ENUM ('VISITOR', 'NEW_CONVERT', 'FOUNDATION_CLASS', 'AWAITING_BAPTISM', 'MEMBERSHIP_REVIEW', 'CONFIRMED_MEMBER');

-- CreateEnum
CREATE TYPE "PersonNoteKind" AS ENUM ('NOTE', 'VISIT', 'CALL');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CONFIRMED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "AttendanceMark" AS ENUM ('ATTENDED', 'MISSED');

-- CreateTable
CREATE TABLE "church" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "code" VARCHAR(10) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Africa/Dar_es_Salaam',
    "currency" CHAR(3) NOT NULL DEFAULT 'TZS',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "church_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "full_name" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(20),
    "locale" VARCHAR(5) NOT NULL DEFAULT 'en',
    "password_hash" TEXT,
    "password_changed_at" TIMESTAMPTZ(6),
    "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "user_id" UUID NOT NULL,
    "impersonation_id" UUID,
    "ip" VARCHAR(64),
    "user_agent" VARCHAR(400),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "revoke_reason" VARCHAR(40),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

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
CREATE TABLE "module_state" (
    "module_key" VARCHAR(40) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "enabled_at" TIMESTAMPTZ(6),
    "enabled_by_id" UUID,
    "disabled_at" TIMESTAMPTZ(6),
    "disabled_by_id" UUID,

    CONSTRAINT "module_state_pkey" PRIMARY KEY ("module_key")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
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
    "role_id" UUID NOT NULL,
    "permission_key" VARCHAR(80) NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_key")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "granted_by_id" UUID,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "impersonation_sessions" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "subject_user_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "ended_at" TIMESTAMPTZ(6),
    "end_reason" "ImpersonationEndReason",

    CONSTRAINT "impersonation_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
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
    "day" DATE NOT NULL,
    "metric" VARCHAR(80) NOT NULL,
    "value" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "usage_daily_pkey" PRIMARY KEY ("day","metric")
);

-- CreateTable
CREATE TABLE "user_activity_daily" (
    "user_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "user_activity_daily_pkey" PRIMARY KEY ("user_id","day")
);

-- CreateTable
CREATE TABLE "job_runs" (
    "id" UUID NOT NULL,
    "job" VARCHAR(60) NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "ok" BOOLEAN,
    "error" TEXT,
    "stats" JSONB,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_outbox" (
    "id" UUID NOT NULL,
    "to_email" VARCHAR(254) NOT NULL,
    "template" VARCHAR(60) NOT NULL,
    "payload" JSONB NOT NULL,
    "subject" VARCHAR(200),
    "status" "EmailStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" TEXT,
    "provider_message_id" VARCHAR(200),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),

    CONSTRAINT "email_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_by_id" UUID NOT NULL,
    "sent_count" INTEGER NOT NULL DEFAULT 1,
    "last_sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_requests" (
    "id" UUID NOT NULL,
    "module_key" VARCHAR(40) NOT NULL,
    "entity_type" VARCHAR(60) NOT NULL,
    "entity_id" VARCHAR(80) NOT NULL,
    "entity_label" VARCHAR(120) NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "before" JSONB NOT NULL,
    "proposed" JSONB NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requested_by_id" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "decision_note" VARCHAR(500),
    "applied_at" TIMESTAMPTZ(6),
    "result" JSONB,

    CONSTRAINT "change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sequences" (
    "key" VARCHAR(80) NOT NULL,
    "last_value" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sequences_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "finance_income_sources" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "name_key" VARCHAR(80) NOT NULL,
    "description" VARCHAR(300) NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "finance_income_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_expense_items" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "name_key" VARCHAR(80) NOT NULL,
    "description" VARCHAR(300) NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "finance_expense_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_transactions" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "kind" "FinanceKind" NOT NULL,
    "status" "FinanceStatus" NOT NULL DEFAULT 'POSTED',
    "txn_date" DATE NOT NULL,
    "period_year" INTEGER NOT NULL,
    "period_month" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "income_source_id" UUID,
    "expense_item_id" UUID,
    "method" "PaymentMethod" NOT NULL,
    "reference" VARCHAR(80),
    "counterparty" VARCHAR(120),
    "notes" VARCHAR(1000),
    "client_request_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "voided_at" TIMESTAMPTZ(6),
    "voided_by_id" UUID,
    "void_reason" VARCHAR(500),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "applied_request_id" UUID,
    "replaces_id" UUID,

    CONSTRAINT "finance_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registrations" (
    "id" UUID NOT NULL,
    "legacy_id" BIGINT,
    "token" VARCHAR(32) NOT NULL,
    "lang" VARCHAR(2) NOT NULL DEFAULT 'en',
    "status" VARCHAR(20) NOT NULL DEFAULT 'in_progress',
    "current_step" TEXT,
    "furthest_step" TEXT,
    "heard" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "heard_other_text" TEXT NOT NULL DEFAULT '',
    "friend_name" TEXT NOT NULL DEFAULT '',
    "fullname" TEXT NOT NULL DEFAULT '',
    "gender" TEXT NOT NULL DEFAULT '',
    "age" TEXT NOT NULL DEFAULT '',
    "visit" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "visit_other_text" TEXT NOT NULL DEFAULT '',
    "where_at" TEXT NOT NULL DEFAULT '',
    "ward" TEXT NOT NULL DEFAULT '',
    "ward_other" TEXT NOT NULL DEFAULT '',
    "region" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT '',
    "stay" TEXT NOT NULL DEFAULT '',
    "often" TEXT NOT NULL DEFAULT '',
    "dial_cc" TEXT NOT NULL DEFAULT 'TZ',
    "dial" TEXT NOT NULL DEFAULT '+255',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "occ" TEXT NOT NULL DEFAULT '',
    "school" TEXT NOT NULL DEFAULT '',
    "course" TEXT NOT NULL DEFAULT '',
    "year" TEXT NOT NULL DEFAULT '',
    "profession" TEXT NOT NULL DEFAULT '',
    "interest" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dob" TEXT NOT NULL DEFAULT '',
    "saved" BOOLEAN,
    "saved_year" TEXT NOT NULL DEFAULT '',
    "bapt" BOOLEAN,
    "bapt_year" TEXT NOT NULL DEFAULT '',
    "holy" BOOLEAN,
    "prev_church" BOOLEAN,
    "prev_church_name" TEXT NOT NULL DEFAULT '',
    "marital" TEXT NOT NULL DEFAULT '',
    "married_year" TEXT NOT NULL DEFAULT '',
    "kids" BOOLEAN,
    "children" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ministries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "other_ministry" TEXT NOT NULL DEFAULT '',
    "liked" TEXT NOT NULL DEFAULT '',
    "want_more" BOOLEAN,
    "prayer" TEXT NOT NULL DEFAULT '',
    "comments" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "submitted_at" TIMESTAMPTZ(6),

    CONSTRAINT "registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "people" (
    "id" UUID NOT NULL,
    "registration_id" UUID,
    "full_name" VARCHAR(120) NOT NULL DEFAULT '',
    "gender" VARCHAR(20) NOT NULL DEFAULT '',
    "age_group" VARCHAR(20) NOT NULL DEFAULT '',
    "dial" VARCHAR(6) NOT NULL DEFAULT '+255',
    "phone" VARCHAR(20) NOT NULL DEFAULT '',
    "email" VARCHAR(254) NOT NULL DEFAULT '',
    "stage" "PersonStage" NOT NULL DEFAULT 'VISITOR',
    "saved" BOOLEAN,
    "saved_set_by_id" UUID,
    "saved_set_at" TIMESTAMPTZ(6),
    "baptised" BOOLEAN,
    "baptised_set_by_id" UUID,
    "baptised_set_at" TIMESTAMPTZ(6),
    "member_number" INTEGER,
    "confirmed_at" TIMESTAMPTZ(6),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_stage_events" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "from_stage" "PersonStage",
    "to_stage" "PersonStage" NOT NULL,
    "by_id" UUID,
    "note" VARCHAR(300),
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "person_stage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_notes" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "kind" "PersonNoteKind" NOT NULL DEFAULT 'NOTE',
    "body" VARCHAR(2000) NOT NULL,
    "author_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "person_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_applications" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'UNDER_REVIEW',
    "source" VARCHAR(10) NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_by_id" UUID,
    "review_note" VARCHAR(1000),
    "decided_by_id" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "reject_reason" VARCHAR(500),
    "confirmed_by_id" UUID,
    "confirmed_at" TIMESTAMPTZ(6),

    CONSTRAINT "membership_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "foundation_groups" (
    "id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "foundation_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "foundation_enrollments" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "enrolled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "dropped_at" TIMESTAMPTZ(6),

    CONSTRAINT "foundation_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "foundation_attendance" (
    "enrollment_id" UUID NOT NULL,
    "session_no" INTEGER NOT NULL,
    "mark" "AttendanceMark" NOT NULL,
    "marked_by_id" UUID NOT NULL,
    "marked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "foundation_attendance_pkey" PRIMARY KEY ("enrollment_id","session_no")
);

-- CreateTable
CREATE TABLE "registration_reminders" (
    "id" UUID NOT NULL,
    "registration_id" UUID NOT NULL,
    "channel" VARCHAR(20) NOT NULL,
    "sent_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registration_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" VARCHAR(80) NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "api_clients" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "key_prefix" VARCHAR(12) NOT NULL,
    "key_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "api_clients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_impersonation_id_key" ON "sessions"("impersonation_id");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_module_key_name_key" ON "roles"("module_key", "name");

-- CreateIndex
CREATE UNIQUE INDEX "roles_system_key_key" ON "roles"("system_key");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- CreateIndex
CREATE INDEX "impersonation_sessions_started_at_idx" ON "impersonation_sessions"("started_at" DESC);

-- CreateIndex
CREATE INDEX "impersonation_sessions_subject_user_id_started_at_idx" ON "impersonation_sessions"("subject_user_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "impersonation_sessions_actor_user_id_started_at_idx" ON "impersonation_sessions"("actor_user_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "audit_events_created_at_idx" ON "audit_events"("created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_events_entity_type_entity_id_idx" ON "audit_events"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_events_actor_user_id_created_at_idx" ON "audit_events"("actor_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_events_subject_user_id_created_at_idx" ON "audit_events"("subject_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "usage_daily_day_idx" ON "usage_daily"("day");

-- CreateIndex
CREATE INDEX "user_activity_daily_day_idx" ON "user_activity_daily"("day");

-- CreateIndex
CREATE INDEX "job_runs_job_started_at_idx" ON "job_runs"("job", "started_at" DESC);

-- CreateIndex
CREATE INDEX "email_outbox_status_next_attempt_at_idx" ON "email_outbox"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "email_outbox_created_at_idx" ON "email_outbox"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex
CREATE INDEX "invitations_created_at_idx" ON "invitations"("created_at" DESC);

-- CreateIndex
CREATE INDEX "invitations_user_id_idx" ON "invitations"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "change_requests_status_requested_at_idx" ON "change_requests"("status", "requested_at" DESC);

-- CreateIndex
CREATE INDEX "change_requests_entity_type_entity_id_idx" ON "change_requests"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "finance_income_sources_name_key_key" ON "finance_income_sources"("name_key");

-- CreateIndex
CREATE UNIQUE INDEX "finance_expense_items_name_key_key" ON "finance_expense_items"("name_key");

-- CreateIndex
CREATE UNIQUE INDEX "finance_transactions_code_key" ON "finance_transactions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "finance_transactions_replaces_id_key" ON "finance_transactions"("replaces_id");

-- CreateIndex
CREATE INDEX "finance_transactions_txn_date_idx" ON "finance_transactions"("txn_date" DESC);

-- CreateIndex
CREATE INDEX "finance_transactions_kind_status_txn_date_idx" ON "finance_transactions"("kind", "status", "txn_date");

-- CreateIndex
CREATE INDEX "finance_transactions_income_source_id_idx" ON "finance_transactions"("income_source_id");

-- CreateIndex
CREATE INDEX "finance_transactions_expense_item_id_idx" ON "finance_transactions"("expense_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "finance_transactions_kind_period_year_period_month_seq_key" ON "finance_transactions"("kind", "period_year", "period_month", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "finance_transactions_client_request_id_key" ON "finance_transactions"("client_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "registrations_token_key" ON "registrations"("token");

-- CreateIndex
CREATE INDEX "registrations_status_updated_at_idx" ON "registrations"("status", "updated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "people_registration_id_key" ON "people"("registration_id");

-- CreateIndex
CREATE INDEX "people_stage_idx" ON "people"("stage");

-- CreateIndex
CREATE INDEX "people_full_name_idx" ON "people"("full_name");

-- CreateIndex
CREATE UNIQUE INDEX "people_member_number_key" ON "people"("member_number");

-- CreateIndex
CREATE INDEX "person_stage_events_person_id_at_idx" ON "person_stage_events"("person_id", "at");

-- CreateIndex
CREATE INDEX "person_notes_person_id_created_at_idx" ON "person_notes"("person_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "membership_applications_status_submitted_at_idx" ON "membership_applications"("status", "submitted_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "foundation_groups_name_key" ON "foundation_groups"("name");

-- CreateIndex
CREATE INDEX "foundation_enrollments_group_id_idx" ON "foundation_enrollments"("group_id");

-- CreateIndex
CREATE INDEX "foundation_attendance_enrollment_id_idx" ON "foundation_attendance"("enrollment_id");

-- CreateIndex
CREATE INDEX "registration_reminders_registration_id_idx" ON "registration_reminders"("registration_id");

-- CreateIndex
CREATE UNIQUE INDEX "api_clients_key_hash_key" ON "api_clients"("key_hash");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_impersonation_id_fkey" FOREIGN KEY ("impersonation_id") REFERENCES "impersonation_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_key_fkey" FOREIGN KEY ("permission_key") REFERENCES "permissions"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_income_source_id_fkey" FOREIGN KEY ("income_source_id") REFERENCES "finance_income_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_expense_item_id_fkey" FOREIGN KEY ("expense_item_id") REFERENCES "finance_expense_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_replaces_id_fkey" FOREIGN KEY ("replaces_id") REFERENCES "finance_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_stage_events" ADD CONSTRAINT "person_stage_events_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_notes" ADD CONSTRAINT "person_notes_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_applications" ADD CONSTRAINT "membership_applications_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "foundation_enrollments" ADD CONSTRAINT "foundation_enrollments_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "foundation_enrollments" ADD CONSTRAINT "foundation_enrollments_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "foundation_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "foundation_attendance" ADD CONSTRAINT "foundation_attendance_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "foundation_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration_reminders" ADD CONSTRAINT "registration_reminders_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- One church, and only one.
--
-- This system is deployed per church. A second church gets its own deployment
-- and its own database, which is why no other table carries a church id. The
-- constraint is here so that stops being a convention and becomes a fact.
-- ---------------------------------------------------------------------------

alter table "church" add constraint church_is_a_singleton check (id = 1);

-- The church code is printed on every finance entry, so it may not change once
-- entries exist: IRCA-EXP-2026-09-000001 must keep meaning what it meant.
create or replace function church_code_is_frozen() returns trigger as $$
begin
  if new.code is distinct from old.code
     and exists (select 1 from finance_transactions limit 1) then
    raise exception 'the church code cannot change once there are finance entries';
  end if;
  return new;
end $$ language plpgsql;

create trigger church_code_frozen before update on "church"
  for each row execute function church_code_is_frozen();

-- ---------------------------------------------------------------------------
-- What the running app may not do, whatever its code says.
--
-- These are not about keeping churches apart — there is only one. They are
-- what makes the books and the activity log worth trusting: the application
-- role can add to them and read them, and cannot rewrite history. A finance
-- entry changes only through an approved change request (D17), applied by the
-- owner role in a migration or by the request handler, never by a stray update.
-- ---------------------------------------------------------------------------

grant usage on schema public to irca_app;
grant select, insert, update, delete on all tables in schema public to irca_app;
grant usage, select on all sequences in schema public to irca_app;

alter default privileges for role irca_owner in schema public
  grant select, insert, update, delete on tables to irca_app;
alter default privileges for role irca_owner in schema public
  grant usage, select on sequences to irca_app;

-- The activity log is append-only. Nobody rewrites what happened.
revoke update, delete, truncate on table audit_events from irca_app;

-- Finance entries are never deleted. They are voided or superseded, and the
-- columns that may move are named one by one.
revoke delete, truncate on table finance_transactions from irca_app;

-- The migration log is nothing the app needs.
do $$
begin
  if to_regclass('public._prisma_migrations') is not null then
    revoke all on table _prisma_migrations from irca_app;
  end if;
end $$;

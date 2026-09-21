-- CreateEnum
CREATE TYPE "PersonStage" AS ENUM ('VISITOR', 'NEW_CONVERT', 'FOUNDATION_CLASS', 'AWAITING_BAPTISM', 'MEMBERSHIP_REVIEW', 'CONFIRMED_MEMBER');

-- CreateEnum
CREATE TYPE "PersonNoteKind" AS ENUM ('NOTE', 'VISIT', 'CALL');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CONFIRMED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "AttendanceMark" AS ENUM ('ATTENDED', 'MISSED');

-- DropIndex
DROP INDEX "finance_expense_items_name_trgm";

-- DropIndex
DROP INDEX "finance_income_sources_name_trgm";

-- CreateTable
CREATE TABLE "registrations" (
    "id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
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
    "church_id" UUID NOT NULL,
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
    "church_id" UUID NOT NULL,
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
    "church_id" UUID NOT NULL,
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
    "church_id" UUID NOT NULL,
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
    "church_id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "foundation_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "foundation_enrollments" (
    "id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "enrolled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "dropped_at" TIMESTAMPTZ(6),

    CONSTRAINT "foundation_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "foundation_attendance" (
    "church_id" UUID NOT NULL,
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
    "church_id" UUID NOT NULL,
    "registration_id" UUID NOT NULL,
    "channel" VARCHAR(20) NOT NULL,
    "sent_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registration_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "church_settings" (
    "church_id" UUID NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "church_settings_pkey" PRIMARY KEY ("church_id","key")
);

-- CreateTable
CREATE TABLE "api_clients" (
    "id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
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
CREATE UNIQUE INDEX "registrations_token_key" ON "registrations"("token");

-- CreateIndex
CREATE INDEX "registrations_church_id_status_updated_at_idx" ON "registrations"("church_id", "status", "updated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "registrations_church_id_id_key" ON "registrations"("church_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "people_registration_id_key" ON "people"("registration_id");

-- CreateIndex
CREATE INDEX "people_church_id_stage_idx" ON "people"("church_id", "stage");

-- CreateIndex
CREATE INDEX "people_church_id_full_name_idx" ON "people"("church_id", "full_name");

-- CreateIndex
CREATE UNIQUE INDEX "people_church_id_member_number_key" ON "people"("church_id", "member_number");

-- CreateIndex
CREATE UNIQUE INDEX "people_church_id_id_key" ON "people"("church_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "people_church_id_registration_id_key" ON "people"("church_id", "registration_id");

-- CreateIndex
CREATE INDEX "person_stage_events_church_id_person_id_at_idx" ON "person_stage_events"("church_id", "person_id", "at");

-- CreateIndex
CREATE INDEX "person_notes_church_id_person_id_created_at_idx" ON "person_notes"("church_id", "person_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "membership_applications_church_id_status_submitted_at_idx" ON "membership_applications"("church_id", "status", "submitted_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "foundation_groups_church_id_name_key" ON "foundation_groups"("church_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "foundation_groups_church_id_id_key" ON "foundation_groups"("church_id", "id");

-- CreateIndex
CREATE INDEX "foundation_enrollments_church_id_group_id_idx" ON "foundation_enrollments"("church_id", "group_id");

-- CreateIndex
CREATE UNIQUE INDEX "foundation_enrollments_church_id_id_key" ON "foundation_enrollments"("church_id", "id");

-- CreateIndex
CREATE INDEX "foundation_attendance_church_id_enrollment_id_idx" ON "foundation_attendance"("church_id", "enrollment_id");

-- CreateIndex
CREATE INDEX "registration_reminders_church_id_registration_id_idx" ON "registration_reminders"("church_id", "registration_id");

-- CreateIndex
CREATE UNIQUE INDEX "api_clients_key_hash_key" ON "api_clients"("key_hash");

-- CreateIndex
CREATE INDEX "api_clients_church_id_idx" ON "api_clients"("church_id");

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_church_id_registration_id_fkey" FOREIGN KEY ("church_id", "registration_id") REFERENCES "registrations"("church_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_stage_events" ADD CONSTRAINT "person_stage_events_church_id_person_id_fkey" FOREIGN KEY ("church_id", "person_id") REFERENCES "people"("church_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_notes" ADD CONSTRAINT "person_notes_church_id_person_id_fkey" FOREIGN KEY ("church_id", "person_id") REFERENCES "people"("church_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_applications" ADD CONSTRAINT "membership_applications_church_id_person_id_fkey" FOREIGN KEY ("church_id", "person_id") REFERENCES "people"("church_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "foundation_groups" ADD CONSTRAINT "foundation_groups_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "foundation_enrollments" ADD CONSTRAINT "foundation_enrollments_church_id_person_id_fkey" FOREIGN KEY ("church_id", "person_id") REFERENCES "people"("church_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "foundation_enrollments" ADD CONSTRAINT "foundation_enrollments_church_id_group_id_fkey" FOREIGN KEY ("church_id", "group_id") REFERENCES "foundation_groups"("church_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "foundation_attendance" ADD CONSTRAINT "foundation_attendance_church_id_enrollment_id_fkey" FOREIGN KEY ("church_id", "enrollment_id") REFERENCES "foundation_enrollments"("church_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration_reminders" ADD CONSTRAINT "registration_reminders_church_id_registration_id_fkey" FOREIGN KEY ("church_id", "registration_id") REFERENCES "registrations"("church_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "church_settings" ADD CONSTRAINT "church_settings_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_clients" ADD CONSTRAINT "api_clients_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- The rules the first database kept, and the ones this phase adds.
-- ---------------------------------------------------------------------------

-- Registration is meant to happen once per phone per church. Partial, so the
-- many in-progress rows with an empty phone do not collide with each other.
CREATE UNIQUE INDEX registrations_phone_idx ON registrations (church_id, dial, phone) WHERE phone <> '';

ALTER TABLE registrations
  ADD CONSTRAINT registrations_lang CHECK (lang IN ('en', 'sw', 'fr')),
  ADD CONSTRAINT registrations_status CHECK (status IN ('in_progress', 'submitted'));

-- One open application per person, and one open foundation class sign-up.
CREATE UNIQUE INDEX membership_applications_open_idx ON membership_applications (person_id)
  WHERE status IN ('UNDER_REVIEW', 'APPROVED');
CREATE UNIQUE INDEX foundation_enrollments_open_idx ON foundation_enrollments (person_id)
  WHERE completed_at IS NULL AND dropped_at IS NULL;

-- Church-owned tables: one church at a time for feature code, everything for
-- core, read-only for backups. The same template as every tenant table.
DO $$
declare t text;
begin
  foreach t in array array[
    'registrations', 'people', 'person_stage_events', 'person_notes',
    'membership_applications', 'foundation_groups', 'foundation_enrollments',
    'foundation_attendance', 'registration_reminders', 'church_settings'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for all to irca_app, irca_readonly using (church_id = app_church_id()) with check (church_id = app_church_id())',
      t || '_tenant', t);
    execute format('create policy %I on %I for all to irca_core using (true) with check (true)', t || '_core', t);
    execute format('create policy %I on %I for select to irca_backup using (true)', t || '_backup', t);
  end loop;
end $$;

-- API keys are core's alone: the guard reads one before the request has a
-- church at all, and feature code has no business with them.
ALTER TABLE api_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY api_clients_core ON api_clients FOR ALL TO irca_core USING (true) WITH CHECK (true);
CREATE POLICY api_clients_backup ON api_clients FOR SELECT TO irca_backup USING (true);

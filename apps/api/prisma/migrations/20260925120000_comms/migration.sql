-- The Communication system (Phase 7): templates, messages and their outbox,
-- beats, blocked numbers, what Beem sends back, and the Beem account; and on
-- people and staff, the language they are written to in and whether they
-- want messages at all (D21, D22, D25, D26, D28).

-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('DRAFT', 'PENDING', 'ACTIVE', 'REJECTED', 'RETIRED');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('SCHEDULED', 'SENDING', 'SENT', 'PARTIAL', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RecipientStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'DELIVERED', 'FAILED', 'CANCELLED', 'SKIPPED_OPT_OUT', 'SKIPPED_NO_PHONE', 'SKIPPED_DUPLICATE');

-- AlterTable
ALTER TABLE "people" ADD COLUMN     "lang" VARCHAR(2) NOT NULL DEFAULT 'en',
ADD COLUMN     "sms_opt_out" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sms_opt_out_at" TIMESTAMPTZ(6),
ADD COLUMN     "sms_opt_out_source" VARCHAR(10);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "sms_opt_out" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "comms_audience_grants" (
    "department_id" UUID NOT NULL,
    "audience_key" VARCHAR(60) NOT NULL,
    "granted_by_id" UUID,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comms_audience_grants_pkey" PRIMARY KEY ("department_id","audience_key")
);

-- CreateTable
CREATE TABLE "comms_templates" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "department_id" UUID,
    "name" VARCHAR(80) NOT NULL,
    "status" "TemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "supersedes_id" UUID,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "submitted_by_id" UUID,
    "submitted_at" TIMESTAMPTZ(6),
    "decided_by_id" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "decision_note" VARCHAR(500),

    CONSTRAINT "comms_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comms_template_bodies" (
    "template_id" UUID NOT NULL,
    "lang" VARCHAR(2) NOT NULL,
    "body" VARCHAR(918) NOT NULL,

    CONSTRAINT "comms_template_bodies_pkey" PRIMARY KEY ("template_id","lang")
);

-- CreateTable
CREATE TABLE "comms_messages" (
    "id" UUID NOT NULL,
    "department_id" UUID,
    "audience_key" VARCHAR(60) NOT NULL,
    "audience_params" JSONB NOT NULL DEFAULT '{}',
    "audience_name" VARCHAR(200) NOT NULL,
    "template_id" UUID,
    "schedule_id" UUID,
    "bodies" JSONB NOT NULL,
    "fields" JSONB NOT NULL DEFAULT '{}',
    "status" "MessageStatus" NOT NULL DEFAULT 'SENDING',
    "scheduled_for" TIMESTAMPTZ(6),
    "recipient_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "segments" INTEGER NOT NULL DEFAULT 0,
    "cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "cancelled_by_id" UUID,

    CONSTRAINT "comms_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comms_recipients" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "person_id" UUID,
    "user_id" UUID,
    "phone" VARCHAR(20) NOT NULL,
    "lang" VARCHAR(2) NOT NULL,
    "body" VARCHAR(1200) NOT NULL,
    "segments" INTEGER NOT NULL DEFAULT 1,
    "status" "RecipientStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provider_message_id" VARCHAR(200),
    "last_error" VARCHAR(500),
    "sent_at" TIMESTAMPTZ(6),
    "delivered_at" TIMESTAMPTZ(6),

    CONSTRAINT "comms_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comms_schedules" (
    "id" UUID NOT NULL,
    "department_id" UUID,
    "name" VARCHAR(80) NOT NULL,
    "audience_key" VARCHAR(60) NOT NULL,
    "audience_params" JSONB NOT NULL DEFAULT '{}',
    "audience_name" VARCHAR(200) NOT NULL,
    "template_ids" UUID[],
    "fields" JSONB NOT NULL DEFAULT '{}',
    "days_of_week" INTEGER[],
    "time_of_day" VARCHAR(5) NOT NULL,
    "jitter_minutes" INTEGER NOT NULL DEFAULT 0,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_run_at" TIMESTAMPTZ(6),
    "next_run_at" TIMESTAMPTZ(6),
    "last_error" VARCHAR(500),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "comms_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comms_blocked_numbers" (
    "phone" VARCHAR(20) NOT NULL,
    "reason" VARCHAR(60) NOT NULL,
    "person_id" UUID,
    "blocked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" VARCHAR(200),

    CONSTRAINT "comms_blocked_numbers_pkey" PRIMARY KEY ("phone")
);

-- CreateTable
CREATE TABLE "comms_inbound" (
    "id" UUID NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "phone" VARCHAR(20) NOT NULL DEFAULT '',
    "body" VARCHAR(1000) NOT NULL DEFAULT '',
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" VARCHAR(40) NOT NULL DEFAULT '',
    "raw" JSONB NOT NULL,

    CONSTRAINT "comms_inbound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comms_beem_account" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "api_key_enc" BYTEA NOT NULL,
    "secret_key_enc" BYTEA NOT NULL,
    "key_last4" VARCHAR(4) NOT NULL,
    "sender_id" VARCHAR(11) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by_id" UUID,

    CONSTRAINT "comms_beem_account_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "comms_templates_department_id_status_idx" ON "comms_templates"("department_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "comms_templates_family_id_version_key" ON "comms_templates"("family_id", "version");

-- CreateIndex
CREATE INDEX "comms_messages_created_at_idx" ON "comms_messages"("created_at" DESC);

-- CreateIndex
CREATE INDEX "comms_messages_department_id_created_at_idx" ON "comms_messages"("department_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "comms_messages_status_idx" ON "comms_messages"("status");

-- CreateIndex
CREATE INDEX "comms_recipients_status_next_attempt_at_idx" ON "comms_recipients"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "comms_recipients_message_id_idx" ON "comms_recipients"("message_id");

-- CreateIndex
CREATE INDEX "comms_recipients_phone_idx" ON "comms_recipients"("phone");

-- CreateIndex
CREATE INDEX "comms_recipients_provider_message_id_idx" ON "comms_recipients"("provider_message_id");

-- CreateIndex
CREATE INDEX "comms_schedules_is_active_next_run_at_idx" ON "comms_schedules"("is_active", "next_run_at");

-- CreateIndex
CREATE INDEX "comms_inbound_received_at_idx" ON "comms_inbound"("received_at" DESC);

-- AddForeignKey
ALTER TABLE "comms_audience_grants" ADD CONSTRAINT "comms_audience_grants_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comms_templates" ADD CONSTRAINT "comms_templates_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comms_template_bodies" ADD CONSTRAINT "comms_template_bodies_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "comms_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comms_messages" ADD CONSTRAINT "comms_messages_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comms_messages" ADD CONSTRAINT "comms_messages_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "comms_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comms_messages" ADD CONSTRAINT "comms_messages_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "comms_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comms_recipients" ADD CONSTRAINT "comms_recipients_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "comms_messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comms_recipients" ADD CONSTRAINT "comms_recipients_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comms_schedules" ADD CONSTRAINT "comms_schedules_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Everyone already in People answered the form in some language; that is the
-- one they are written to in. From now on the form's own code copies it.
update people p set lang = r.lang from registrations r where r.id = p.registration_id;

-- The Beem account is a single row, like the church itself, and nobody viewed
-- as someone ever needs the sealed key.
alter table comms_beem_account add constraint comms_beem_account_singleton check (id = 1);
revoke select on table comms_beem_account from irca_readonly;

-- History is a record: it may be added to, never rewritten or removed. Only
-- what moves as a message is sent can change, and nothing at all of what Beem
-- told us. (Erasing a person, as the owner, still takes their rows.)
revoke delete, truncate on table comms_messages, comms_recipients, comms_inbound from irca_app;
revoke update on table comms_messages, comms_recipients, comms_inbound from irca_app;
grant update (status, started_at, finished_at, cancelled_by_id) on table comms_messages to irca_app;
grant update (status, attempts, next_attempt_at, provider_message_id, last_error, sent_at,
              delivered_at) on table comms_recipients to irca_app;

-- A template is retired, never deleted, so the history keeps meaning something;
-- the same for a beat, which is archived.
revoke delete, truncate on table comms_templates, comms_schedules from irca_app;

-- The words are what was approved. Once a template has been submitted, its
-- bodies never change again, in any language: a change is a new version,
-- approved on its own (07 step 7.9). Only a draft's words may be written.
create function comms_template_body_guard() returns trigger as $$
declare
  template_id uuid := coalesce(new.template_id, old.template_id);
  current_status text;
begin
  select status::text into current_status from comms_templates where id = template_id;
  if current_status is distinct from 'DRAFT' then
    raise exception 'The words of a % template cannot change; make a new version', current_status
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql;

create trigger comms_template_body_guard
  before insert or update or delete on comms_template_bodies
  for each row execute function comms_template_body_guard();

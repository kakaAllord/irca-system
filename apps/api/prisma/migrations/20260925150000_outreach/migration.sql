-- Outreach's own tables (Phase 8). The team is the Outreach department's
-- leaders and members (D28), so there is no team table: these point at people.

-- CreateEnum
CREATE TYPE "OutreachSessionStatus" AS ENUM ('PLANNED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "outreach_groups" (
    "id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outreach_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_group_members" (
    "group_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,

    CONSTRAINT "outreach_group_members_pkey" PRIMARY KEY ("group_id","person_id")
);

-- CreateTable
CREATE TABLE "outreach_sessions" (
    "id" UUID NOT NULL,
    "held_on" DATE NOT NULL,
    "title" VARCHAR(80) NOT NULL DEFAULT '',
    "status" "OutreachSessionStatus" NOT NULL DEFAULT 'PLANNED',
    "notes" VARCHAR(2000) NOT NULL DEFAULT '',
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outreach_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_session_teams" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "group_id" UUID,
    "area" VARCHAR(80) NOT NULL,
    "spoken_to_only" INTEGER NOT NULL DEFAULT 0,
    "notes" VARCHAR(1000) NOT NULL DEFAULT '',

    CONSTRAINT "outreach_session_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_session_team_members" (
    "team_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,

    CONSTRAINT "outreach_session_team_members_pkey" PRIMARY KEY ("team_id","person_id")
);

-- CreateTable
CREATE TABLE "outreach_reached" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "session_id" UUID,
    "team_id" UUID,
    "reached_on" DATE NOT NULL,
    "area" VARCHAR(80) NOT NULL DEFAULT '',
    "reached_by_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "needs_follow_up" BOOLEAN NOT NULL DEFAULT true,
    "note" VARCHAR(1000) NOT NULL DEFAULT '',
    "recorded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outreach_reached_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_trainings" (
    "id" UUID NOT NULL,
    "topic" VARCHAR(120) NOT NULL,
    "trainer" VARCHAR(80) NOT NULL DEFAULT '',
    "held_at" TIMESTAMPTZ(6) NOT NULL,
    "venue" VARCHAR(80) NOT NULL DEFAULT '',
    "notes" VARCHAR(2000) NOT NULL DEFAULT '',
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outreach_trainings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_training_attendance" (
    "training_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "mark" "AttendanceMark" NOT NULL,
    "marked_by_id" UUID NOT NULL,
    "marked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outreach_training_attendance_pkey" PRIMARY KEY ("training_id","person_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "outreach_groups_name_key" ON "outreach_groups"("name");

-- CreateIndex
CREATE INDEX "outreach_group_members_person_id_idx" ON "outreach_group_members"("person_id");

-- CreateIndex
CREATE INDEX "outreach_sessions_held_on_idx" ON "outreach_sessions"("held_on" DESC);

-- CreateIndex
CREATE INDEX "outreach_session_teams_session_id_idx" ON "outreach_session_teams"("session_id");

-- CreateIndex
CREATE INDEX "outreach_session_team_members_person_id_idx" ON "outreach_session_team_members"("person_id");

-- CreateIndex
CREATE INDEX "outreach_reached_reached_on_idx" ON "outreach_reached"("reached_on" DESC);

-- CreateIndex
CREATE INDEX "outreach_reached_person_id_idx" ON "outreach_reached"("person_id");

-- CreateIndex
CREATE INDEX "outreach_reached_session_id_idx" ON "outreach_reached"("session_id");

-- CreateIndex
CREATE INDEX "outreach_trainings_held_at_idx" ON "outreach_trainings"("held_at" DESC);

-- CreateIndex
CREATE INDEX "outreach_training_attendance_person_id_idx" ON "outreach_training_attendance"("person_id");

-- AddForeignKey
ALTER TABLE "outreach_group_members" ADD CONSTRAINT "outreach_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "outreach_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_group_members" ADD CONSTRAINT "outreach_group_members_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_session_teams" ADD CONSTRAINT "outreach_session_teams_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "outreach_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_session_teams" ADD CONSTRAINT "outreach_session_teams_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "outreach_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_session_team_members" ADD CONSTRAINT "outreach_session_team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "outreach_session_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_session_team_members" ADD CONSTRAINT "outreach_session_team_members_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_reached" ADD CONSTRAINT "outreach_reached_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_reached" ADD CONSTRAINT "outreach_reached_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "outreach_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_reached" ADD CONSTRAINT "outreach_reached_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "outreach_session_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_training_attendance" ADD CONSTRAINT "outreach_training_attendance_training_id_fkey" FOREIGN KEY ("training_id") REFERENCES "outreach_trainings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_training_attendance" ADD CONSTRAINT "outreach_training_attendance_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A count of people spoken to cannot go below nothing.
alter table outreach_session_teams add constraint outreach_session_teams_spoken_to_only_check
  check (spoken_to_only >= 0);

-- Who was reached, and when, is a record: it may be filled in later, never
-- rewritten or removed. Only the follow-up flag, the area and the note change.
revoke delete, truncate on table outreach_reached from irca_app;
revoke update on table outreach_reached from irca_app;
grant update (needs_follow_up, area, note) on table outreach_reached to irca_app;

-- Sessions, groups and trainings are closed, switched off or kept, never
-- deleted, so what happened on last year's Saturdays keeps its answer.
-- Erasing a person (person:erase, as the owner) still takes their rows with
-- them through the foreign keys.
revoke delete, truncate on table outreach_sessions, outreach_groups, outreach_trainings from irca_app;

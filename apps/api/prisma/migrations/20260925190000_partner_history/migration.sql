-- Partnerships are not bound to a season (owner, 25 Sept 2026), but who went
-- out with whom, from when until when, is kept. A group's members become
-- dated rows: a change to a group ends the rows of whoever left and starts
-- rows for whoever joined.
ALTER TABLE "outreach_group_members" DROP CONSTRAINT "outreach_group_members_pkey",
ADD COLUMN "id" UUID NOT NULL DEFAULT gen_random_uuid(),
ADD COLUMN "added_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "ended_at" TIMESTAMPTZ(6),
ADD CONSTRAINT "outreach_group_members_pkey" PRIMARY KEY ("id");
-- The application makes the ids from now on, as it does for every table.
ALTER TABLE "outreach_group_members" ALTER COLUMN "id" DROP DEFAULT;

-- Those already in a group have been since it was made.
UPDATE "outreach_group_members" m SET "added_at" = g."created_at"
FROM "outreach_groups" g WHERE g."id" = m."group_id";

CREATE INDEX "outreach_group_members_group_id_idx" ON "outreach_group_members"("group_id");
-- One open row per person per group.
CREATE UNIQUE INDEX "outreach_group_members_open_idx" ON "outreach_group_members"("group_id", "person_id")
WHERE "ended_at" IS NULL;

-- The history is added to and ended, never rewritten or removed by the
-- application. Erasing a person (person:erase, as the owner) still takes
-- their rows with them.
revoke delete, truncate on table outreach_group_members from irca_app;
revoke update on table outreach_group_members from irca_app;
grant update (ended_at) on table outreach_group_members to irca_app;

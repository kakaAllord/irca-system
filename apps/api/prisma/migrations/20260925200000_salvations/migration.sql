-- The team reports how many it reached and how many gave their life to
-- Christ (owner, 25 Sept 2026): a tick on each person recorded, and a
-- number for those spoken to without taking details.
ALTER TABLE "outreach_reached" ADD COLUMN "saved" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "outreach_session_teams" ADD COLUMN "saved_only" INTEGER NOT NULL DEFAULT 0;

-- Of those spoken to without details, never more saved than there were.
alter table outreach_session_teams add constraint outreach_session_teams_saved_only_check
  check (saved_only >= 0 and saved_only <= spoken_to_only);

-- Whether someone was saved may be filled in afterwards, like the area and
-- the note; nothing else about a reach changes.
grant update (saved) on table outreach_reached to irca_app;

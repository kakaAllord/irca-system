-- One timeline per person, written by every portal (D23), and where each
-- person came from.

-- CreateEnum
CREATE TYPE "InteractionKind" AS ENUM ('EVANGELISED', 'CALL', 'VISIT', 'INVITED', 'ATTENDED_SERVICE', 'TRAINING', 'REGISTERED', 'CLASS_SESSION', 'APPLIED', 'CONFIRMED', 'NOTE');

-- AlterTable
ALTER TABLE "people" ADD COLUMN     "source" VARCHAR(10) NOT NULL DEFAULT 'FORM';

-- CreateTable
CREATE TABLE "person_interactions" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "kind" "InteractionKind" NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL,
    "module_key" VARCHAR(30) NOT NULL,
    "by_id" UUID,
    "summary" VARCHAR(200) NOT NULL,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "person_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "person_interactions_person_id_at_idx" ON "person_interactions"("person_id", "at" DESC);

-- CreateIndex
CREATE INDEX "person_interactions_kind_at_idx" ON "person_interactions"("kind", "at" DESC);

-- AddForeignKey
ALTER TABLE "person_interactions" ADD CONSTRAINT "person_interactions_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Everyone already here came through the form, or was typed in by the office.
update people set source = 'OFFICE' where registration_id is null;

-- The timeline starts with what the church already knows, so a person's page
-- tells their whole story from the first day rather than from this migration.
-- Ids are UUID v7 made from when each thing happened, so they sort like the
-- ones the application writes; built here rather than with Postgres 18's
-- uuidv7() so the migration runs on whatever version the host has.
create function pg_temp.uuid7_at(ts timestamptz) returns uuid as $$
  select encode(
    set_bit(set_bit(
      overlay(uuid_send(gen_random_uuid())
        placing substring(int8send((extract(epoch from ts) * 1000)::bigint) from 3)
        from 1 for 6),
      52, 1), 53, 1),
    'hex')::uuid
$$ language sql volatile;

insert into person_interactions (id, person_id, kind, at, module_key, by_id, summary, meta)
select pg_temp.uuid7_at(r.submitted_at), p.id, 'REGISTERED', r.submitted_at, 'membership', null,
       'Filled in the registration form', jsonb_build_object('registrationId', r.id)
from people p join registrations r on r.id = p.registration_id
where r.status = 'submitted' and r.submitted_at is not null;

insert into person_interactions (id, person_id, kind, at, module_key, by_id, summary, meta)
select pg_temp.uuid7_at(a.submitted_at), a.person_id, 'APPLIED', a.submitted_at, 'membership',
       a.submitted_by_id,
       case when a.source = 'FORM' then 'Asked to join the church, on the registration form'
            else 'Applied for membership' end,
       jsonb_build_object('applicationId', a.id)
from membership_applications a;

insert into person_interactions (id, person_id, kind, at, module_key, by_id, summary, meta)
select pg_temp.uuid7_at(a.confirmed_at), a.person_id, 'CONFIRMED', a.confirmed_at, 'membership',
       a.confirmed_by_id, 'Confirmed as a member', jsonb_build_object('applicationId', a.id)
from membership_applications a
where a.confirmed_at is not null;

insert into person_interactions (id, person_id, kind, at, module_key, by_id, summary, meta)
select pg_temp.uuid7_at(fa.marked_at), e.person_id, 'CLASS_SESSION', fa.marked_at, 'membership',
       fa.marked_by_id, 'Foundation class, session ' || fa.session_no || ', ' || g.name,
       jsonb_build_object('enrollmentId', e.id, 'sessionNo', fa.session_no)
from foundation_attendance fa
join foundation_enrollments e on e.id = fa.enrollment_id
join foundation_groups g on g.id = e.group_id
where fa.mark = 'ATTENDED';

-- A call or a visit the follow-up team logged, without what they wrote: the
-- note stays behind Membership's sensitive permission.
insert into person_interactions (id, person_id, kind, at, module_key, by_id, summary, meta)
select pg_temp.uuid7_at(n.created_at), n.person_id, n.kind::text::"InteractionKind", n.created_at,
       'membership', n.author_id,
       case when n.kind = 'CALL' then 'Phone call' else 'Home visit' end,
       jsonb_build_object('noteId', n.id)
from person_notes n
where n.kind in ('CALL', 'VISIT');

-- A timeline that can be tidied up is not a timeline. Erasing a person
-- (person:erase, as the owner) still takes theirs with them.
revoke update, delete, truncate on table person_interactions from irca_app;

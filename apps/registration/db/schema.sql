-- IRCA registration — one row per visitor, written to on every Continue.
--
-- Why one wide typed table rather than an EAV answers(key, value) table:
-- the flow is fixed and ships with the church, and the office wants to ask
-- plain questions of it ("how many first-time visitors last Sunday", "who
-- asked for baptism") without pivoting. Multi-answer questions use text[],
-- which pg maps natively, so nothing here needs an ORM.

create table if not exists registrations (
  id                bigserial primary key,

  -- Identity of the submission. The admin sends this by SMS to a phone that
  -- has never seen our cookie, so the token is the identity; the cookie is
  -- only a same-device convenience.
  token             text not null unique,

  -- Chosen once on the language screen and never offered again: the returning
  -- visitor is greeted in their own language with no picker in sight.
  lang              text not null default 'en' check (lang in ('en','sw','fr')),

  status            text not null default 'in_progress'
                      check (status in ('in_progress','submitted')),

  -- Where they are now, and the deepest they ever got. The two differ once
  -- someone walks back to change an answer, and drop-off has to be measured
  -- against the furthest point or going back would read as giving up.
  current_step      text,
  furthest_step     text,

  -- how you heard
  heard             text[] not null default '{}',
  heard_other_text  text   not null default '',
  friend_name       text   not null default '',

  -- about you
  fullname          text not null default '',
  gender            text not null default '',
  age               text not null default '',

  -- what brings you here
  visit             text[] not null default '{}',
  visit_other_text  text   not null default '',

  -- where you live / where you are visiting from
  where_at          text not null default '',
  ward              text not null default '',
  ward_other        text not null default '',
  region            text not null default '',
  country           text not null default '',
  stay              text not null default '',
  often             text not null default '',

  -- contact. dial_cc is the ISO country, which is what the length rules key
  -- off: +1 covers the US, Canada and a dozen more, with different lengths.
  dial_cc           text not null default 'TZ',
  dial              text not null default '+255',
  phone             text not null default '',
  email             text not null default '',

  -- studying or working
  occ               text not null default '',
  school            text not null default '',
  course            text not null default '',
  year              text not null default '',
  profession        text not null default '',

  -- what you would like from us
  interest          text[] not null default '{}',

  -- walk with God (membership path only)
  dob               text not null default '',
  saved             boolean,
  saved_year        text not null default '',
  bapt              boolean,
  bapt_year         text not null default '',
  holy              boolean,
  prev_church       boolean,
  prev_church_name  text not null default '',

  -- family (membership path only)
  marital           text not null default '',
  married_year      text not null default '',
  kids              boolean,
  children          text[] not null default '{}',

  -- where you would love to serve (membership path only)
  ministries        text[] not null default '{}',
  other_ministry    text not null default '',

  -- the open-ended tail
  liked             text not null default '',
  -- Whether they asked to hear more from us. Null until the question is put to
  -- them; false ends the form there, so the two columns below stay empty.
  want_more         boolean,
  prayer            text not null default '',
  -- Retired: the flow no longer asks "anything else on your mind". Kept so the
  -- answers already given to it are not thrown away.
  comments          text not null default '',

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  submitted_at      timestamptz
);

-- The office list: unfinished files first, newest first.
-- `create table if not exists` above is a no-op on a database that already has
-- the table, so a column added after the first deploy needs saying twice.
alter table registrations add column if not exists want_more boolean;

create index if not exists registrations_status_updated_idx
  on registrations (status, updated_at desc);

-- Registration is meant to happen once. A partial index rather than a plain
-- unique constraint, so the many in-progress rows with an empty phone do not
-- collide with each other.
create unique index if not exists registrations_phone_idx
  on registrations (dial, phone)
  where phone <> '';

create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists registrations_touch on registrations;
create trigger registrations_touch before update on registrations
  for each row execute function touch_updated_at();

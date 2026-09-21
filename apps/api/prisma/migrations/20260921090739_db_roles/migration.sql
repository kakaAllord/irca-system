-- Runtime roles. The roles themselves are created outside migrations (locally
-- in plan step 1.5, on Neon in step 6.7), because creating roles, and setting
-- their statement timeouts, needs privileges the migration role must not have.
-- This file only grants.
--
--   irca_core      core code: sign-in, sessions, audit, jobs. Sees every church.
--   irca_app       feature modules. Row-level security (Phase 2) limits it to one church.
--   irca_readonly  impersonated requests: reads only.
--   irca_backup    nightly dumps: reads only.

grant usage on schema public to irca_core, irca_app, irca_readonly, irca_backup;

-- Everything that exists now...
grant select, insert, update, delete on all tables in schema public to irca_core, irca_app;
grant usage, select on all sequences in schema public to irca_core, irca_app;
grant select on all tables in schema public to irca_readonly, irca_backup;

-- ...and everything later migrations create (they run as irca_owner).
alter default privileges for role irca_owner in schema public
  grant select, insert, update, delete on tables to irca_core, irca_app;
alter default privileges for role irca_owner in schema public
  grant usage, select on sequences to irca_core, irca_app;
alter default privileges for role irca_owner in schema public
  grant select on tables to irca_readonly, irca_backup;

-- No runtime role needs the migration log. The backup role keeps it: a restore
-- must know which migrations the dump contains.
-- Guarded because Prisma also replays migrations into a throwaway "shadow"
-- database that has no migration log of its own.
do $$
begin
  if to_regclass('public._prisma_migrations') is not null then
    revoke all on table _prisma_migrations from irca_readonly, irca_app, irca_core;
  end if;
end $$;

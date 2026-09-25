-- The nightly backup dumps the database as irca_backup (docs/plan/10, step
-- 10.2). Since D27 no migration had granted that role anything, so a dump as
-- it failed on the first table. This gives it what a backup needs, which is
-- everything, to read: the activity log and the view-as log included, because
-- a backup without them could not put the church back as it was. It can write
-- nothing. The role itself is created outside migrations, with the others
-- (docs/deployment.md §2).

grant usage on schema public to irca_backup;
grant select on all tables in schema public to irca_backup;
grant select on all sequences in schema public to irca_backup;

alter default privileges for role irca_owner in schema public
  grant select on tables to irca_backup;
alter default privileges for role irca_owner in schema public
  grant select on sequences to irca_backup;

-- A restore must know which migrations the dump already contains, so the
-- next deploy runs only the ones after it.
do $$
begin
  if to_regclass('public._prisma_migrations') is not null then
    grant select on table _prisma_migrations to irca_backup;
  end if;
end $$;

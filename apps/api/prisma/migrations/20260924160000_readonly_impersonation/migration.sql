-- Viewing as someone is read-only in three places: the portal hides every
-- button that changes anything, the API refuses every write while a request is
-- impersonating, and the database connection such a request runs on cannot
-- write at all. The last one is what holds when the first two are wrong — a GET
-- that writes by mistake, a guard nobody remembered to apply.
--
-- The init migration granted irca_app alone, and irca_readonly lost its grants
-- with the tenancy work, though it was never about tenancy. This gives it back
-- exactly what a reader needs: every table to select from, nothing to change.
-- The role itself is created outside migrations (plan step 1.5 locally, 6.7 on
-- Neon), since creating roles needs privileges a migration must not have.

grant usage on schema public to irca_readonly;
grant select on all tables in schema public to irca_readonly;

alter default privileges for role irca_owner in schema public
  grant select on tables to irca_readonly;

-- The same line the application role already keeps: the view-as log is for
-- devs, and only through its own function. Someone viewed as never holds the
-- permission that calls it, so a reader gets the church's side of the log only.
revoke select on table audit_events from irca_readonly;
grant execute on function church_audit_events() to irca_readonly;
grant execute on function audit_events_count() to irca_readonly;

-- No runtime role needs the migration log.
do $$
begin
  if to_regclass('public._prisma_migrations') is not null then
    revoke all on table _prisma_migrations from irca_readonly;
  end if;
end $$;

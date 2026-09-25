# Data was lost or damaged

**First, stop it getting worse.** If something is still writing bad data — a
bug, a script, a person — take away the cause before restoring anything:
revoke the person ([revoke-access-now.md](revoke-access-now.md)), or turn the
portal off in **Admin → Portals**, which keeps the data and stops the writes.

## From the host's own backups (the normal way)

**On Railway** (`docs/deploy-railway.md` §2.4): the `Postgres` service's
**Backups** tab holds a daily backup for 6 days and a weekly one for 27.

1. Find the moment just before the damage. **Admin → Activity** and **Dev →
   Logs → What people did** show who changed what, and when.
2. Pick the last backup from before it. Railway restores a backup as a new
   volume in place of the current one, so **everything written since that
   backup is lost**. If only a few rows are wrong, use the nightly dump
   instead (below): restoring it into a scratch database lets you copy back
   just those rows.
3. Restore, then redeploy the API, so its connections start fresh, and tell
   the office what to re-enter.

**On Neon** (`docs/deployment.md` §2): Neon keeps every change for its plan's
history window (look it up on Neon's pricing page; it has changed more than
once). In Neon → Branches, create a branch from `main` **at that time**,
named `restore-<date>`. That copies nothing and touches nothing in
production. Connect to it as `irca_owner` and look. For a few lost rows, copy
them back into `main` by hand, as the owner, in a transaction, and write down
what you copied. If everything is wrong, restore `main` to that time
(Branches → main → Restore), then redeploy the API. Delete the branch after.

Finance entries are never deleted by the app, so a "lost" entry is usually a
void, which is corrected with a change request, not a restore.

## From the nightly dump

Every night an encrypted dump of the whole database goes to a bucket that is
not on the database's platform (`docs/deploy-railway.md` §9). It is the copy
that survives losing the account, the platform or the host's backups. You
need one of the two private keys (`irca-backup-<name>.key`), held offline by
the owner and a pastor, and [age](https://age-encryption.org), `pg_restore`
and `psql` (PostgreSQL 18) on your computer.

1. **Download** the newest `irca-<date>.dump.age` from the bucket's dashboard
   (or the one from just before the damage; 30 nights are kept).
2. **Decrypt** it on your own computer, never on a server:

   ```bash
   age --decrypt --identity irca-backup-<name>.key \
     --output irca.dump irca-<date>.dump.age
   ```

3. **Make an empty database to restore into.** Never restore over the live
   one. On Railway, a new environment's Postgres, or a second database on the
   same server (`create database irca_restore owner irca_owner;` from
   `railway connect Postgres`); on Neon, a new branch, emptied. The four
   roles must exist there (`docs/deploy-railway.md` §2.2), since the dump
   carries their grants.
4. **Restore**, as `irca_owner`:

   ```bash
   pg_restore --no-owner --exit-on-error \
     --dbname "postgresql://irca_owner:<password>@<host>:<port>/irca_restore" irca.dump
   ```

   A church-sized database restores in a minute or two.
5. **Check it:** point an API at it (`DATABASE_URL`, `DATABASE_URL_READONLY`
   and `DIRECT_DATABASE_URL`, as in `apps/api/.env`), `npm run db:deploy -w
   @irca/api` (it should say there is nothing to apply, or apply only
   migrations newer than the dump), sign in, and look for yesterday's finance
   entries and registrations.
6. **Then decide**, as above: copy the rows you need back into production, or
   make the restored database the production one by pointing the API's three
   URLs at it and redeploying.
7. **Delete `irca.dump`** from your computer once you are done: it is the
   whole church, unencrypted.

### The restore drill

Before launch, and then every three months, do steps 1 to 5 above for real,
into a scratch database, then delete it. Write down each drill here. If the
drill takes much longer than last time, find out why before you need it.

| Date | Who | Backup restored | How long, download to signed in | Notes |
| --- | --- | --- | --- | --- |
| 25 Sept 2026 | Claude, for the owner | a local scratch copy at ten times today's data, through a local stand-in for the bucket | about 1 minute | The script and these steps, proved on a development machine: backup, download, decrypt with the second keyholder's key, restore, same rows, grants and triggers, migrations up to date. **Not the real drill**: that is the owner's, on staging, with the real keys. |

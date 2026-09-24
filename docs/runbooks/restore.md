# Data was lost or damaged

**First, stop it getting worse.** If something is still writing bad data — a
bug, a script, a person — take away the cause before restoring anything:
revoke the person ([revoke-access-now.md](revoke-access-now.md)), or turn the
portal off in **Admin → Portals**, which keeps the data and stops the writes.

## From Neon's history (the normal way)

Neon keeps every change for its history window (7 days on the free plan, more
on paid ones). Nothing needs to have been set up in advance.

1. Find the moment just before the damage. **Admin → Activity** and **Dev →
   Logs → What people did** show who changed what, and when.
2. In Neon → Branches, create a branch from `main` **at that time**. Name it
   `restore-<date>`. This copies nothing and touches nothing in production.
3. Connect to the branch as `irca_owner` and look: is the data there, and
   right?
4. Decide:
   - **A few rows lost** (the usual case): copy them back from the branch
     into `main` by hand, as the owner, in a transaction, and write down what
     you copied. Finance entries are never deleted by the app, so a
     "lost" entry is usually a void, which is corrected with a change request,
     not a restore.
   - **Everything is wrong**: in Neon, restore `main` to that time
     (Branches → main → Restore). Everything written since is lost, so tell
     the office what to re-enter. Then redeploy the API, so its pooled
     connections start fresh.
5. Delete the `restore-…` branch when finished.

## From the nightly dump

Not built yet: backups beyond Neon's own history, and the restore drill, are
Phase 10 (`docs/plan/10-strengthening.md`), which starts when the owner says
so. Until then Neon's history is the only restore there is, which is why this
page's first section matters.

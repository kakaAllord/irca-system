# Someone asks for everything about them to be erased

Tanzania's Personal Data Protection Act (2022) lets a person ask for their data
to be erased. `docs/data-inventory.md` says what is held about whom.

1. **Confirm who is asking.** The request must come from the person
   themselves, or someone they have authorised, and the office must be sure
   which record is theirs. Write down who asked, when, and how you confirmed it.
2. **Find their id.** Portal → **Membership → Members → the person**; the id is
   the last part of the page's address.
3. **See what would go**, without changing anything:

   ```bash
   node apps/api/dist/cli/main.js person:erase --person <id> --dry-run
   ```

4. **Erase.** The command shows their name and phone and asks for the id to be
   typed back:

   ```bash
   node apps/api/dist/cli/main.js person:erase --person <id>
   ```

   Their registration and answers (prayer requests included), notes, journey,
   application, class and Outreach records are deleted. The activity log keeps its
   lines, with their name replaced by "[erased]". Finance entries are not
   touched: they are money, and name no visitor. Their pledges and the
   payments towards them are not deleted either — pledges are never deleted
   (`docs/modules/pledges-brief.md`) — but they stop belonging to anyone: the
   report's "pledges kept, unnamed" line says how many.
5. **Check the Saturday reports by hand.** Erasure cannot reach inside a PDF.
   Step 3's dry run ends with the reports of every Saturday they were reached
   on or went out on, earlier versions included — run it **before** step 4,
   because erasing takes the rows that say which Saturdays those were, and
   keep the list. For each: Portal → **Outreach → Saturdays → that date →
   Report**, and read it. Where it names them, ask the Outreach leader to
   attach a version without them. The version with their name is then kept
   as an earlier version, so remove it too: delete its file from the volume,
   from a shell on the `api` service (Railway → the service → its shell, or
   `railway ssh`), `rm "$FILES_DIR/<the key>"`, then its row, as the database
   owner:

   ```sql
   delete from files where key = '<the key>';
   ```

   The application cannot delete file rows, which is why this is done by hand.
6. **Reply** to the person that it is done, within the time the Act allows.

It cannot be undone, except by restoring the database
([restore.md](restore.md)) — which would also bring back what was erased, so
after a restore, erase them again.

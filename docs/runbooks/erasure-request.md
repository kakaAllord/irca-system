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
   application and class records are deleted. The activity log keeps its
   lines, with their name replaced by "[erased]". Finance entries are not
   touched: they are money, and name no visitor.
5. **Reply** to the person that it is done, within the time the Act allows.

It cannot be undone, except by restoring the database
([restore.md](restore.md)) — which would also bring back what was erased, so
after a restore, erase them again.

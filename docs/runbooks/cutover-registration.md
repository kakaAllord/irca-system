# Moving the registration form onto this system

The form has run on its own database since before this system existed. The
cutover moves it onto the API, on a **Sunday evening after the last service**,
with two people: one runs the commands, the other checks. The full reasoning
is in `docs/plan/05-registration-and-membership.md`, step 5.18; this page is
the version to follow.

`$OLD_PROD_URL` is the old database's connection string, as `irca_owner`
would use it (read access is enough for the import).

## A week before

1. Production is deployed ([../deployment.md](../deployment.md)): the church
   is set up, Membership is on, and the pastors and office have their roles.
2. **Production key:** Dev → Settings → New key, "Registration form
   (production)". In Vercel → the registration project, set
   `REGISTRATION_API_KEY` for **Production** only.
3. **Preview key:** make a key on the **staging** API the same way, and set it
   with `API_INTERNAL_URL=https://api-staging.<domain>` and
   `REGISTRATION_BACKEND=api` for **Preview** only. Previews then write to
   staging, never to the church's real data.
4. Set `API_INTERNAL_URL=https://api.<domain>` for **Production**, but leave
   `REGISTRATION_BACKEND=db` there.
5. Open a preview deployment and walk the whole form. The rows appear in the
   staging portal.
6. Import, first as a dry run and then for real:

   ```bash
   node apps/api/dist/cli/main.js registrations:import --from "$OLD_PROD_URL" --dry-run
   node apps/api/dist/cli/main.js registrations:import --from "$OLD_PROD_URL"
   ```

   The report must say every count is equal. The pastors check the Members page
   against what they know.

## On the evening (T = start)

| Time | Step | Check |
| --- | --- | --- |
| T+0 | Import again (it brings across only what changed). | Report equal. |
| T+2 | Vercel → registration → Production: `REGISTRATION_BACKEND=api`. Redeploy production. | The deploy is green. |
| T+5 | Import again, for anything saved to the old database during the deploy. | A small "changed", and the report equal. |
| T+6 | On a phone, start and finish a registration on the production address; it appears in **Membership → Members**. Then open an **old** link from the unfinished list; it carries on where that person stopped. | Both work. |
| T+15 | Import one last time. | **0 changes.** The old database is no longer written to. |
| T+16 | In Neon, make the old database read-only: `alter role <old role> set default_transaction_read_only = on`. Keep it for 90 days. | A write through the old path fails. |
| T+20 | In `apps/registration/vercel.json`, change `buildCommand` to `next build`, commit, and remove `DATABASE_URL` from Vercel **after** that deploy succeeds. | The next deploy builds without the old database. |

## Rollback

Only in the first 48 hours, and only for a real breakage:

1. Let the old database be written again: `alter role <old role> set default_transaction_read_only = off`.
2. Copy back what was registered since the switch:

   ```bash
   node apps/api/dist/cli/main.js registrations:export-back --to "$OLD_PROD_URL" --since <T+2, as an ISO time>
   ```

3. Vercel → registration → Production: `REGISTRATION_BACKEND=db`. Redeploy.
4. Write down what broke, and fix it before trying again.

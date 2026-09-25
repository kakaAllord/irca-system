# Changing the registration form's key

The visitor's form signs in to the API with a key. Change it if it may have
leaked (it was pasted somewhere, a laptop with it was lost, someone with
access to Vercel left), and otherwise once a year.

The order matters: the new key is live before the old one stops, so the form
never goes down.

1. **Make the new key.** Portal → **Dev → Settings → Registration form keys →
   New key**, named after where it runs ("Registration form on Vercel,
   2026-09"). Copy it: it is shown once. (Or on the API host:
   `node apps/api/dist/cli/main.js api-client:create --name "…"`.)
2. **Put it in the form.** Vercel → the registration project → Settings →
   Environment Variables → `REGISTRATION_API_KEY`, **Production** only. Save.
3. **Redeploy** the registration project's production deployment, and wait
   for it to be live.
4. **Check** by starting a registration on a phone and saving the first
   screen. In **Dev → Settings**, the new key's *Last used* moves to "just
   now".
5. **Revoke the old key** in **Dev → Settings** (Revoke → Revoke it). Anything
   still using it stops at once.

If the old key leaked and is being abused *now*, revoke it first and accept a
few minutes of the form refusing saves while steps 1–3 happen; a visitor's
answers so far stay on their phone and save once the new key is in.

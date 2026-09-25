# Someone must lose access right now

**From the portal (the normal way).** An administrator opens **Admin → People
→ the person → Disable access**. That signs them out of every browser at once,
ends anyone viewing as them, and stops them signing in again. It is undone the
same way.

**When the portal cannot be used** — the person is the only administrator, or
the portal is down, or they are the developer:

```bash
# Signs them out of every browser now, and stops anyone viewing as them.
node apps/api/dist/cli/main.js sessions:revoke --email someone@example.org
```

That alone does **not** stop them signing in again: their password still
works. Follow it with one of these, the same day:

- disable them in the portal as soon as it can be reached; or
- if they may have someone else's password too, have that person reset theirs
  (`user:send-reset`, which also signs that person out everywhere).

**If they are a developer with access to the hosting.** Revoking their session
is not enough: rotate the database passwords (Neon → Roles → reset password,
then update the host's environment and redeploy), the Resend key, and the
registration form's key ([rotate-registration-key.md](rotate-registration-key.md)),
and remove them from Neon, the API host, Vercel and GitHub.

**Check.** **Admin → Activity** shows the change. In **Dev → Logs → What people
did**, nothing new appears under their name.

# The only administrator cannot get in

**Symptom.** Nobody who can manage people can sign in: the one administrator
forgot their password, left, or locked their account with wrong passwords.

**1. Locked out by wrong passwords?** Wait fifteen minutes. The lock lifts by
itself; nothing needs doing.

**2. Forgot the password, but still has their email.** Send them the same
reset email "Forgot password" sends:

```bash
node apps/api/dist/cli/main.js user:send-reset --email pastor@example.org
```

The API sends it within a minute. The link works once, for one hour, and using
it signs them out everywhere else. If the command says they are *invited* or
*disabled*, it will not send; see below.

**3. Their email is gone, or they have left.** Give a built-in role to someone
else the church trusts, who already has an account:

```bash
node apps/api/dist/cli/main.js role:grant --email secretary@example.org --role admin.administrator
```

Asked for a role that does not exist, the command lists the ones that do. The
grant is in the church's Activity log as done from the command line.

**4. Nobody else has an account either.** Make yourself an account as the
developer, which is an administrator, and invite the right person from
**Admin → People**:

```bash
node apps/api/dist/cli/main.js user:create-dev --email you@example.org --name "Your Name"
```

**Afterwards.** In **Admin → People**, disable the account that was lost if
the person has left. A church should always have two administrators; the
portal already refuses to remove the last one.

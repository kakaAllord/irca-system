# Runbooks

Short pages for the things that go wrong, each with the exact commands. Run
the command line on the API host, from the build:

```bash
node apps/api/dist/cli/main.js <command> [options]
```

(From a checkout with the production environment loaded, `npm run cli -w
@irca/api -- <command>` does the same, building first.) Every command writes
what it did to the church's activity log as "from the command line".

| When | Page |
| --- | --- |
| The only administrator cannot get in | [locked-out-admin.md](locked-out-admin.md) |
| Someone must lose access right now | [revoke-access-now.md](revoke-access-now.md) |
| The registration form's key may have leaked, or it is time to change it | [rotate-registration-key.md](rotate-registration-key.md) |
| Data was lost or damaged | [restore.md](restore.md) |
| Someone asks for everything about them to be erased | [erasure-request.md](erasure-request.md) |
| Moving the registration form onto this system | [cutover-registration.md](cutover-registration.md) |
| A department wants its own portal | [add-a-module.md](add-a-module.md) |

There is no runbook for suspending a church: there is one church, and it is
not suspended by the people who run it (D27). Taking the whole system offline
is the host's own switch.

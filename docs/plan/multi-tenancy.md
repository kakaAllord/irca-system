# Multi-tenancy — retired

**This design was retired on 23 September 2026 by D27** (`00-decisions.md`):
one deployment serves one church, and a second church gets a deployment and a
database of its own. Nothing in this system keeps churches apart any more,
because nothing holds two.

The full text of the retired design — the tenant extension, row-level security
by `church_id`, the control and tenant planes, placements and clusters, the
move tool — is in the history of this file
(`git log --follow docs/plan/multi-tenancy.md`), for anyone who needs to know
why a commit from Phases 1 to 5 looks the way it does.

What it protected that was never about churches is still enforced, and lives
here now:

| Guarantee | Where it is now |
| --- | --- |
| The activity log cannot be rewritten | Grants in the init migration; `docs/plan/appendix-database.md` |
| Only devs can read who viewed as whom (D16) | `select` revoked on `audit_events`; the two `security definer` functions |
| A finance entry changes only through an approved request (D17) | `finance_txn_guard` trigger and the `delete` revoke |
| Viewing as someone cannot write | The read-only role and `Db` (`docs/hardening.md`, access control) |
| No cached answer carries anyone's data | The no-store middleware |
| Raw SQL cannot be built from strings | The `sql` tag and the lint rule |
| One person cannot flood the API | The per-address throttler and the per-person limit |

Phases 7, 8 and 9 were drafted while this design stood and still give their
tables a `church_id`; each is corrected before it is built (D27).

# Load tests

Two [k6](https://k6.io) scripts from Phase 10, step 10.1
(`docs/plan/10-strengthening.md`). Both write real rows, so **run them against
staging, never production**, and put staging back afterwards (below).

| Script            | What it proves                                                                                                                                                           | Passes when                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `registration.js` | A Sunday morning: 200 visitors over 10 minutes, each starting a registration, autosaving while they type, loading every screen, saving each step and sending the form in | 95% of step saves under 400 ms, no request failed, every visitor's form sent in |
| `numbering.js`    | 20 clerks recording 20 expenses each at the same moment                                                                                                                  | 400 entries recorded, with 400 consecutive numbers (checked in SQL, below)      |

## Before you run them

1. Install k6 (<https://grafana.com/docs/k6/latest/set-up/install-k6/>).
2. On staging, in **Dev → Settings → Registration form keys**, make a key
   called `load test`. It is shown once. Revoke it when you are done.
3. For `numbering.js`, a clerk's account on staging (Finance clerk role) and
   at least one active expense item.

## Running

```bash
k6 run -e BASE_URL=https://api-staging.<domain> \
  -e REGISTRATION_KEY=irk_… load/registration.js

k6 run -e BASE_URL=https://api-staging.<domain> \
  -e EMAIL=<clerk email> -e PASSWORD=<clerk password> load/numbering.js
```

`BASE_URL` is the API itself, without `/v1`. `registration.js` also takes
`VISITORS` (200), `MINUTES` (10) and `THINK` (seconds a visitor spends on a
screen, 8; 0 for a quick trial). `numbering.js` takes `CLERKS` (20) and
`EACH` (20).

Each visitor in `registration.js` sends an address of their own, as the
registration form forwards each visitor's address. The API's limits are per
visitor, so without that all two hundred would share one limit. It only works
if `TRUST_PROXY` is right (`docs/deploy-railway.md` §6), which is worth
knowing anyway.

## Checking the numbers

`numbering.js` prints the mark it wrote on every entry
(`load-test <time>`). As the owner, on staging:

```sql
select count(*) as entries,
       count(distinct seq) as distinct_numbers,
       max(seq) - min(seq) + 1 as span,
       min(code) as first, max(code) as last
from finance_transactions
where notes = 'load-test <time>';
```

All three counts must be 400. And no other entry may have been numbered in
between: this must be 0.

```sql
select count(*) from finance_transactions
where kind = 'EXPENSE' and coalesce(notes, '') <> 'load-test <time>'
  and (period_year, period_month) = (
    select period_year, period_month from finance_transactions
    where notes = 'load-test <time>' limit 1)
  and seq between (select min(seq) from finance_transactions where notes = 'load-test <time>')
              and (select max(seq) from finance_transactions where notes = 'load-test <time>');
```

## Putting staging back

The runs leave 200 made-up visitors ("Load Test 3-17") and 400 small
expenses. Finance entries are never deleted by the system, on staging or
anywhere, so do not try. Restore staging from last night's backup instead
(`docs/runbooks/restore.md`, "From the nightly dump"): it puts staging back
and is a restore drill at the same time. Then revoke the `load test` key.

## Results

Write each run here, with the date and where it ran.

| Date         | Where                                                                                                                                       | registration.js                                                                                                                                                                                            | numbering.js                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 25 Sept 2026 | A development machine: the API built for production on one Node process, local PostgreSQL 18, ten times today's data (`db:demo --scale 10`) | 200 visitors, 3,596 requests. Step saves: p95 19 ms, slowest 42 ms. One request failed: a reused connection reset, fixed the same day (keep-alive, `apps/api/src/main.ts`); the rerun after the fix passed | 400 entries, 400 numbers, no gaps, none between (IRCA-EXP-2026-09-000025 to 000424) |
| 25 Sept 2026 | The same, after the keep-alive fix                                                                                                          | **Passed.** 200 visitors, 3,600 requests, none failed, every form sent in. Step saves: p95 19 ms, slowest 27 ms                                                                                            | —                                                                                   |
| _staging_    | _the owner's run: the real result_                                                                                                          |                                                                                                                                                                                                            |                                                                                     |

A development machine says the code is fast enough; only staging says the
host is. The one API instance was nowhere near busy at a Sunday's load, so a
second one is not needed (step 10.1, point 6), and cannot run anyway while
the API has the files volume (`docs/deployment.md` §6b).

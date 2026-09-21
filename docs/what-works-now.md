# What works now, and how to try it

This is the plain-language version of what has been built so far, and how to
check each piece yourself. No jargon where a normal word will do. If something
here does not behave as described, that is a bug worth reporting.

Built so far: **Phase 1** (sign-in), **Phase 2** (the portal frame, roles and
viewing as someone), **Phase 3** (the Admin portal), **Phase 4** (the Finance
portal). Still to come: the registration form moving onto this system and the
Membership portal (Phase 5), and the developer console (Phase 6).

---

## 1. The short version

There are three apps and one shared library:

| Part | What it is |
| --- | --- |
| `apps/api` | The server. Everything goes through it: signing in, permissions, the books, the activity log. |
| `apps/portal` | What staff use in a browser: `/login`, `/admin/…`, `/finance/…`. |
| `apps/registration` | The visitor's registration form, still on its own database until Phase 5. |
| `packages/shared` | The rules both sides need to agree on: what a portal is, what a permission is, what an entry number looks like. |

Every church is separate. Nobody sees another church's people, money or
history, and that is enforced twice: once in the code, once by the database
itself, so a mistake in the code is not enough to leak anything.

---

## 2. Signing in

- One page, `/login`: email and password.
- A wrong password says so, keeps the email and clears the password.
- Too many attempts from the same place are slowed down, and an account that
  keeps failing is locked for a while.
- A link you opened before signing in takes you there afterwards, but only if
  it is a page of this site.
- "Forgot password" sends a one-time link that works once and expires.
- Sessions end after 7 days, or after 12 hours of not being used.
- You can see the browsers you are signed in on, and sign any of them out, on
  the Account page.

**Try it:** sign in as `admin@irca.local` / `admin-password-123`. Then try a
wrong password, then Forgot password (the email appears in the API's terminal
in development).

---

## 3. The portal frame

- A sidebar with the portals this church has turned on, showing only the pages
  you are allowed to open.
- Your name, your roles and a menu to sign out.
- Light and dark, remembered per browser.
- On a phone the sidebar becomes a drawer; everything works at 360 pixels wide.
- A number appears beside **Requests** when something is waiting for you.

---

## 4. People, roles and portals (the Admin portal)

### Inviting someone

An administrator adds an email address and ticks what the person may do. The
person gets an email with a link, chooses their own password, and lands in the
portal with exactly those roles — no more.

- Invitations last 72 hours and work once. They can be resent or cancelled.
- Someone who already has an account in another church gets a link that just
  says "open the portal": they keep their existing password.
- Roles can be changed before the person accepts.
- An administrator can only offer roles from portals this church actually has
  turned on.

### Roles

- Each portal ships with roles to start from (for Finance: viewer, clerk,
  manager). They cannot be edited or deleted; they come from the code.
- An administrator can create their own roles, with any combination of the
  things that portal can do, and each one says in plain words what it allows.
- A role that people hold cannot be deleted until it is taken off them.
- A church cannot be left without an administrator.

### Portals

- The **Portals** page lists what exists. Turning one on creates its built-in
  roles at once; turning it off takes it away from everyone immediately but
  deletes nothing, and turning it back on restores everything.

### Activity

- **Activity** shows what has been changed in this church: who, what, when.
- The log cannot be edited or deleted by the application at all.

### Account

- Your name and phone, your password, and the devices you are signed in on.

**Try it:** People → Invite person → tick *Auditor* → open the link from the
email → set a password → notice the invited person can see People but has no
"Invite person" button.

---

## 5. Viewing as someone (support without surprises)

An administrator can see the portal exactly as another person sees it: one
click on their page, no form, no reason to type.

- It is **read-only**, in three independent ways: the buttons are gone, the
  server refuses every write, and the database connection used cannot write at
  all.
- It lasts 30 minutes, and ends the moment "Stop viewing" is clicked.
- The person being viewed is **never told**, anywhere. It is not in the
  church's activity log, not on their account page, nowhere. Only the platform
  developer can see who viewed whom, and when.
- A developer viewing as a clerk is a clerk: their platform powers do not come
  along for the ride.

**Try it:** People → a person → **View as** → walk around → notice there is no
way to change anything → **Stop viewing**. Then sign in as that person and
look for any sign of it: there is none.

---

## 6. The Finance portal

### The lists

Income is recorded against an **income source** (Tithe, Sunday offering,
Harambee…), and an expense against an **expense item** (Electricity bill,
Generator fuel…).

- While typing, the list suggests what the church already uses, most-used
  first, and forgives a typo: "electrcity" still finds "Electricity bill".
- If it genuinely does not exist, it can be created right there, without
  leaving the form.
- The same name twice is refused. A name close to one that exists is refused
  **once**, showing the near-misses — that is what stops "Electricity",
  "Electricity bill" and "Umeme" becoming three items and a year of useless
  reports. Saying "no, this is different" then creates it.
- Nothing is ever deleted. An item that is finished with is **turned off**: it
  stops being suggested and cannot be used for new entries, and every past
  entry keeps it.

### Recording money

- One form: date, item, amount, how it was paid, and optional reference, payer
  or payee, and notes.
- The date defaults to today **where the church is**, and cannot be in the
  future.
- An entry dated more than 60 days ago asks "is this date right?" first.
- Saving twice by accident — a double-click, or a retry after the connection
  drops — records **one** entry, not two.
- "Record another" keeps the date and the payment method, because clerks enter
  a stack of receipts from one day.

### The number on every entry

```
IRCA-EXP-2026-09-000001
└┬─┘ └┬┘ └─┬┘ └┬┘ └──┬─┘
 │    │    │   │     └ counter: restarts every month, no gaps
 │    │    │   └ month of the transaction date
 │    │    └ year of the transaction date
 │    └ INC = income, EXP = expense
 └ the church's code
```

- The **date** decides the month, not the day it was typed in.
- Income and expenses count separately, and so does every church.
- Fifty people saving at the same instant get fifty consecutive numbers.
- A save that fails spends no number.
- The church's code is frozen as soon as it has a single entry, because the
  code is printed on every one of them.

### Correcting something

**Nobody in Finance can change an entry, and neither can an administrator.**
Not the amount, not even a note. A correction is a **request**:

1. On the entry, *Request a change* → **Correct this entry** or **Void this
   entry**, with a reason.
2. The entry shows that a change is waiting, and the administrators get an
   email and a number beside **Requests**.
3. An administrator opens Admin → Requests, sees exactly what would change
   (before → after, in words), and approves or rejects it with a note.
4. Only then does the entry change, and its revision goes up by one.

The rules around it:

- **Nobody decides their own request**, even an administrator. The card says so
  instead of showing buttons that would fail.
- One open request per entry at a time.
- A request is checked again when it is approved, not only when it was made: if
  the item has been turned off meanwhile, approving is refused and the request
  stays waiting.
- If the entry changed since the request was written, approving withdraws it
  rather than applying a change to something else.
- A rejection needs a note, and changes nothing.
- The person who asked can cancel while it is waiting.
- Voiding keeps the entry and its number; it just stops counting in the totals.
- A correction that moves an entry into **another month** cannot renumber it,
  so it is replaced: a new entry with the right month's number, the old one
  voided and pointing at it. Both numbers still tell the truth.

### Seeing the money

- **Overview**: this month's income, expenses, net and count, with the change
  against last month, income by source, top expenses, the last twelve months,
  and the latest entries.
- **Transactions**: everything, filtered as you type — by kind, item, method,
  dates, or a search over the number, reference, payer and notes. The totals
  line is for *everything that matches the filters*, not just the page shown.
  Voided entries are struck through, and hidden unless asked for.
- **Reports**: a statement for any range of dates, with presets, a month-by-
  month table, a **Print** that gives a clean black-on-white page, and a CSV.
- **Export CSV** on Transactions downloads exactly what the filters show. Any
  cell that starts like a spreadsheet formula is quoted, so opening the file
  cannot run anything.

---

## 7. Rules the database keeps by itself

These hold even if the application code is wrong, which is the point:

- Finance entries **cannot be deleted** by the application at all.
- **No** change to an entry is accepted unless an administrator has approved a
  change request for that exact entry — checked by a trigger, on every update.
- A voided entry is final.
- A church's code cannot change once it has entries.
- Each church can only see its own rows: the connection carries the church, and
  the tables' own policies filter on it.
- View-as records are invisible to churches, including to any query a church's
  own code might send.
- The activity log cannot be updated or deleted by the application.
- An amount must be more than zero; an income entry must have a source and an
  expense an item; the month on an entry must match its date.

---

## 8. Running it on your machine

You need PostgreSQL 16+ and Node 22+.

**Once, as the database superuser** (`sudo -u postgres psql`), create the roles
and databases exactly as `docs/plan/01-foundations-and-login.md` step 1.5 lists
them (five roles, `irca_dev` and `irca_test`, statement timeouts, and UTC for
every role).

Then, from the repository root:

```bash
npm install
cp apps/api/.env.example apps/api/.env          # if you have no .env yet
cp apps/portal/.env.example apps/portal/.env.local
npm run db:migrate                              # create the tables
npm run db:seed                                 # two churches and some accounts
npm run dev                                      # everything, together
```

The portal is on <http://localhost:3000>, the API on <http://localhost:4000>.

### The accounts the seed makes

| Email | Password | Who they are |
| --- | --- | --- |
| `admin@irca.local` | `admin-password-123` | Church administrator, IRCA |
| `pastor@irca.local` | `pastor-password-123` | A second administrator (so requests can be approved) |
| `clerk@irca.local` | `clerk-password-123` | Finance clerk (Neema Mollel) |
| `mhazini@irca.local` | `manager-password-123` | Finance manager (Joyce Mhazini) |
| `admin@test.local` | `admin-password-123` | Administrator of a second church, TEST |
| `dev@irca.local` | `dev-password-123` | The platform developer |

IRCA has Finance turned on; TEST does not — which is itself worth trying.

In development, emails are not sent: each one is printed in the API's terminal,
link and all.

---

## 9. Walking through it by hand

This is the walk that proves the access rules. Half an hour, in a browser.

**As `clerk@irca.local` (Finance clerk)**

1. Finance → **Record expense**. Type an item name that does not exist, create
   it in the dialog, enter an amount, save. Expect `IRCA-EXP-…-000001`.
2. **Record another** twice more: the date and payment method stay, and the
   numbers run 000002, 000003.
3. Record one dated the last day of last month: it is numbered in *that* month.
4. Open an entry → *Request a change* → correct the amount, with a reason. The
   entry now says a change is waiting.
5. There is no way anywhere to change an entry directly. Look for one.

**As `admin@irca.local` (administrator, no finance role)**

6. The sidebar has no Finance. Typing `/finance` says you do not have access.
7. **Requests** shows the clerk's request with the before and after. Approve
   it. The entry's amount changes and its revision becomes 2.
8. People → the clerk → **View as**. Walk through Finance: the same pages, no
   Record buttons, no way to ask for a change. Stop viewing.
9. Sign in as the clerk and look for any trace of being viewed: there is none,
   including in Activity.

**As `mhazini@irca.local` (Finance manager)**

10. Lists → rename an item, then turn one off. Try to use the one you turned
    off on a new entry: it is not suggested and is refused.
11. Transactions → **Export CSV**: the download matches the filters.
12. Ask to void an entry. Then, as the *same* person, try to approve it —
    you cannot; another administrator must. Have `pastor@irca.local` approve
    it. The entry is struck through in the list and the totals drop.

**As `admin@test.local` (the other church)**

13. Finance is not in the sidebar. Turn it on in Portals: the three finance
    roles appear.
14. Record an expense: it is numbered `TEST-EXP-…-000001`, counting from one.
15. Paste an IRCA entry's number into the address bar: "No entry with that
    number." The item suggestions contain none of IRCA's items.

---

## 10. Running the automated tests

From the repository root:

```bash
npm run typecheck          # types, everywhere
npm run lint               # the code rules, including who may touch what
npm test                   # the small unit tests
npm run test:e2e -w @irca/api  # 73 tests against a real database
npm run e2e                # 9 journeys through a real browser
```

The API tests use `irca_test`, a separate database; they never touch your
development data. The browser journeys build the portal, start both servers on
their own ports (4100 and 3100) and drive Chrome.

What the automated tests cover, in short: signing in and its refusals; that
every route says who may call it (the API refuses to start otherwise); that one
church can never read another's anything; that viewing as someone is read-only
everywhere; invitations end to end, including the email; the Admin API against
each permission; and for Finance — numbering under fifty simultaneous saves,
the month rules, near-duplicate names, the database's own refusals, change
requests including self-approval, staleness and month moves, totals, CSV
safety, and the whole recording-and-approving journey in a browser.

---

## 11. What is not built yet

- The registration form still runs on its own database (Phase 5).
- The Membership portal: members, applications, discipleship (Phase 5).
- The developer console: per-church usage, and the view-as log in a page that
  looks like a terminal (Phase 6).
- Deployment and cutover (Phase 6).

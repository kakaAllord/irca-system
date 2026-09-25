# What works now, and how to try it

This is the plain-language version of what has been built so far, and how to
check each piece yourself. No jargon where a normal word will do. If something
here does not behave as described, that is a bug worth reporting.

Built so far: **Phase 1** (sign-in), **Phase 2** (the portal frame, roles and
viewing as someone), **Phase 3** (the Admin portal), **Phase 4** (the Finance
portal), **Phase 5** (the registration form on this system, and the
Membership portal), and **Phase 6** — the developer console, the security
hardening, the commands for setting up and recovering, the written way to
deploy it, the runbooks and the training guides, and **Phase 7** — the
church's departments with their leaders and members, and the Communication
system that texts them, and **Phase 8** — the Outreach & Evangelism portal:
Saturdays, the people reached, follow-up, one timeline per person, Friday
training, the dashboard and the session report. What is left of Phase 6 is
going live, which is the owner's (section 13). Then pledges (Phase 9). Switching the live form over is a
job for a Sunday evening, with `docs/runbooks/cutover-registration.md`.

This system serves **one church**. A second church would get its own copy,
with its own database, rather than sharing this one (decision D27).

**To see it with data in it**, fill a fresh database with eighteen months of
plausible history — people, registrations, the books, the class, the activity
log and the usage charts:

```bash
npm run db:reset && npm run db:seed && npm run db:demo
```

It refuses to run twice over the same database, and it never runs outside
development.

---

## 1. The short version

There are three apps and one shared library:

| Part | What it is |
| --- | --- |
| `apps/api` | The server. Everything goes through it: signing in, permissions, the books, the activity log. |
| `apps/portal` | What staff use in a browser: `/login`, `/admin/…`, `/finance/…`, `/membership/…`, `/comms/…`, `/departments/…`, `/outreach/…`, `/dev/…`, `/help`. |
| `apps/registration` | The visitor's registration form. One setting chooses its back end: its old database (what the live site uses until the cutover) or this system. |
| `packages/shared` | The rules both sides need to agree on: what a portal is, what a permission is, what an entry number looks like. |

The rules that matter most — the books cannot be rewritten, the activity log
cannot be edited, viewing as someone cannot change anything — are enforced
twice: once in the code, once by the database itself, so a mistake in the code
is not enough to break them.

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
- Light by default, with a sun-or-moon switch for dark, remembered per browser.
- On a phone the sidebar becomes a drawer; everything works at 360 pixels wide.
- Anything you fill in — inviting someone, a new role, a new item, asking for a
  correction — slides in from the right, over the page you were reading. Plain
  yes-or-no questions still open in the middle.
- Fields that must be filled in carry a red star, and a Save button that is
  greyed out says what it is still waiting for when you point at it.
- A number appears beside **Requests** when something is waiting for you.

---

## 4. People, roles and portals (the Admin portal)

### Inviting someone

An administrator adds an email address and ticks what the person may do. The
person gets an email with a link, chooses their own password, and lands in the
portal with exactly those roles — no more.

- Invitations last 72 hours and work once. They can be resent or cancelled.
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
  church's activity log, not on their account page, nowhere. Only the
  developer can see who viewed whom, and when, in the view-as log.
- A developer viewing as a clerk is a clerk: their own powers do not come along
  for the ride.

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
- Income and expenses count separately.
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

### Pledges

What a person promised towards a campaign, what they have paid and what is
left: the one place the church names a giver against an amount, as its
leadership agreed on 25 September 2026 (`docs/modules/pledges-brief.md`).

- **Campaigns.** The finance manager opens one ("Ujenzi 2027"), with a target
  if there is one. **Finance → Pledges** shows each with a bar of what came
  in, what was promised, and what is still owed. Closing one stops new
  pledges; what was promised can still be paid.
- **Who owes what** is on a campaign's page, largest owed first, with open,
  overdue, paid in full and cancelled as tabs, only for the finance manager
  and the pastors (the new **Pledges overseer** role). Everyone else in
  Pledges sees the totals and counts.
- **Recording.** The manager records a pledge from the drawer: who, how much,
  how and by when. A clerk records a payment by finding the person paying by
  name or number, never by opening the list, and may point it at the income
  entry that recorded the same money. The balance is worked out every time,
  never stored; two clerks saving at once cannot leave it wrong.
- **Corrections.** A payment is never edited or deleted: a clerk asks, and an
  administrator approves in Admin → Requests, as for a finance entry. A
  pledge that will not be kept is cancelled, with a reason, and stays in the
  records. Nothing about pledges is ever deleted.
- **On the person.** A pledge and each payment are on the person's timeline,
  without an amount, and only for those who may see pledges; the Membership
  person page lists their pledges for the same people.
- **Reminders** go through Communications (section 8e).

---

## 7. The registration form, now on this system

The form looks and behaves exactly as before — same questions, same three
languages, same branching — but with `REGISTRATION_BACKEND=api` it no longer
has a database of its own. Its server calls the API with a key that belongs to
the church and never reaches a phone.

- A visitor is somebody from the first tap: they appear in the Members list
  even if they never finish, as "Unknown — +255 7…".
- Half-typed answers are still saved when someone puts the phone down, and a
  finished Continue is still checked in the visitor's own language.
- The same phone number cannot register twice.
- Ticking "join the church" and finishing opens a membership application for
  the pastors by itself.
- One command copies the live registrations across, keeping every token (so
  every link already sent by SMS keeps working) and every time to the
  microsecond. It can be run again and again: each run brings only what
  changed, and it refuses to say "match" unless both sides really do.

## 8. The Membership portal

**Dashboard** — total registrations, joining church, salvation, baptism and
this month, each with how it moved against the 30 days before; applications
waiting; new converts in follow-up with their class progress; how people heard
about the church; and the unfinished registrations with what each is missing.

**Members** — everyone, searched and filtered as you type (salvation,
baptism, gender, age, where they live, how they heard) with a count on every
tab. A row opens in place: what they registered, their prayer request, and
whether they are saved and baptised. The office's word wins over the form's,
and the page says which it is.

**What is private stays private.** Prayer requests, faith and family answers,
date of birth, email and the church's notes are only in the record for someone
with that permission (pastors and the office). For anyone else — the follow-up
team, say — those parts are not hidden on the page: they never arrive at it.

**Each person's record** — who they are, what they told the form, where they
are on the journey with every move and who made it, and every visit, call and
note. People move one step at a time, or one step back with a reason.
Someone who did not finish can be sent their own link, by copying it or by
opening WhatsApp with the message already written in their language.

**Applications** — under review, approved, confirmed. Approving is the
pastors' decision alone. Confirming waits for the probation month (30 days
unless the church changes it) and the button says the date it becomes
possible. Confirmation gives the person their member number, never skipped
and never given twice.

**Discipleship** — the board from new convert to confirmed member, and the
class register: tap a box to mark a session attended or missed, or mark the
whole session at once. Six sessions finishes the class. Two missed in a row is
flagged as worth a visit; it never moves anyone back on its own.

**Insights** — where people stop on the form, counted only against the people
who were shown each question; how they heard, with the typed "Other" answers
grouped by what they said; ages, where they live, what they came for. Every
figure is a count before it is a percentage.

---

## 8d. Departments, their leaders and their members

The church's departments — the praise team, the choir, the ushers, Finance,
Communications — are kept by the administrators in **Admin → Departments**
(decision D28).

- **A department** has a name, what it does, and, if it has one, its portal. A
  portal belongs to one department, and **Admin → Portals** will not switch a
  department portal on until a department has been given it. Most departments
  have no portal at all.
- **Leaders** are named only by an administrator, only from the confirmed
  members, each with a title such as Chairperson or Secretary. Naming one who
  has no account invites them by email; one who has an account keeps it. They
  hold no role: being a leader is what lets them in, and ending the
  leadership, or archiving the department, takes that away on their next
  click.
- **Members** are added and removed by the department's leaders, under **My
  departments**, from anyone who has filled in the whole registration form;
  anyone else is not offered, and is asked to register first. A leader sees names, stages and the
  last three digits of a phone number, enough to tell two Johns apart and no
  more. They cannot touch another department, nor name or end a leader.

Nothing is deleted: departments are archived, leaderships and memberships
ended, so who led the choir in 2027 keeps an answer.

## 8e. Communications: text messages

One place sends the church's texts, through Beem Africa, with one account, one
history, one set of approved words and one bill (D21, D22, D25, D26).

- **Templates.** A department's leaders write their department's words in
  Swahili, English and French, with blanks such as `{{first_name}}` and
  `{{date}}`, and ask for approval. Communications approves once — never words
  it wrote itself — and from then on the department uses them without asking.
  Changing approved words makes the next version; the old one keeps sending
  until the new one is approved.
- **Sending.** Communications writes to the whole church, confirmed members,
  staff, the foundation class, chosen departments, every leader, or the
  leaders of chosen departments, and may use its own words for what no
  template covers. A department's leaders write to their own department, from
  **My departments → Messages**, and to anything wider only once
  Communications has given it to them in **Comms → Audiences**. Before Send
  does anything, the page shows how many people, who is left alone and why, a
  sample in each language, the segments and the cost — "Send to 4 people ·
  about 120 TZS" — and asks once more.
- **Refusals say why.** There is no daily limit unless Communications saves
  one in **Comms → Settings**; once one is saved, a send that would pass it is
  refused with the figure. Words that are not approved, another department's people or
  words, and free text from a department are refused in plain words too.
- **Everyone is written to in their own language**, the one they answered the
  form in (the office can change it on the person's page), and **every
  message says how to stop**. A reply of STOP, ACHA, SIMAMA, TOKA or
  UNSUBSCRIBE blocks that number for good. The office can also tick **No
  messages** on a person, and staff can turn texts off on their Account page.
  Nobody is texted twice for one message, even if they are in a department
  twice over.
- **Recurring messages** send on their days at their time, picking one of
  their approved templates at random and drifting a few minutes so they do not
  arrive like an alarm, never in quiet hours (21:00–07:00 unless changed).
  Each time, everything a person pressing Send is checked for is checked
  again: a leader who has stepped down stops, and the page says why.
- **What it costs.** **Comms → Overview** shows this month by department: how
  many messages, to how many people, delivered, failed, and the cost; the
  credit left; templates waiting; and the replies people sent. **History**
  shows every message and what happened to each person, with numbers masked
  unless you may read Membership's sensitive details.
- **Reminders about pledges.** Finance's leaders send to **People who still
  owe on a pledge** once Communications has given Finance that audience: each
  person once however many pledges they have, with the blanks
  `{{campaign_name}}`, `{{amount}}`, `{{balance}}` and `{{due_date}}` filled
  for them and already written the way a text says them. The leadership's
  default template names no figure. A reminding audience reaches nobody twice
  within 14 days (Comms → Settings, **Days between reminders**), whoever
  sends: two campaigns reminding on the same Monday are one text each, and
  those left alone are counted Who a reminder reached is shown, in History,
  only to those who may see pledges; others see how many.
- **Once a month.** A recurring message can send every week, or once a month
  on the first, second, third or fourth of its days: "The first Mon of each
  month at 10:00".
- **On the timeline.** Every text sent to a person puts a line on their
  timeline saying who it was from — never what it said — so whoever calls
  them next knows.
- **Where the texts go.** Tests keep them in memory; development and a
  deployment without a Beem account write them to the API's log; production
  sends through Beem once Communications has saved the account. Anywhere but
  production, texts reach Beem only with `SMS_LIVE=true` set on purpose.

## 8f. Outreach & Evangelism

The evangelism team's notebook, on a phone (Phase 8). Its team **is** the
Outreach department: its leaders and members, kept in **My departments →
Outreach**. The department's leaders run the portal because they lead it, with
no role (D29); the people who go out and record sign in with the **Outreach
member** role, and a pastor who only reads has **Outreach viewer**.

- **Team.** Everyone on the team with their partner group, how many Saturdays
  they went out in the last three months and their training over the last
  twelve. Leaders make partner groups of two or three; a group is switched
  off, never deleted.
- **Saturdays.** A leader plans a Saturday, then sends a team to each area —
  starting from a partner group or put together for the day, the area
  suggested from the ones already used. Afterwards it is marked completed or
  cancelled. Each team types how many it spoke to without taking details.
- **Recording someone**, standing on a doorstep: each team's *Record someone*
  asks for a name, a number and one tick — *May the church send them
  messages?*, unticked unless they said yes — because the team brings the area
  and who reached them. If the number (or, with no number, the name) is
  someone the church already knows, it asks *"Neema Mollel, reached 3 Aug in
  Kaloleni. Same person?"* instead of making a second person. Someone new
  becomes a visitor in the church's one People list, marked as from Outreach.
- **Reached** lists everyone recorded, with a number that rings when tapped,
  and marks who still needs following up or is missing a phone or an area;
  the area, a note and the follow-up flag are filled in later.
- **Follow-up** lists who is still waiting, longest first. Each person's page
  records a call, a visit, an invitation or *Came on Sunday*, as many as it
  takes, and shows their **timeline** — the same one Membership shows on the
  person's record, with every portal's lines in order: evangelised, called,
  visited, first time at church, class, member.
- **Training.** A leader plans each Friday training and marks who came with
  the class register's own boxes; a grid shows who has stopped coming.
  *Remind the team* opens the department's Messages with the whole department
  chosen. The people Outreach reached are an audience only Communications can
  give to a department (D22).
- **Dashboard.** Ten numbers for this week, month or year, or any dates —
  reached, spoken to, awaiting follow-up, follow-ups done, visited, first-time
  attenders, Saturdays held, areas, team members out, training attendance —
  and the weekly trend. **Every number opens the list it was counted from.**
- **The session report.** A leader attaches the Saturday's report as a PDF of
  up to 10 MB, kept on the church's own file storage (a Railway volume in
  production); it opens only for those who may read reports, and a new one
  keeps the old one as an earlier version. Until the volume is set up
  (`docs/deployment.md` §6b), attaching says storage is not set up.

## 8a. The developer console

For whoever runs the system, under **Dev** in the sidebar.

- **Health** — the database's size and connections, every background job's
  last run, the email and text-message queues, the SMS credit left, and the
  slowest queries.
- **Usage** — what the system is used for, day by day: an overview, any four
  numbers on one chart, each table's size and growth, the busiest and slowest
  parts of the server, sign-ins and lockouts, and the last fifty emails with
  their addresses cut short.
- **Logs** — what the server wrote recently, and what people did.
- **View-as log** — who viewed the portal as whom, drawn as a terminal you
  type into. The only place this can be seen.
- **Settings** — the church's name, code, clock and currency (the code locks
  once it is on an entry number), and the keys the registration form signs in
  with, each shown once when made.

## 8b. Help

**Help**, at the bottom of the sidebar, has the two one-page guides handed out
at training: *Getting started* and *Finance in five minutes*. Each prints as a
single page, or saves as a PDF, with no menus.

## 8c. When something goes wrong

A few commands run on the server for what the portal cannot do: setting up a
fresh database, sending a password reset, giving back a locked-out
administrator's role, signing someone out everywhere at once, erasing a person
at their request. `docs/runbooks/` says when and how, one page per situation.

---

## 9. Rules the database keeps by itself

These hold even if the application code is wrong, which is the point:

- Finance entries **cannot be deleted** by the application at all.
- **No** change to an entry is accepted unless an administrator has approved a
  change request for that exact entry — checked by a trigger, on every update.
- A voided entry is final.
- A church's code cannot change once it has entries.
- While someone is being viewed as, the pages run on a database connection
  that can only read.
- View-as records cannot be read by the application's own connection at all,
  whatever query it sends; only the dev console's view-as log reaches them.
- The activity log cannot be updated or deleted by the application.
- An amount must be more than zero; an income entry must have a source and an
  expense an item; the month on an entry must match its date.
- A person's timeline can only be added to, never edited or deleted.
- Who was reached, and when, cannot be removed or rewritten: only the area,
  the note and the follow-up flag change afterwards. Saturdays, partner groups
  and trainings are never deleted.
- A kept file's row is never deleted; replacing a file only marks the old one.
- Pledges, their payments and campaigns **cannot be deleted** by the
  application. What was promised, by whom and when never changes, and a
  payment changes only through an approved change request, like a finance
  entry. An erased person's pledges stay, without their name.

---

## 10. Running it on your machine

You need PostgreSQL 16+ and Node 24.

**Once, as the database superuser** (`sudo -u postgres psql`), create the roles
and databases exactly as `docs/plan/01-foundations-and-login.md` step 1.5 lists
them (the roles, `irca_dev` and `irca_test`, statement timeouts, and UTC for
every role; the `irca_core` role it lists is no longer used).

Then, from the repository root:

```bash
npm install
cp apps/api/.env.example apps/api/.env          # if you have no .env yet
cp apps/portal/.env.example apps/portal/.env.local
npm run db:migrate                              # create the tables
npm run db:seed                                 # the church and some accounts
npm run db:demo                                 # optional: 18 months of history
npm run dev                                      # everything, together
```

The portal is on <http://localhost:3000>, the API on <http://localhost:4000>.

### The accounts the seed makes

| Email | Password | Who they are |
| --- | --- | --- |
| `admin@irca.local` | `admin-password-123` | Church administrator, IRCA |
| `pastor@irca.local` | `pastor-password-123` | A second administrator (so requests can be approved), the Membership pastor, and Pledges overseer |
| `office@irca.local` | `office-password-123` | Office secretary: everything in Membership except deciding applications |
| `followup@irca.local` | `followup-password-123` | Follow-up team: visits and calls, cannot read prayer requests |
| `clerk@irca.local` | `clerk-password-123` | Finance clerk (Neema Mollel) |
| `mhazini@irca.local` | `manager-password-123` | Finance manager (Joyce Mhazini) |
| `dev@irca.local` | `dev-password-123` | The developer: the dev console, and an administrator too |
| `comms@irca.local` | `comms-password-123` | Communications lead (named for Allord Archard) |

Membership, Finance, Communications and Outreach are turned on, each belonging
to the department of the same name. No department has a leader yet: name one in
Admin → Departments (they must be a confirmed member, so run `npm run db:demo`
and confirm someone first). There is no daily SMS limit unless you save one in
Comms → Settings. The registration form runs at <http://localhost:3001>; with
`REGISTRATION_BACKEND=api` in `apps/registration/.env.local` (and the seed's
local key in `REGISTRATION_API_KEY`) it writes into this system.

In development, emails are not sent: each one is printed in the API's terminal,
link and all. Text messages likewise, each with the number shortened.

---

## 11. Walking through it by hand

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

**Pledges**

13. As `mhazini@irca.local`: Finance → Pledges → **+ New campaign**, then
    **+ Record a pledge** for someone in People, with a date in the past to
    pay by. It shows as overdue.
14. As `clerk@irca.local`: the same campaign shows totals and no names.
    **+ Record a payment**, find the person by name, pay part, and read what
    is left. Open the pledge and ask to correct the payment; approve it as
    `admin@irca.local` in Requests, and see the pledge settle again.
15. As `pastor@irca.local`: the campaign lists who owes what, with nothing to
    press; the person's page in Membership shows their pledges.

**The registration form and Membership**

16. Open <http://localhost:3001> on a phone-sized window and register as a new
    visitor, with a prayer request. Leave one other visitor half way.
17. As `pastor@irca.local`: Membership → Members. Type part of the name: they
    appear as you type. Open the row: their prayer request is there. The
    half-finished one shows as incomplete, with "Send their link".
18. Mark them saved (they become a new convert), then Discipleship → New group
    → add them to it from their record, and tick six sessions in the register:
    they move on to awaiting baptism.
19. Enter an application for them, approve it, and see Confirm say the date it
    becomes possible.
20. As `followup@irca.local`: the same person opens with **no** prayer request
    section, and there is no Applications page in the sidebar.

**As `dev@irca.local` (the developer)**

21. Dev → **Health**: the database, the jobs and the email queue. Dev →
    **Usage**: each tab has numbers (run `npm run db:demo` first for history).
22. Dev → **Settings**: try a timezone that does not exist and read the
    refusal; make a registration key, copy it, revoke it. Admin → Activity
    shows both.
23. View as the clerk, stop, then Dev → **View-as log**: type `log` and find
    the session, then `show` and its id to see every page opened.

**Outreach**

24. As `admin@irca.local`: Admin → Departments → Outreach → name a confirmed
    member as leader (run `npm run db:demo` first), accept the invitation from
    the email in the API's terminal, and as that leader add four people in My
    departments → Outreach. Give `followup@irca.local` the Outreach member role.
25. As the leader, with the browser at phone width: Outreach → Saturdays →
    **Plan a Saturday** for today, and add two teams. On a team, **Record
    someone** four times; use the number of someone already in People for one
    and answer **Same person**.
26. As `followup@irca.local`: Follow-up → open one → record a call and a visit.
    Then as `office@irca.local` open the same person in Membership: the
    timeline shows both, labelled Outreach.
27. As the leader: Training → plan one for today and mark it; Dashboard → click
    each number and check its list.

---

## 12. Running the automated tests

From the repository root:

```bash
npm run typecheck          # types, everywhere
npm run lint               # the code rules, including who may touch what
npm test                   # the small unit tests
npm run test:e2e -w @irca/api  # the API against a real database
npm run e2e                # journeys through a real browser
```

The API tests use `irca_test`, a separate database; they never touch your
development data. The browser journeys build the portal, start both servers on
their own ports (4100 and 3100) and drive Chrome.

What the automated tests cover, in short: signing in and its refusals; that
every route says who may call it (the API refuses to start otherwise), and a
matrix, generated from the routes, of who is let in and who is refused; that
viewing as someone is read-only in all three layers, with every page of every
portal opened on the read-only connection; the command line; invitations end to end, including the email; the Admin API against
each permission; and for Finance — numbering under fifty simultaneous saves,
the month rules, near-duplicate names, the database's own refusals, change
requests including self-approval, staleness and month moves, totals, CSV
safety, and the whole recording-and-approving journey in a browser. For
Outreach — the team being exactly the department, partner groups, Saturdays,
recording in four fields, fifty-five overlapping records becoming exactly the
people there are, consent, the timeline in both portals, a viewer refused
every write and an Outreach member refused all of Membership, training, every
dashboard number against a hand-counted month, files and the report, and a
whole Saturday walked in a browser at phone width.

---

## 13. What is not built yet

- Going live: choosing the domain, deploying (`docs/deployment.md`), the four
  checks only production can answer (`docs/hardening.md`), and the launch
  order in `docs/plan/06-dev-console-hardening-launch.md`, step 6.11.
- Switching the live registration form over
  (`docs/runbooks/cutover-registration.md`), and a week later removing its old
  database code (5.19).
- Backups beyond Neon's own history, load testing and monitoring (Phase 10,
  when the owner says so).
- For Communications to go live: the Beem account typed into Comms → Settings, and the
  reply URL given to Beem (`docs/deployment.md`, §6a).
- For Outreach: the files volume
  (`docs/deployment.md` §6b, with its checks before launch), and a
  second person walking it at phone width.
- For pledge reminders: Communications gives Finance the audience in Comms →
  Audiences and approves Finance's reminder templates, a Finance leader sets
  up the monthly reminder, and a second person walks Pledges from a fresh
  database.

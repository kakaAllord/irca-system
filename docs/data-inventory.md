# What this system stores about people

Written for the church's leadership as much as for whoever runs the servers.
Tanzania's **Personal Data Protection Act (2022)** applies to everything on
this page: the church is the data controller, and the answers a visitor gives
on a Sunday are personal data in law, not merely a form.

Read this before launch, and have the leadership read it. Two things need
their decision rather than ours: the consent wording on the registration
form's first screen, and how long the church wants to keep the answers of
people who never come back (see **How long things are kept**).

---

## 1. Visitors and members

**Where it comes from:** the registration form a visitor fills in on their own
phone, and the office afterwards.

| What | Where it lives | Who can read it |
| --- | --- | --- |
| Name, gender, age group | `registrations`, `people` | anyone with `membership.people.read` |
| Phone | `registrations`, `people` | anyone with `membership.people.read`: the follow-up team calls people. (Corrected 25 Sept 2026: this line said sensitive-only, which the code never did.) |
| Email | `registrations`, `people` | `membership.people.read_sensitive` only |
| Where they live: ward, region, country, how long | `registrations` | `membership.people.read` |
| How they heard of the church, who invited them | `registrations` | `membership.people.read` |
| Work, school, course, profession | `registrations` | `membership.people.read` |
| Salvation, baptism, Holy Spirit, previous church | `registrations`, `people` | `membership.people.read` |
| Marital status, year married, children's ages | `registrations` | `membership.people.read_sensitive` only |
| Date of birth | `registrations` | `membership.people.read_sensitive` only |
| **Prayer requests, what they liked, other comments** | `registrations` | `membership.people.read_sensitive` only |
| Follow-up notes: visits, calls, what came of them | `person_notes` | `membership.people.read_sensitive` only |
| Their journey: visitor → new convert → class → member | `people`, `person_stage_events` | `membership.people.read` |
| Application to become a member, and the decision | `membership_applications` | `membership.applications.read` |
| Foundation class group, and each session attended | `foundation_enrollments`, `foundation_attendance` | `membership.discipleship.read` |
| Member number, date confirmed | `people` | `membership.people.read` |
| How they came to be in People: the form, the office, or Outreach | `people.source` | `membership.people.read` |
| Their timeline: registered, applied, class sessions, confirmed, calls and visits (without what was written), and from Phase 8 what Outreach did with them — each with when and which portal (D23) | `person_interactions` | `membership.people.read`; Outreach sees it for people it reached. Never what Membership keeps behind the sensitive permission. |
| The language they are written to in; whether they asked for no messages, when and how | `people.lang`, `people.sms_opt_out*` | `membership.people.read` |
| Which departments they lead or belong to, since when | `department_leaders`, `department_members` | administrators (`admin.departments.read`); a department's own leaders see its members' names, stages and the last three digits of their phone |
| Every text sent to them: the number, the language and the exact words | `comms_recipients` | Communications (`comms.messages.read`), and the leaders of the department that sent it; the number is masked unless the reader holds `membership.people.read_sensitive` |
| Replies they sent to a text | `comms_inbound` | Communications, on Comms → Overview; the number cut short unless the reader holds `membership.people.read_sensitive` |
| That their number asked for no messages | `comms_blocked_numbers` | nobody through the portal; kept so a STOP is honoured for good |
| Outreach: when and where they were reached, by whom, whether they still need following up, and a note; the Saturdays they went out on and the trainings they came to, if they are on the team | `outreach_reached`, `outreach_session_team_members`, `outreach_group_members`, `outreach_training_attendance` | `outreach.reached.read` (the reached) and `outreach.team.read` (the team) |
| **Saturday session reports** (PDFs written by the Outreach leader): may contain names, places and what was said | the files volume on the API (`FILES_DIR`), listed in `files` | `outreach.reports.read`, read only through the API. **`person:erase` cannot reach inside a PDF**: it lists the reports of the Saturdays the person was part of, and someone checks them by hand (`docs/runbooks/erasure-request.md`) |

**The sensitive line is enforced, not advisory.** A response for someone
without `membership.people.read_sensitive` does not contain those fields at
all — they are dropped before the answer is built, not hidden in the browser.
Search behaves the same way: someone who may not read email addresses cannot
search by one either, because a match would tell them whose it is.

**Prayer requests deserve naming separately.** People write things about their
marriages, their health and their money in that box. It is treated as the most
sensitive field on the form, it is never in a list, an export or a suggestion,
and only the follow-up team and the pastors can open it.

### The registration link is itself a secret

A registration is reached at `/r/<token>`, with no sign-in: whoever holds the
link can read and change those answers. That is what makes an unfinished form
resumable on the same phone a week later. So:

- the token is 32 random characters, never guessable from another one;
- pages under `/r/` send no `Referrer` header anywhere, so the link cannot
  leak through a link click or an embedded image;
- reminder messages (`registration_reminders`) record that a link was sent
  again, and to which channel, never the message itself.

---

## 2. Staff

| What | Where it lives | Who can read it |
| --- | --- | --- |
| Name, email, phone | `users` | anyone with `admin.users.read` |
| Password | `users.password_hash`, hashed with Argon2id | nobody, including devs |
| Their roles | `user_roles` | `admin.users.read` |
| Sessions: when, from which address, which browser | `sessions` | nobody through the portal; devs in the database |
| Invitations sent to them, and whether accepted | `invitations` | `admin.users.read` |
| Password reset requests | `password_reset_tokens` (hashed) | nobody |
| Everything they changed, with a summary | `audit_events` | `admin.audit.read` |
| Which days they were active | `user_activity_daily` | the dev console, as a count per day |

A staff member's email address is also personal data. It is shown to those
who may read people, and in the dev console only cut short (`ne***@gmail.com`).

---

## 3. Money

`finance_transactions` records what was received and spent, by category, with
a reference number, a date and who entered it. **It never names a giver.**
Envelope numbers, pledges and individual giving are deliberately not in this
system: the finance portal reports totals by source, not by person. If the
church ever wants per-giver records, that is a new decision with its own
consent conversation, not a small feature.

---

## 4. What the developers can see

The developer holds the dev console's role. Through it they see:

- counts, sizes and usage over time — numbers, not names;
- the server's recent log lines and the activity log;
- the last emails sent, with each address cut short;
- the database itself, as any administrator of a hosted system can.

**Viewing as someone.** A developer, and an administrator, can open the
portal as another person to see exactly what that person sees. It is
read-only — the portal offers nothing that changes anything, every write is
refused at the API, and the connection used is a read-only database role —
and it is silent: the person is not told, and the church's activity log never
shows it. Every session and every page opened in it is written to the view-as
log, which only the developer can read and which nothing in the system can
change. Tell staff this exists; the portal's Help → Getting started says so
for that reason.

---

## 5. How long things are kept

| What | Kept | Why |
| --- | --- | --- |
| Registrations and people | until erased by request | the church's record of who it is caring for |
| Prayer requests | with the registration | — |
| Follow-up notes | with the person | — |
| Activity log (`audit_events`) | **forever** | it is what proves who did what; never edited, never deleted, except by an erasure request, which replaces the name |
| Finance entries | forever | money must reconcile years later |
| Sessions | 90 days after they stop working | support ("was she signed in on Sunday?") |
| Password reset links | 7 days | they expire long before that |
| Emails sent (`email_outbox`) | the queue row stays; the body is not kept after sending | |
| Text messages sent (`comms_messages`, `comms_recipients`) | forever, with each person's number and exact words, until the person is erased | what the church said, to whom, and what it cost; the application cannot edit or delete them. A retention period is a leadership decision, as for registrations |
| Replies (`comms_inbound`) | forever, as they came | read by Communications; never edited |
| Blocked numbers | forever, even after the person is erased | a STOP must outlive the record |
| Usage numbers | forever, as daily totals | they are counts, and name nobody |
| View-as log | forever | it is the check on a power that is otherwise invisible |

**A decision for the leadership:** someone who filled in the form once, two
years ago, and never returned is still in the system, prayer request and all.
The Act asks that data is kept no longer than it is needed. Either the church
decides a period after which unfinished and never-followed-up registrations
are erased — two years is a reasonable starting point — or it decides
deliberately to keep them and can say why. Nothing in the code does this
today; it needs the decision first.

---

## 6. Erasing someone who asks

The Act gives a person the right to have their data removed. That is a command
a dev runs on the server, not a button in the portal:

```bash
node apps/api/dist/cli/main.js person:erase --church IRCA --person <uuid> [--dry-run]
```

It asks for the person's id back before it does anything, and cannot be undone.
It erases the person, their registration and every answer on it (prayer request
included), their notes, their journey, their application and their class
records, the departments they led or belonged to, every text message sent
to them, their timeline, and what Outreach recorded about them. Where they
were one of the team who reached someone else, they are taken out of that
record and their name out of the line on that person's timeline. A number that asked for no messages stays blocked, without their
name, because honouring a STOP outlives the record. It keeps the activity
log's lines — the log is what proves who did
what — but replaces their name with `[erased]` wherever it was written into a
summary, and drops the before-and-after details of their own records. That the
erasure happened is itself recorded, naming nobody.

Run it with `--dry-run` first: it prints exactly what would go and changes
nothing.

---

## 7. Where the data physically is

- One PostgreSQL database, hosted (Neon), holding this church's data and no
  one else's. Another church would have a database of its own (D27).
- Backups are taken by the host and kept as the host's plan says; a copy that
  leaves the host is the church's own export.
- Email goes out through Resend. Recipient addresses and message bodies pass
  through that service.
- Text messages go out through Beem Africa, in production, once
  Communications has saved the account: each recipient's phone number and the
  exact words sent to them pass through Beem, and Beem passes replies back.
  Beem's key is kept sealed in the database (D26). Nothing else leaves.
- No analytics, no advertising pixels, no third-party scripts: the content
  policy on both web apps refuses them outright.

---

## 7a. What is coming, and what it will add here

One more phase adds personal data, and this page is rewritten in the same pull
request:

- **Phase 9, pledges.** Per-person promises and payments — see section 3.

Phase 7, the Communication system, is built, and is described in the tables
above. Phase 8, Outreach, adds the people reached on a doorstep: they join
People, and are texted only once Communications deliberately gives Outreach
that audience (D22).

## 8. Before launch

- [ ] Leadership has read this page.
- [ ] Consent wording on the form's first screen agreed, and legal advice
      taken on it.
- [ ] A retention decision made for old registrations (section 5).
- [ ] Someone named as the person who answers erasure and access requests.
- [ ] A retention decision made for text messages and their replies (section 5).

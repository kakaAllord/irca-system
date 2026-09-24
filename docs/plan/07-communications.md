# Phase 7 — Departments, and the Communication system (SMS through Beem)

> **In one sentence:** the church's departments — the praise team, the choir,
> Outreach, Finance — are written down with their leaders and members, and
> the church gets one place that sends text messages to them, with one
> account, one history, one set of approved words and one bill.

**Status:** being built. **Comes after:** Phase 6. **Comes before:** Phase 8
(Outreach is a department, and sends its Friday reminders through this) and
Phase 9 (pledge reminders).

---

## Before you start

**1. What must already be true.**

- Phases 1–6 are built (they are; see `README.md`).
- The Communications team's answers are in `docs/modules/comms-brief.md`
  (step 7.1). The one answer still to come is the monthly budget; until
  Communications types a daily limit into Comms → Settings, every send is
  refused, so nothing waits on it.

**2. Read these first, in this order** (about 40 minutes):

| Read | Why |
| --- | --- |
| `00-decisions.md`, D28 | Departments, their leaders and members, and why a portal belongs to a department. Steps 7.2–7.4 build it. |
| `00-decisions.md`, D21, D22, D25, D26 | *Who controls what* (as amended by D28), *opt-out and language*, *cost*, *where the Beem key lives*. |
| `00-decisions.md`, D27 | There is one church. No table gets a `church_id`. |
| `docs/modules/comms-brief.md` | What the Communications department told us it does. |
| `docs/adding-a-module.md` | The recipe every portal follows. This phase follows it. |
| `apps/api/src/core/email/email.service.ts` | Email already works the way SMS will: written to an outbox table first, sent by a background job. Copy its shape. |
| `apps/api/src/core/change-requests/` | The "registry" pattern: core code that modules plug into without core importing them. Audiences (7.8) use the same trick. |
| `apps/api/src/core/rbac/permission-resolver.service.ts` | Where what someone may do is worked out. Step 7.3 adds leadership to it. |

**3. Get your machine ready.**

```bash
cd ~/dev/irca/irca-system
git checkout dev-allord && git pull     # the only branch you work on
npm install
npm run db:migrate && npm run db:seed   # your local database, up to date
npm run dev                             # portal :3000, API :4000, form :3001
```

Sign in at <http://localhost:3000> as `admin@irca.local` /
`admin-password-123`. If that works, you are ready.

**4. The loop for every step** (`README.md` §2 explains it in full): read the
step → do it → run its **Check** → run the checks below → commit with the
step's commit title → push `dev-allord`.

```bash
npm run typecheck && npm run lint && npm test
npm run test:e2e -w @irca/api
```

---

## What you are building, in plain words

Today the system knows portals, not departments, and nobody can send a text
from it. After this phase:

- **Administrators** keep the list of the church's **departments**. For each
  they name one or more **leaders** — confirmed members, each with a title
  such as Chairperson or Secretary — and, where the department has one, the
  portal that belongs to it.
- **A leader** signs in, sees the departments they lead under **My
  departments**, adds and removes their **members** from the church's People
  list, and sends their department the messages Communications has approved
  the words of.
- **Communications** owns the Beem account, approves the wording of every
  template, sends to the whole church, to departments, to every leader or to
  the leaders of chosen departments, decides which wider audiences a
  department may use, and sees what everything cost.
- **Everyone who receives a message** gets it in their own language, can reply
  STOP and is never texted again, and is never texted at night.

The owner's rule, word for word (22 Sept 2026):

> Centralize control, standards, data, and infrastructure — decentralize
> routine communication.

So the approval happens **once, when the words are written**, not every time
they are used.

```
  Department leader                    Communications                 Beem
  ─────────────────                    ──────────────                 ────
  drafts a template  ───────────────▶  approves it (once)
  picks audience + template
  presses Send  ──▶  checks: do they lead this department? may it reach
                     these people? are the words approved? under today's cap?
                     ──▶  one row per phone in comms_recipients (the outbox)
                                           background job  ──────────▶  SMS
  sees delivered / failed  ◀─────────────  delivery reports  ◀──────────
```

## Words used in this phase

| Word | Meaning |
| --- | --- |
| **Department** | A part of the church's life, in Admin → Departments: the praise team, the choir, Outreach. It may have a portal; most do not (D28). |
| **Leader** | A confirmed member who leads a department, with a title. Named and removed only by an administrator. Signs in. |
| **Member** (of a department) | A person from People who belongs to a department. Added and removed by its leaders. Need not be a confirmed member, and does not sign in. |
| **Leadership permissions** | What a leader may do because they lead a department — see their departments, add members, draft and send its messages. Worked out from `department_leaders`, never handed out as a role. |
| **Template** | The approved wording of a message, with a body in each language (`en`, `sw`, `fr`) and blanks like `{{first_name}}`. |
| **Audience** | A group of people a message can go to, such as "everyone in the praise team" or "every department leader". Worked out fresh at the moment of sending; never stored as a copy of a list. |
| **Audience provider** | The code, belonging to one module, that turns an audience into names and phone numbers. |
| **Grant** | Permission for a department to use one of the church-wide audiences. Its own department is never a grant: it can always reach it. |
| **Segment** | The unit carriers charge by: 160 plain characters, or 70 if any character is outside the basic SMS alphabet. |
| **Beat** | A message that repeats on a rhythm ("every Tuesday at 18:00"), picking one of several approved templates each time so it doesn't read like an alarm. |
| **Cap** | The most the church may spend on SMS in one day. A send that would pass it is refused. |

## The steps at a glance

| Step | What | You are done when |
| --- | --- | --- |
| 7.1 | The brief | The Comms team's answers are in `comms-brief.md`. |
| 7.2 | Departments, leaders and members | The tables exist; a portal cannot be switched on without its department. |
| 7.3 | A leader signs in, and leads by being one | Naming a leader invites them; their permissions come and go with the leadership. |
| 7.4 | The department pages | An administrator names a leader, and the leader adds a member, in a browser. |
| 7.5 | The Comms module and its permissions | Communications appears in Admin → Portals with three roles. |
| 7.6 | The Comms tables | The migration runs; the app role cannot rewrite history. |
| 7.7 | Beem, behind a provider | A send goes to the log in development, to memory in tests, to Beem in production. |
| 7.8 | Audiences | "The praise team" turns into phone numbers without Comms importing anything. |
| 7.9 | Templates | Draft → pending → active, and nobody approves their own. |
| 7.10 | Sending | A send is refused, with a reason you can read, whenever it should be. |
| 7.11 | Beats | A weekly message goes out on its own, never in quiet hours. |
| 7.12 | Replies and delivery reports | A STOP reply stops all future messages to that number. |
| 7.13 | What it costs | The dev console shows messages sent and money spent. |
| 7.14 | The Comms pages | The Comms portal and a department's Messages page work in a browser. |
| 7.15 | Prove it | The tests below exist and fail when their guard is removed. |
| 7.16 | Phase check | Every box ticked. |

---

## 7.0 — Who controls what (read, nothing to build)

| Administrators and Communications control | A department's leaders do themselves |
| --- | --- |
| The list of departments, and which portal belongs to which | — |
| Who leads each department (administrators only) | Who its members are |
| The Beem account, the sender name, the credit | Write and send their department's routine messages |
| The full history and the delivery reports | See their own department's history and delivery reports |
| Which church-wide audiences a department may use | Choose among their department and the audiences it was given |
| Approving a template, and every later version of it | Draft a template and ask for approval |
| Messages to the whole church, across departments, or to leaders | — |
| The daily cap and the price per segment | See what their own sending cost |

**A department can never:** send to an audience it was not granted; send
words no approved template covers (free text is Communications' alone, behind
`comms.messages.send_adhoc`, which nobody has by default); or read another
department's history. **A leader can never** add or remove a leader, or touch
a department they do not lead.

---

## 7.1 — The brief

**Goal.** The Communications team's answers are written down before any code
depends on them.

**Do.** Fill in the *TBC*s in `docs/modules/comms-brief.md`.

**Answers (owner, 24 Sept 2026).** Communications is led by **Allord
Archard**. Everyone who is messaged is already in People, because they came
through the registration form. The monthly SMS budget is not decided yet:
there is therefore **no default daily cap**, and every real send is refused
with *"Set a daily limit in Comms → Settings first"* until Communications
saves one. That way a forgotten setting cannot empty the credit.

**Check.** `grep -n TBC docs/modules/comms-brief.md` finds only the budget.

**Commit.** "Write down what Communications actually sends".

---

## 7.2 — Departments, leaders and members

**Goal.** The church's departments exist in the database, each with its
leaders and members, and a portal belongs to one.

**Why.** Everything Communications sends to a department, and everything a
leader may do, hangs off these three tables (D28).

**Do.**

1. Three models in `apps/api/prisma/schema.prisma`, and a link from a staff
   account to a person:

   ```prisma
   // sketch — names and shape
   model Department {
     id          String    @id @default(uuid(7)) @db.Uuid
     name        String    @unique @db.VarChar(80)
     description String    @default("") @db.VarChar(300)
     /// The portal this department has, if it has one. A portal belongs to one department.
     moduleKey   String?   @unique @map("module_key") @db.VarChar(40)
     createdById String?   @map("created_by_id") @db.Uuid
     createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
     updatedAt   DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)
     archivedAt  DateTime? @map("archived_at") @db.Timestamptz(6)
     @@map("departments")
   }

   /// A leader of a department. Ended, never deleted.
   model DepartmentLeader {
     id           String    @id @default(uuid(7)) @db.Uuid
     departmentId String    @map("department_id") @db.Uuid
     personId     String    @map("person_id") @db.Uuid
     title        String    @db.VarChar(60)        // 'Chairperson', 'Secretary'
     addedById    String?   @map("added_by_id") @db.Uuid
     addedAt      DateTime  @default(now()) @map("added_at") @db.Timestamptz(6)
     endedAt      DateTime? @map("ended_at") @db.Timestamptz(6)
     endedById    String?   @map("ended_by_id") @db.Uuid
     @@map("department_leaders")
   }

   /// A member of a department, added by its leaders. Ended, never deleted.
   model DepartmentMember { /* the same, without the title */ }

   model User {
     // …
     /// The person this account belongs to. Set when they are named a leader.
     personId String? @unique @map("person_id") @db.Uuid
   }
   ```

2. In the migration (`--create-only`, then add): a person leads or belongs to
   a department once at a time —
   `create unique index … on department_leaders (department_id, person_id) where ended_at is null`
   and the same for members — and neither table may be deleted from
   (`revoke delete, truncate … from irca_app`).

3. **The portal rule.** `ChurchModulesService.setEnabled` refuses to switch on
   a department portal that no department has been given, and says where to
   do it: *"Finance belongs to a department. Give it one in Admin →
   Departments first."* Switching one off is always allowed. Admin and the dev
   console (`kind: 'core'`) belong to no department. The seed creates the
   Membership, Finance and Communications departments with their portals.

4. The rules, in `apps/api/src/modules/departments/`:
   - A **leader** must be a person at stage `CONFIRMED_MEMBER` when they are
     named. Refuse otherwise, and say who confirms members (the pastors, in
     Membership → Applications).
   - A **member** is anyone in People.
   - Leaders are named and ended only with `admin.departments.manage`.
     Members are added and ended by that department's leaders, or by an
     administrator.
   - A department with its portal switched on cannot be archived.
   - Every change goes to the activity log, naming the department and the
     person, never a phone number.

**Check.** An e2e test (`test/departments.e2e-spec.ts`): a visitor cannot be
named a leader (422, the message names the stage); the same person cannot lead
the same department twice; a portal with no department is refused (409) and
switched on once it has one; `delete from department_members` as `irca_app` is
refused.

**Commit.** "Write the church's departments down, with their leaders and
members"; "A portal is switched on for the department it belongs to".

---

## 7.3 — A leader signs in, and leads by being one

**Goal.** Naming a leader gives them a way in, and what they may do follows
the leadership without an administrator handing out a role.

**Why.** A role the administrator must remember to add and remove is a role
that outlives the leadership. A leader who stepped down in March must not
still be able to text the choir in June.

**Do.**

1. **Naming a leader** (`POST /v1/admin/departments/:id/leaders` with
   `{ personId, title, email? }`), in one transaction:
   - an account already linked to this person (`users.person_id`) is used as
     it is;
   - otherwise the email given, or the one on their person record, is looked
     up: an account with that email and no person is linked to them; one
     linked to someone else is refused;
   - otherwise an account is made and **invited** through
     `InvitationService.invite` with no roles, saying *"Chairperson of the
     Praise team"*. A person with no email and none typed in is refused with
     a message asking for one;
   - a disabled account is refused: re-enable it in Admin → People first.

2. **Leadership permissions.** A fourth kind of permission flag in
   `packages/shared/src/rbac/define.ts`: `fromLeadership: true`. The
   permissions carrying it are never put in a role (the role editor leaves
   them out, and `RolesService` refuses them); `PermissionResolver.forUser`
   adds them for anyone active who leads a department that is not archived —
   the same query, so still one round trip. Each one still belongs to a
   module, and one whose module is switched off is not added.

   | Permission | Module | What it allows |
   | --- | --- | --- |
   | `departments.own.read` | `departments` (core) | See the departments they lead, their leaders and members |
   | `departments.own.members` | `departments` | Add and end members of the departments they lead |
   | `comms.department.read` | `comms` | See their department's messages and templates |
   | `comms.department.draft` | `comms` | Draft their department's templates and ask for approval |
   | `comms.department.send` | `comms` | Send approved templates to their department and its granted audiences |

   The permission only says *what kind* of thing; the service always checks
   that they lead **this** department. Viewing as a leader gets the read ones,
   like any other permission.

3. The administrators' side is ordinary permissions in the `admin` module,
   held by *Church administrator*: `admin.departments.read` and
   `admin.departments.manage`.

**Check.** An e2e test: an administrator names a confirmed member with an
email and no account — an invitation email is queued, and once accepted the
leader sees their department and can add a member; ending their leadership
takes `departments.own.read` away on the next request; a leader cannot add a
member to a department they do not lead (403); a role with
`departments.own.members` is refused by the role editor.

**Commit.** "Name a department's leaders, and invite them to sign in"; "Lead
by being a leader, not by holding a role".

---

## 7.4 — The department pages

**Goal.** Administrators keep the departments, and leaders keep their members,
in the browser.

**Do.**

| Page | Who | What is on it |
| --- | --- | --- |
| Admin → Departments | `admin.departments.read` | Every department: its leaders, how many members, its portal. **New department** in a `Drawer`. |
| Admin → Departments → *one* | `admin.departments.read` | Name, description and portal (editable); leaders with their titles (**Name a leader**: search confirmed members, title, email when there is none on record); members; **Archive**. |
| My departments | `departments.own.read` | The departments they lead. |
| My departments → *one* | `departments.own.read` | Leaders (read only) and members, with **Add a member** (search People by name or phone) and **Remove**. Later, its Messages (7.14). |
| Admin → Portals | `admin.modules.read` | Each department portal says which department it belongs to, or that it has none yet. |

The member search a leader uses is its own route
(`GET /v1/departments/:id/people?q=`), returning names, stage and the last
three digits of a phone number — enough to tell two Johns apart, and nothing a
leader without Membership access should read.

**Check.** In a browser, from a fresh database: as the administrator, create
"Praise team", name a confirmed member Chairperson; accept the invitation from
the email in the API's log; as that leader, add two members, remove one.

**Commit.** "Departments in Admin, with their leaders"; "My departments: a
leader keeps their members".

---

## 7.5 — The Comms module and its permissions

**Goal.** A `comms` module exists, with the permissions the Communications
team and department leaders need.

**Do.** Create `packages/shared/src/modules/comms.ts`, shaped like
`finance.ts`:

```ts
// sketch — keep these keys
'comms.messages.read':       { kind: 'read',  label: 'See every message the church sent' },
'comms.messages.send':       { kind: 'write', label: 'Send to the whole church, to departments and to leaders' },
'comms.messages.send_adhoc': { kind: 'write', label: 'Send words no template covers',
                               hint: 'For emergencies. Held by the Communications lead.' },
'comms.messages.cancel':     { kind: 'write', label: 'Stop a scheduled or sending message' },
'comms.templates.read':      { kind: 'read',  label: 'See message templates' },
'comms.templates.draft':     { kind: 'write', label: 'Write and change templates' },
'comms.templates.approve':   { kind: 'write', label: 'Approve a template for use', hint: 'Nobody approves their own.' },
'comms.audiences.read':      { kind: 'read',  label: 'See who the audiences are' },
'comms.audiences.manage':    { kind: 'write', label: 'Give departments the use of church-wide audiences' },
'comms.schedules.read':      { kind: 'read',  label: 'See recurring messages' },
'comms.schedules.manage':    { kind: 'write', label: 'Set up recurring messages' },
'comms.costs.read':          { kind: 'read',  label: 'See what messages cost and the credit left' },
'comms.settings.manage':     { kind: 'write', label: 'Set the Beem account, the sender name, the daily cap and the price' },
// and the three leadership permissions from 7.3, marked fromLeadership
```

Three roles: **Communications lead** (all but the leadership ones),
**Communications sender** (read, send, draft, see audiences, schedules and
costs), **Communications viewer** (read only). Nav: Overview, Compose, History,
Templates, Recurring, Audiences, Settings. New drawings in `NavIcon`:
`messages` (an envelope), `templates` (a page with a star), `schedule` (a
clock), `departments` (three people).

Add `commsModule` and `departmentsModule` to `CHURCH_MODULES`.

**Check.** `npm test` passes; Admin → Portals lists Communications, and — the
seed having given it a department — it switches on and shows its three roles.

**Commit.** "Describe the Communications module".

---

## 7.6 — The Comms tables

**Goal.** Tables for grants, templates, messages, recipients, beats, blocked
numbers, replies and the Beem account; plus each person's language and opt-out.

**Do.**

1. Models in `schema.prisma`. **No `church_id`** (D27). A message, template,
   beat or grant names its department by `department_id`; **null means
   Communications itself**.

   | Table | What it is |
   | --- | --- |
   | `comms_audience_grants` | `(department_id, audience_key)`: a department may use this church-wide audience. |
   | `comms_templates` | One version of some words: `family_id` (the first version's id), `version`, `status` (`DRAFT`, `PENDING`, `ACTIVE`, `REJECTED`, `RETIRED`), the blanks it uses, who wrote, submitted and decided it. |
   | `comms_template_bodies` | `(template_id, lang)` → the body, at most 918 characters (six segments). |
   | `comms_messages` | One send: department, audience (key, parameters and the name it had), template, beat, the words per language, status, when, counts, segments and cost. |
   | `comms_recipients` | The outbox: one row per number, which is also the delivery record. |
   | `comms_schedules` | A beat: audience, two or more templates, days, time, jitter, start and end, next run. |
   | `comms_blocked_numbers` | A number that asked to be left alone, or that the carrier says is dead. |
   | `comms_inbound` | Whatever Beem sent us, exactly as it came. |
   | `comms_beem_account` | The Beem key and secret, encrypted, and the sender name. One row. |

2. **On existing tables:** `people.lang` (default `en`, **backfilled** from
   the registration each person came from, and copied by the registration's
   submit code from now on), `people.sms_opt_out`, `sms_opt_out_at`,
   `sms_opt_out_source` (`reply`, `office`, `form`), and `users.sms_opt_out`.

3. In the migration, what Prisma cannot say:

   ```sql
   alter table comms_beem_account add constraint comms_beem_account_singleton check (id = 1);
   revoke select on table comms_beem_account from irca_readonly;

   -- History is a record: it may be added to, never rewritten or removed.
   revoke delete, truncate on table comms_messages, comms_recipients, comms_inbound from irca_app;
   revoke update on table comms_inbound from irca_app;
   revoke update on table comms_messages, comms_recipients from irca_app;
   grant update (status, started_at, finished_at) on table comms_messages to irca_app;
   grant update (status, attempts, next_attempt_at, provider_message_id,
                 last_error, sent_at, delivered_at) on table comms_recipients to irca_app;
   ```

4. Add each table to `docs/plan/appendix-database.md`.

**Check.** The migration applies; `delete from comms_messages` as `irca_app`
is refused; `select lang, count(*) from people group by lang` shows the
backfilled languages.

**Commit.** "Tables for the Communication system"; "Record the language a
person answered in, and whether they want messages".

---

## 7.7 — Beem, behind a provider

**Goal.** Sending an SMS is one interface with three implementations, so
tests never touch the network and development never spends credit.

**Do.**

1. `apps/api/src/core/sms/`: `SmsProvider` with `send({ to, body, senderId })`
   and `balance()`; `memory.provider.ts` (tests), `log.provider.ts`
   (development, and production until Beem is set up), `beem.provider.ts`
   (reads the account from `comms_beem_account` **on every send**, D26).
   Tests always get memory; otherwise Beem when an account row exists, else
   the log.
2. **Beem's API**, as it was understood when this was written — **check it
   against Beem's current documentation before writing the code**:
   `POST https://apisms.beem.africa/v1/send`, HTTP Basic (key:secret), body
   `{ source_addr, schedule_time: '', encoding: 0, message, recipients: [{ recipient_id, dest_addr }] }`
   with `dest_addr` in international form without the `+`; balance at
   `GET https://apisms.beem.africa/public/v1/vendors/balance`.
3. **The key, encrypted (D26).** `BEEM_SETTINGS_KEY` (32 bytes, base64) in
   `env.ts` and `.env.example`; `core/sms/secret-box.ts` seals with
   AES-256-GCM and a fresh 12-byte nonce per value. With no key set, saving a
   Beem account is refused and says which variable to set.
4. **Segments**, in `packages/shared/src/sms.ts`, so the API and the composer
   count alike: GSM-7 is 160 for one segment, 153 each for several; anything
   else is UCS-2, 70 and 67. `segments(text)` returns `{ encoding, segments,
   charsLeft }`.
5. `BEEM_INBOUND_SECRET` (for 7.12) in `env.ts` and `.env.example`.

**Check.** Unit tests: 160 plain characters → 1 segment, 161 → 2; 70 with an
emoji → 1, 71 → 2; a Swahili sentence with `’` → UCS-2; `open(seal(x)) === x`
and a changed byte fails. `grep -rn "BEEM_API_KEY" apps` finds nothing.

**Commit.** "Count SMS segments the way the carriers do"; "Keep the Beem key
encrypted in the database"; "Send SMS through Beem, or to the log".

---

## 7.8 — Audiences, without Comms knowing any department

**Goal.** "Everyone in the praise team" becomes a list of phone numbers
without the Communications code importing the departments, Membership or
anything else.

**Do.**

1. `apps/api/src/core/comms/audience.registry.ts`: an `AudienceProvider` has a
   `key`, a `name`, the blanks it can fill, whether it is **church-wide**
   (grantable) or **departmental**, and `resolve(tx, params)` returning
   `{ personId?, userId?, name, dial, phone, lang? }` for each person. Each
   module registers its own in `onModuleInit`.

2. The audiences this phase ships:

   | Key | Registered by | Who | Parameters |
   | --- | --- | --- | --- |
   | `church.people` | membership | everyone in People | — |
   | `church.members` | membership | people at stage `CONFIRMED_MEMBER` | — |
   | `church.staff` | comms | every active staff account | — |
   | `membership.class` | membership | people in a foundation group | `groupId?` |
   | `departments.everyone` | departments | leaders and members of the chosen departments | `departmentIds` |
   | `departments.leaders` | departments | leaders of the chosen departments, or of every department | `departmentIds?` |

   A **leader** is reached on their person record's phone. A staff account
   linked to a person is too.

3. **The rules**, in one `AudienceResolver.resolve(…)`, so no caller can
   forget one:
   1. **Never** a number in `comms_blocked_numbers`, nor a person or staff
      account with `sms_opt_out`. They are still written, as
      `SKIPPED_OPT_OUT`, so the sender sees "12 of 143 were left alone".
   2. **One message per number**: a second listing is `SKIPPED_DUPLICATE`.
   3. **A number that isn't one** is `SKIPPED_NO_PHONE`. Normalise with
      `libphonenumber-js` from `dial + phone` into E.164.
   4. **Who may use what.** Communications (`comms.messages.send`): any
      audience. A department's leader: `departments.everyone` and
      `departments.leaders` for **that department only**, plus any church-wide
      audience granted to it in `comms_audience_grants`. Nothing wider is
      automatic (D22).

**Check.** An e2e test: an opted-out person is skipped and counted; the same
number twice is sent once; a leader is refused another department (403) and a
church-wide audience until it is granted.

**Commit.** "Resolve an audience without Comms knowing any department"; "Never
message someone who asked us not to".

---

## 7.9 — Templates: written by the department, approved once

**Goal.** The wording is agreed before it is used, and using it needs nobody.

**Do.**

1. `DRAFT → PENDING → ACTIVE`, or `REJECTED`. Editing an `ACTIVE` template
   makes version *n+1* in `DRAFT` (same `family_id`, `supersedes_id` pointing
   back); the old version keeps sending until the new one is approved, then
   becomes `RETIRED`.
2. **A body per language**, approved together. An empty language falls back
   to the church's default (`comms.defaultLang`, default `sw`).
3. **Blanks** are `{{snake_case}}`, worked out from the bodies when a draft is
   saved. Known blanks: `first_name`, `full_name`, `church_name`,
   `department_name` (filled from the recipient, the church and the
   department), and `event_name`, `date`, `time`, `venue` (typed by the sender
   when sending). Any other blank is refused at draft time, by name. (Phase 9
   adds `amount`, `balance`, `due_date`, `campaign_name`.)
4. **Nobody approves their own**: `comms.templates.approve`, and not the
   person who submitted it — the same rule and wording as change requests
   (D17).
5. **Never deleted**: a template is only ever retired.
6. Who drafts what: Communications (`comms.templates.draft`) drafts its own
   and any department's; a leader (`comms.department.draft`) drafts their
   department's.

Routes in `modules/comms/templates.controller.ts`: list, get, create, edit,
submit, approve, reject, retire.

**Check.** An e2e test: a draft cannot be sent; approving makes it usable;
editing it makes version 2 while version 1 still sends; approving version 2
retires version 1; the author cannot approve their own (403, with the reason);
`{{nickname}}` is refused and the message names `nickname`.

**Commit.** "Approve the words once, then let the department use them".

---

## 7.10 — Sending

**Goal.** A send that cannot quietly cost more than the church meant, reach
the wrong people, or be started by the wrong person.

**Do.**

1. `POST /v1/comms/messages` with `{ departmentId?, audience: { key, params },
   templateId, fields?, scheduledFor? }`, or `{ …, bodies }` for free text.
   Guarded by `@RequireAnyPermission('comms.messages.send',
   'comms.department.send')`, then, **in one `db.tx()`**, in this order:
   1. **May this person send for this department?** No department:
      `comms.messages.send`. A department: `comms.department.send` **and**
      they lead it now.
   2. **May they use this audience?** 7.8, rule 4.
   3. **Are the words allowed?** An `ACTIVE` template of that department or of
      Communications. Free text: `comms.messages.send_adhoc`, Communications
      only.
   4. **What will it cost?** Resolve, fill the blanks, add the way to stop
      (7.12), count segments, multiply by the price. **No daily cap saved:
      refuse.** Over the cap: refuse and say the figure — *"This would bring
      today's messages to 52,300 TZS; the daily limit is 50,000 TZS."*
   5. **Write, don't send.** One `comms_messages` row and one
      `comms_recipients` row per number, `PENDING`, with `next_attempt_at` at
      the scheduled time or now.
   6. `usage.inc('sms.queued', n)`, and `audit.recordIn(tx, …)` naming the
      audience, the template and the count. **Never** a phone number.

2. **Settings** in the `settings` table, defaults in
   `modules/comms/settings.ts`: `comms.pricePerSegment` (30 TZS),
   `comms.dailyCap` (**none**), `comms.defaultLang` (`sw`),
   `comms.quietHours` (`21:00-07:00`).

3. **The background sender**, beside `email-outbox`, every 15 seconds:
   claim 20 due `PENDING` rows; check the number is still not blocked (a STOP
   may have come since it was queued); send; `SENT`, or retry on the email
   back-off, `FAILED` after six tries; when a message has nothing left
   pending, mark it `SENT`, `PARTIAL` or `FAILED`.

4. `POST /v1/comms/messages/preview` runs steps 1–4 and writes nothing. The
   button says *"Send to 143 people · about 4,290 TZS"*.

5. **Cancelling** a scheduled or sending message (`comms.messages.cancel`, or
   the leader who sent it) marks what has not gone yet `CANCELLED`.

**Check.** An e2e test (`test/comms-sending.e2e-spec.ts`): a leader sends to
their department; a leader of another department is refused (403); no cap
saved refuses; the cap refuses with the figure; opted-out people are skipped
and counted; the memory provider received exactly the expected bodies, each in
the recipient's language, each with the way to stop once; the activity log
line contains no phone number.

**Commit.** "Send a message, or refuse to for a reason you can read"; "Deliver
the SMS queue in the background".

---

## 7.11 — Beats: the same message on a rhythm

**Goal.** "Every Tuesday at six, one of these three reminders, to the choir"
— set up once, and not sounding like a machine.

**Do.**

1. A beat names **two or more** approved templates and picks one at random
   each time (one is allowed, with a hint that two sound more human), and
   `jitterMinutes` sends within that window after the set time.
2. `nextRun(schedule, after, timezone, quietHours)` in
   `core/comms/next-run.ts`, pure and unit-tested hard, in the church's
   timezone.
3. A job every minute sends due beats **through the same code as a manual
   send** — grants, leadership, cap and opt-outs included, so a beat set up
   by a leader who has since stepped down stops sending. Then it stores the
   next run.
4. **Quiet hours**: a run that falls inside waits until morning.
5. Pausing is one field, and is audited. A beat is archived, never deleted.

**Check.** Unit tests for `nextRun`: a normal week; across a month's end;
Sunday only; a beat that ends mid-week; a time inside quiet hours. An e2e
test: a due beat produces a message from one of its templates, and its next
run moves into the future.

**Commit.** "Say something every Tuesday without sounding like an alarm".

---

## 7.12 — Replies and delivery reports

**Goal.** Someone who texts back STOP is left alone for good, without anyone
having to notice.

**Do.**

1. `POST /v1/public/comms/inbound` and `POST /v1/public/comms/delivery`,
   `@Public()`, throttled, 401 without `BEEM_INBOUND_SECRET`. Both store what
   they received in `comms_inbound` first.
2. A reply of `stop`, `acha`, `simama`, `unsubscribe` or `toka` blocks the
   number and sets `sms_opt_out` on the matching person or staff account. Any
   other reply is kept and shown in Comms → Overview.
3. A delivery report marks the recipient `DELIVERED` or `FAILED`; a permanent
   failure also blocks the number.
4. **Every message carries the way out**, added when the body lacks it:
   ` Jibu ACHA kuacha.` (sw), ` Reply STOP to stop.` (en),
   ` Répondez STOP pour arrêter.` (fr). Counted into the segments. It cannot
   be switched off (D22).
5. Write the two URLs and the secret into `docs/deployment.md`.

**Check.** An e2e test: STOP blocks and the next send skips them; a delivery
report marks a row `DELIVERED`; a wrong secret gets 401 and writes nothing.

**Commit.** "Honour a STOP, for good"; "Keep the delivery reports and what they
mean".

---

## 7.13 — What it costs, and what is left

**Do.** Add `sms.queued`, `sms.sent`, `sms.delivered`, `sms.failed`,
`sms.skipped_opt_out`, `sms.segments`, `sms.cost` (counters) and `sms.balance`
(gauge) to `usage-metrics.ts`; read Beem's balance every hour; show the SMS
queue and the credit on **Dev → Health**; show this month's messages,
segments and cost by department on **Comms → Overview**.

**Check.** After an e2e send, `usage_daily` has `sms.queued` and `sms.cost`
for today; **Dev → Usage → Every number** can chart "Messages sent".

**Commit.** "Count what messaging costs, per department".

---

## 7.14 — The Comms pages

**Goal.** Two front doors onto the same machinery: the Comms portal, and each
department's Messages page under My departments.

Pages go in `apps/portal/src/app/(app)/comms/…`, shared parts in
`apps/portal/src/modules/comms/`. Follow `docs/adding-a-module.md` §4.

| Page | What is on it |
| --- | --- |
| Overview | This month: sent, delivered, failed and cost, by department; credit left; templates waiting; recent replies. |
| Compose | Audience (whole church, members, staff, departments, leaders — all or chosen) → template or free text → a preview per language → count, skips, segments, cost → **Send** (a `Dialog`, it spends money) or schedule. |
| History | Every message, newest first, filterable. One message shows its recipients and their status; numbers are masked unless the reader holds `membership.people.read_sensitive`. |
| Templates | By status, with versions; approve and reject with a note. |
| Recurring | The beats, their next run, pause, resume. |
| Audiences | Each church-wide audience, how many it reaches today, and which departments may use it. Grant and revoke. |
| Settings | Beem account (masked, **Test connection**), price, daily cap, quiet hours, default language. |

**A department's Messages page** (`/departments/[id]/messages`) is the same
Compose, History and Templates with the department fixed and only its
audiences offered.

Also: the person's page in Membership gains **Language** and **No messages**;
the Account page gains **Text me messages** for staff.

**Check.** From a fresh database, in a browser, as the Communications lead
(everything), as a department leader (their department only) and as a staff
member who leads nothing (no Compose). Send one message end to end and see it
in History as sent (the log provider "sends" it).

**Commit.** One per group: "The Comms portal: what was sent and what it cost";
"Compose a message and see what it will do before sending"; "Templates, their
versions and their approval"; "Recurring messages"; "Audiences and who may use
them"; "Comms settings, with the Beem key kept masked"; "A department's own
Messages page".

---

## 7.15 — Prove it

The **permission matrix** and the **impersonation sweep** from Phase 6 cover
every new route by themselves. Then, in `apps/api/test/comms.e2e-spec.ts` and
`e2e/comms.spec.ts`:

1. **Viewing as someone cannot send.** A developer viewing as the
   Communications lead presses Send and gets `IMPERSONATION_READ_ONLY`.
2. **The department wall.** A leader cannot send to another department, read
   its history, or use its template.
3. **The opt-out holds everywhere:** a manual send, a beat and a preview all
   skip a blocked number.
4. **Browser journey.** A leader opens their department's Messages page,
   picks the welcome template, sees the count and the cost, sends, and sees
   the rows sent.

**Check.** All suites pass. Then, for each of 1–3, remove its guard, watch the
test fail, and put it back.

**Commit.** "Prove the Communication system's walls".

---

## 7.16 — Phase check

- [ ] Departments exist in Admin, with leaders named only by administrators, and only confirmed members.
- [ ] A leader is invited, signs in, and adds and removes their department's members.
- [ ] Ending a leadership takes the leader's access away with nothing else to do.
- [ ] A department portal cannot be switched on without its department.
- [ ] Communications can be turned on in Admin → Portals, with three roles.
- [ ] A template goes Draft → Pending → Active, and its author cannot approve it.
- [ ] A leader sends to their own department without asking anyone, and cannot reach anyone else unless granted.
- [ ] Communications sends to the whole church, to departments, to all leaders, and to chosen departments' leaders.
- [ ] Every message carries the way to stop, and a STOP is honoured for good.
- [ ] Each person is written to in their own language (`people.lang`).
- [ ] No send goes out until a daily cap is saved; the cap refuses an over-budget send and names the figure.
- [ ] A beat sends on its rhythm, from its variants, never in quiet hours.
- [ ] The Beem key is never shown in full and never sent back to the browser.
- [ ] Dev → Usage charts messages sent and their cost; Dev → Health shows the credit left.
- [ ] `appendix-database.md`, `data-inventory.md`, `what-works-now.md` and the metric list are updated.
- [ ] Someone other than the builder has walked it in a browser from a fresh database.

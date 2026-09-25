# Phase 8 — The Outreach & Evangelism portal

> **In one sentence:** the evangelism team stops keeping names and phone
> numbers in a notebook and on someone's phone, and instead records them in
> four fields on a phone — into the church's one list of people — then follows
> each person up until they come to church.

**Status:** in progress. **Comes after:** Phase 7 (the department, its
members and the Friday reminders all come from there). **Comes before:**
Phase 9, which uses the person timeline this phase builds.

> **Corrected for D28 and D29 on 25 Sept 2026, before the first Phase 8
> commit.** Outreach is a department (Admin → Departments), and its portal
> belongs to it. Its **team is the Outreach department's leaders and
> members**, kept in **My departments → Outreach** like any department's:
> there is no `outreach_members` table, no team routes and no
> `outreach.team.manage`. Its **leaders run the portal by leading the
> department** (D29): the module lists what they may do, and nobody gives
> them a role. The people who go out and record sign in with the **Outreach
> member** role, made in Admin like every staff account. **Messages** go from
> My departments → Outreach → Messages with the leadership permissions of 07
> step 7.3: there is no `outreach.comms.*` permission and no Outreach
> audience of its own team — `departments.everyone` already is one. Two more
> corrections came from reading the code: phone numbers are part of
> `membership.people.read`, not `read_sensitive` (so the plan's "only the
> leader sees numbers" never matched Membership), and Outreach does not need
> any Membership role at all — it shows the people **it** reached, with their
> numbers, behind its own `outreach.reached.read`, and never the wider People
> list.

---

## Before you start

**1. What must already be true.**

- Phase 7 is done: departments, leaders, members, templates and sending work.
- Step 8.1 needs four answers from the Outreach leader. Build 8.2 onwards on
  the recommendations written into each step while you wait, and correct the
  step when the answers come.

**2. Read these first** (about 30 minutes):

| Read | Why |
| --- | --- |
| `00-decisions.md`, D23 | One person record, and one timeline every portal writes to. The most important idea in this phase. |
| `00-decisions.md`, D28 and D29 | The team is the department; its leaders run the portal by leading it. |
| `00-decisions.md`, D22 | Why Outreach may text its team but not, by default, the people it reached. |
| `00-decisions.md`, D24 | How files are stored. Step 8.9 is the first file upload in the system. |
| `docs/modules/outreach-brief.md` | What the Outreach department told us it does. |
| `docs/adding-a-module.md` | The recipe for a new portal. |
| `apps/api/src/modules/departments/departments.service.ts` | Who leads and who belongs. Outreach reads its team from here rather than keeping its own. |

**3. Get your machine ready** — the same as every phase:

```bash
cd ~/dev/irca/irca-system
git checkout dev-allord && git pull
npm install && npm run db:migrate && npm run db:seed
npm run dev
```

**4. The loop for every step:** read → do → the step's **Check** →
`npm run typecheck && npm run lint && npm test && npm run test:e2e -w @irca/api`
→ commit with the step's title → push `dev-allord`. (`README.md` §2.)

---

## What you are building, in plain words

The owner's rule for this whole phase (22 Sept 2026):

> Capture minimally during the work, enrich the record later. The system
> should replace their notebook/phone-number process with something easier,
> not turn Saturday evangelism into paperwork.

If a screen makes a Saturday afternoon slower, it is wrong, however complete
its data. Measure every screen against that.

The department's week, in the order they live it:

```
   Team            →   Saturday            →   People reached      →   Follow-up
   ────                ────────                ──────────────          ─────────
   the department's    a session               name, phone,            calls, visits,
   leaders and         teams sent to areas     location, who           invitations,
   members; partner    counts per team         reached them —          "came to church"
   groups of 2 or 3    a PDF report after      nothing else required
                                   Friday training
                                   ───────────────
                                   topic, trainer, venue, who came
```

…and one dashboard over all of it.

**Who does what.**

| Who | How they got there | What they do here |
| --- | --- | --- |
| An Outreach **leader** | Named by an administrator in Admin → Departments (a confirmed member) | Everything in the portal (D29): partner groups, Saturdays, training, the report; and, as every leader can, keeps the members and sends the department's messages. |
| An Outreach **member** who signs in | Added to the department by a leader; given a staff account with the *Outreach member* role in Admin | Records who was reached, follows them up, sees the dashboard. |
| An Outreach member who does not sign in | Added to the department by a leader | Goes out on Saturdays, is picked for teams, is marked at training and receives the reminders. Most of the team. |
| A pastor or overseer | *Outreach viewer* role in Admin | Reads everything, changes nothing. |

**The rule that shapes the tables (D23):** a person reached on a Saturday
becomes a row in the church's **existing** `people` table — the same list the
registration form and the Membership portal use — not an "outreach contact".
The owner: *"The person then becomes part of the central church People
system, so if they later attend church, register for something, or become a
member, the church doesn't create another duplicate record."*

## Words used in this phase

| Word | Meaning |
| --- | --- |
| **Team** | The Outreach department's leaders and members, now. Always people already in the church's People list. |
| **Partner group** | Two or three of the team who usually go out together. |
| **Session** | One Saturday's outreach. |
| **Session team** | A group sent to one area on that Saturday. Its people may differ from the standing group — partners get swapped on the day. |
| **Reached** | A person the team spoke to, recorded against a session and team. |
| **Interaction** | One thing that happened with a person — evangelised, called, visited, invited, came to church — from any portal. Together they make the person's **timeline**. |
| **Follow-up** | Calls, visits and invitations after someone was reached. Any number of each, in any order. |

## The steps at a glance

| Step | What | You are done when |
| --- | --- | --- |
| 8.1 | The brief | The Outreach leader's answers are in `outreach-brief.md`. |
| 8.2 | The module, and what its leaders may do | Outreach appears in Admin → Portals with two roles and its leaders' list; a leader of Outreach holds it, a leader of the choir does not. |
| 8.3 | The tables, and the shared timeline | The migration runs; the timeline cannot be deleted from; Membership writes to it. |
| 8.4 | The team and partner groups | The team page lists the department's people; a group can only be made from them. |
| 8.5 | Saturday, and the people reached | A person is recorded in four fields on a phone, and a known person is matched, not duplicated. |
| 8.6 | Follow-up and the timeline | Calls, visits and "came to church" show on one timeline, in both portals. |
| 8.7 | Friday training | Attendance is marked, and the team reminded through the department's Messages. |
| 8.8 | The dashboard | Every number matches a hand count and opens the list behind it. |
| 8.9 | The session report as a PDF | The file is private, limited, and mentioned in the data inventory. |
| 8.10 | Prove it | The tests below exist and fail when their guard is removed. |
| 8.11 | Phase check | Every box ticked. |

---

## 8.1 — The brief

**Goal.** The department's own answers, before any code relies on them.

**Do.** Take `docs/modules/outreach-brief.md` to the Outreach leader and
settle the *TBC* items:

1. How many are in the team, and who leads it? Are they all in the church's
   People list already? (If not, they register on the form or the office adds
   them in Membership — Outreach never creates a team member's record.) The
   leader must be a confirmed member to be named one (D28).
2. Do partner groups hold for a season, or change every Saturday? (The tables
   allow both; the answer decides what the Saturday screen shows first.
   *Built meanwhile:* groups are offered first when planning, and a team can
   always be put together for the day.)
3. Which areas do they go to, by name? (These become suggestions, not a fixed
   list: a new estate must never need a developer. *Built meanwhile:*
   suggestions come from the areas already used.)
4. Which dashboard numbers do they report upward, and to whom? Those must be
   exact, not roughly right. (*Built meanwhile:* every figure in 8.8.)

Write the answers, with the date, in place of each *TBC*.

**Check.** `grep -n TBC docs/modules/outreach-brief.md` finds nothing in
sections 1–3.

**Commit.** "Write down how Outreach actually works on a Saturday".

---

## 8.2 — The module, and what its leaders may do

**Goal.** An `outreach` module whose leaders run it by leading the department
(D29), with a role for the people who go out and one for those who only look.

**Do.**

1. **A portal's leaders (D29).** In `packages/shared/src/rbac/define.ts`, a
   module may carry

   ```ts
   /**
    * What the leaders of the department this portal belongs to may do in it,
    * without any role (D29). Ordinary permissions of this module.
    */
   leaders?: { description: string; permissions: string[] };
   ```

   `defineModule` refuses an unknown permission in it, and a `leaders` list on
   a `core` module (a core module belongs to no department). In
   `packages/shared/src/modules/index.ts`, export
   `PORTAL_LEADER_PERMISSIONS: { moduleKey, key }[]`.

   `PermissionResolver.forUser` (`apps/api/src/core/rbac/`) adds a third part
   to its one query: the `module_key` of every department the person leads
   that is not archived, whose portal is on, returned prefixed with `#`. Each
   such portal's `leaders` permissions are added. The e2e test that proves it:
   a leader of Outreach holds `outreach.sessions.manage`; a leader of the
   choir does not; ending the leadership, archiving the department or
   switching the portal off takes it away on the next request.

2. Create `packages/shared/src/modules/outreach.ts` (copy the shape of
   `finance.ts`):

   ```ts
   // sketch — keep these keys exactly
   export const outreachModule = defineModule({
     key: 'outreach',
     name: 'Outreach',
     description: 'Evangelism: the team, the Saturdays, the people reached and the follow-up.',
     kind: 'department',
     home: '/outreach',
     permissions: {
       'outreach.dashboard.read':  { kind: 'read',  label: 'See the Outreach dashboard' },
       'outreach.team.read':       { kind: 'read',  label: 'See the team and its partner groups' },
       'outreach.groups.manage':   { kind: 'write', label: 'Make and change partner groups' },
       'outreach.sessions.read':   { kind: 'read',  label: 'See the Saturday sessions' },
       'outreach.sessions.manage': { kind: 'write', label: 'Plan a Saturday, send teams to areas, and close it' },
       'outreach.reached.read':    { kind: 'read',  label: 'See the people reached, with their phone numbers, and their timelines' },
       'outreach.reached.record':  { kind: 'write', label: 'Record someone reached, and follow them up' },
       'outreach.training.read':   { kind: 'read',  label: 'See the Friday training' },
       'outreach.training.manage': { kind: 'write', label: 'Plan training and mark who came' },
       'outreach.reports.read':    { kind: 'read',  label: 'See and download session reports' },
       'outreach.reports.upload':  { kind: 'write', label: 'Attach a session report' },
     },
     leaders: {
       description: 'Leaders of the Outreach department run it: the partner groups, the Saturdays, the training and the reports.',
       permissions: [/* every permission above */],
     },
     systemRoles: [
       { key: 'outreach.member', name: 'Outreach member',
         description: 'Goes out on Saturdays, records who was reached and follows them up.',
         permissions: ['outreach.dashboard.read', 'outreach.team.read', 'outreach.sessions.read',
                       'outreach.reached.read', 'outreach.reached.record', 'outreach.training.read',
                       'outreach.reports.read'] },
       { key: 'outreach.viewer', name: 'Outreach viewer',
         description: 'A pastor or overseer who reads the numbers without changing anything.',
         permissions: ['outreach.dashboard.read', 'outreach.team.read', 'outreach.sessions.read',
                       'outreach.reached.read', 'outreach.training.read', 'outreach.reports.read'] },
     ],
     nav: [
       { label: 'Dashboard', href: '/outreach',          icon: 'dashboard',    permission: 'outreach.dashboard.read' },
       { label: 'Saturdays', href: '/outreach/sessions', icon: 'sessions',     permission: 'outreach.sessions.read' },
       { label: 'Reached',   href: '/outreach/reached',  icon: 'people',       permission: 'outreach.reached.read' },
       { label: 'Follow-up', href: '/outreach/followup', icon: 'discipleship', permission: 'outreach.reached.read' },
       { label: 'Team',      href: '/outreach/team',     icon: 'roles',        permission: 'outreach.team.read' },
       { label: 'Training',  href: '/outreach/training', icon: 'training',     permission: 'outreach.training.read' },
     ],
   });
   ```

   There is no Messages item: the leader's messages are under **My
   departments → Outreach → Messages**, which they already have.

3. Add `sessions` and `training` to the `NavIcon` type and draw them in
   `apps/portal/src/components/shell/NavIcon.tsx` (a map pin on a route; a
   board with a person).
4. Add `outreachModule` to `CHURCH_MODULES`, after Communications. The seed
   creates the **Outreach** department with the `outreach` portal, beside
   Membership, Finance and Communications.
5. **Admin → Portals** shows, under a portal with a `leaders` list, *"Leaders
   of Outreach also: …"* with the permissions' labels, so an administrator
   can see where a leader's access comes from.

**What Outreach does not need from Membership.** The plan once gave every
Outreach member a Membership role to search people and the leader a second
one for phone numbers. Neither is needed: the team is picked in My
departments (whose search shows names and the end of a number, 07 step 7.4);
matching a person already known happens in the API when recording (8.5); and
what Outreach shows about a person — name, phone, area, language and
timeline — is shown by Outreach, for people **it reached**, behind its own
`outreach.reached.read`. The wider People list, prayer requests and
everything else Membership keeps stay behind Membership's permissions.
**Never** copy people's data into Outreach tables to get around this; a copy
is how a church ends up with the same family three times.

**Check.** `npm test` passes, including `defineModule` refusing a `leaders`
list with an unknown permission. In the browser, **Admin → Portals** offers
Outreach once the seed's department exists, and says what its leaders get;
turning it on shows its two roles in **Admin → Roles**. The resolver test
above passes.

**Commit.** "Let a portal's own leaders run it"; "Describe the Outreach
module".

---

## 8.3 — The tables, and the shared timeline

**Goal.** Outreach's own tables, plus one timeline table every portal writes
to. No `church_id` anywhere (D27), and no team table (D28).

**Do.**

1. Add to `apps/api/prisma/schema.prisma`. References to people, users and
   departments are ordinary relations with foreign keys; references to people
   cascade, so `person:erase` takes them with the person.

   ```prisma
   // sketch

   /// A standing partnership: two or three of the team who usually go out together.
   model OutreachGroup {
     id        String   @id @default(uuid(7)) @db.Uuid
     name      String   @unique @db.VarChar(60)
     isActive  Boolean  @default(true) @map("is_active")
     createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
     members   OutreachGroupMember[]
     @@map("outreach_groups")
   }

   model OutreachGroupMember {
     groupId  String @map("group_id") @db.Uuid
     personId String @map("person_id") @db.Uuid
     @@id([groupId, personId])
     @@map("outreach_group_members")
   }

   enum OutreachSessionStatus { PLANNED  COMPLETED  CANCELLED }

   /// One Saturday.
   model OutreachSession {
     id          String                @id @default(uuid(7)) @db.Uuid
     heldOn      DateTime              @map("held_on") @db.Date
     title       String                @default("") @db.VarChar(80)
     status      OutreachSessionStatus @default(PLANNED)
     notes       String                @default("") @db.VarChar(2000)
     createdById String                @map("created_by_id") @db.Uuid
     createdAt   DateTime              @default(now()) @map("created_at") @db.Timestamptz(6)
     teams       OutreachSessionTeam[]
     @@index([heldOn(sort: Desc)])
     @@map("outreach_sessions")
   }

   /// A team sent to one area on that Saturday.
   model OutreachSessionTeam {
     id           String  @id @default(uuid(7)) @db.Uuid
     sessionId    String  @map("session_id") @db.Uuid
     /// The standing group it started from, if any.
     groupId      String? @map("group_id") @db.Uuid
     area         String  @db.VarChar(80)
     /// People spoken to without taking details. Recorded people are counted, not typed.
     spokenToOnly Int     @default(0) @map("spoken_to_only")
     notes        String  @default("") @db.VarChar(1000)
     members      OutreachSessionTeamMember[]
     @@index([sessionId])
     @@map("outreach_session_teams")
   }

   model OutreachSessionTeamMember {
     teamId   String @map("team_id") @db.Uuid
     personId String @map("person_id") @db.Uuid
     @@id([teamId, personId])
     @@map("outreach_session_team_members")
   }

   /// A person reached on a Saturday. Their own details live in `people`.
   model OutreachReached {
     id            String   @id @default(uuid(7)) @db.Uuid
     personId      String   @map("person_id") @db.Uuid
     sessionId     String?  @map("session_id") @db.Uuid
     teamId        String?  @map("team_id") @db.Uuid
     reachedOn     DateTime @map("reached_on") @db.Date
     area          String   @default("") @db.VarChar(80)
     /// The team who spoke to them: people, not staff accounts.
     reachedByIds  String[] @map("reached_by_ids") @db.Uuid
     needsFollowUp Boolean  @default(true) @map("needs_follow_up")
     note          String   @default("") @db.VarChar(1000)
     recordedById  String   @map("recorded_by_id") @db.Uuid
     createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
     @@index([reachedOn(sort: Desc)])
     @@index([personId])
     @@map("outreach_reached")
   }

   /// A Friday training.
   model OutreachTraining { /* topic, trainer, heldAt, venue, notes, createdById */ }

   model OutreachTrainingAttendance {
     trainingId String         @map("training_id") @db.Uuid
     personId   String         @map("person_id") @db.Uuid
     mark       AttendanceMark // the enum the foundation class uses
     markedById String         @map("marked_by_id") @db.Uuid
     markedAt   DateTime       @default(now()) @map("marked_at") @db.Timestamptz(6)
     @@id([trainingId, personId])
     @@map("outreach_training_attendance")
   }
   ```

2. **The shared timeline** belongs to Membership, because every portal writes
   to it (D23). Add it beside `Person`:

   ```prisma
   /// Everything that happened with a person, from any portal, in order. Never
   /// edited or deleted. `people.stage` stays as the one-word summary.
   model PersonInteraction {
     id        String          @id @default(uuid(7)) @db.Uuid
     personId  String          @map("person_id") @db.Uuid
     kind      InteractionKind
     // EVANGELISED | CALL | VISIT | INVITED | ATTENDED_SERVICE | TRAINING |
     // REGISTERED | CLASS_SESSION | APPLIED | CONFIRMED | NOTE
     at        DateTime        @db.Timestamptz(6)
     /// Which portal recorded it, for the timeline's small labels.
     moduleKey String          @map("module_key") @db.VarChar(30)
     /// The staff member, or null when the system recorded it.
     byId      String?         @map("by_id") @db.Uuid
     /// One line in plain words: "Evangelised by Peter and John, Sombetini".
     summary   String          @db.VarChar(200)
     /// Whatever the recording portal wants back later: session id, enrolment id.
     meta      Json            @default("{}")
     createdAt DateTime        @default(now()) @map("created_at") @db.Timestamptz(6)
     @@index([personId, at(sort: Desc)])
     @@index([kind, at(sort: Desc)])
     @@map("person_interactions")
   }
   ```

   A summary is read by everyone who may see the person in **either**
   portal, so it never carries what Membership keeps behind
   `read_sensitive`: a Membership note becomes *"Home visit, by Grace"*, never
   the note itself.

   And on `people`: `source String @default("FORM") @db.VarChar(10)` — one of
   `FORM`, `OFFICE`, `OUTREACH` — so the dashboard can say how many people
   came from evangelism. Backfill: `OFFICE` where `registration_id is null`,
   else `FORM`. `sms_opt_out_source` gains the value `outreach`.

3. Create the migration without applying it (`cd apps/api && npx prisma
   migrate dev --create-only --name outreach`) and add:

   ```sql
   -- A timeline that can be tidied up is not a timeline.
   revoke update, delete, truncate on table person_interactions from irca_app;
   -- Who was reached, and when, is a record too. Only the follow-up flag,
   -- the area and the note are filled in later.
   revoke delete, truncate on table outreach_reached from irca_app;
   revoke update on table outreach_reached from irca_app;
   grant update (needs_follow_up, area, note) on table outreach_reached to irca_app;
   -- Sessions and groups are closed or switched off, never deleted: what
   -- happened on last year's Saturdays keeps its answer.
   revoke delete, truncate on table outreach_sessions, outreach_groups from irca_app;
   ```

   Then `npx prisma migrate dev`.

4. **Write the timeline from what already happens.** In the same commit
   series, make the existing Membership code add an interaction when it
   already records an event: a registration submitted (`REGISTERED`), a class
   session marked attended (`CLASS_SESSION`, once per enrolment and session,
   so marking it twice does not write it twice), an application entered, from
   the office or from the form (`APPLIED`), a member confirmed (`CONFIRMED`),
   and a call or visit logged as a note (`CALL`, `VISIT`, without the note).
   Use one helper, `apps/api/src/modules/membership/timeline.ts`,
   `recordInteraction(tx, {...})`, called inside the same `db.tx()` as the
   change it describes. `person:erase` counts and removes them with the
   person.

5. Add the new tables to `docs/plan/appendix-database.md`.

**Check.** `npx prisma migrate dev` runs; `npm run test:e2e -w @irca/api` is
green; as the app role, `delete from person_interactions` is refused; after
submitting a registration in the form, the person has a `REGISTERED` row.

**Commit.** "Tables for Outreach"; "One timeline per person, written by every
portal".

---

## 8.4 — The team and partner groups

**Goal.** Outreach sees its team without keeping one, and makes partner
groups from it.

**Do.**

1. **The team is the department** (D28). `GET /v1/outreach/team`
   (`outreach.team.read`) returns the Outreach department's leaders (with
   their titles) and members, now, each with their partner group, how many
   Saturdays they went out on in the last three months, and their training
   attendance (8.7). The page's **Add or remove people** link opens **My
   departments → Outreach**, shown only to its leaders. Anyone in People can
   be a member, whatever their stage — the owner: *"regardless of their
   current membership/visitor status"*.
2. Someone who left the team keeps every row that names them: last year's
   Saturdays still say who was there, because sessions point at people, not at
   memberships.
3. **Partner groups** (`outreach.groups.manage`):
   `POST /v1/outreach/groups { name, personIds }` (two or three people, each
   on the team now), `PUT /v1/outreach/groups/:id` (rename, change people),
   `PUT /v1/outreach/groups/:id/active`. A group is switched off, never
   deleted, because sessions point at it.

**Check.** An e2e test (`apps/api/test/outreach.e2e-spec.ts`): the team lists
the department's leaders and members and nobody else; a group of one, or of
four, is refused; a group with someone not on the team is refused, and the
message names them; the same group name twice is refused with
`ALREADY_EXISTS`; a member without `outreach.groups.manage` gets 403.

**Commit.** "The Outreach team is its department"; "Partner groups that hold
for a season".

---

## 8.5 — Saturday, and the people reached

**Goal.** The Saturday screens work on a phone, standing up, and record a
person in **four fields**: name, phone, location, who reached them.

**Do.**

1. **Plan the session** (`outreach.sessions.manage`, before the day): date and
   title, then a team per area — pick a standing group or put people together
   for the day, from the team, and type the area, with suggestions from areas
   already used. Mark it **Completed** or **Cancelled** afterwards; a session
   is never deleted.
2. **Record who was reached** (`outreach.reached.record`, during the day or
   after): `POST /v1/outreach/reached` with `{ sessionId?, teamId?, fullName,
   dial, phone, area, reachedByIds?, lang?, mayMessage, needsFollowUp?,
   note?, samePersonId?, notSamePerson? }`. Choosing a team fills the area and
   who reached them from it, so on the day three fields are typed. In one
   `db.tx()`:
   - find the person (next point) or create one in `people` with
     `source = 'OUTREACH'`, `stage = 'VISITOR'`, `lang` as ticked (default the
     church's default language);
   - add an `outreach_reached` row joining them to the session and team;
   - add a `person_interactions` row, kind `EVANGELISED`, summary like
     *"Evangelised by Peter and John, Sombetini"*;
   - `audit.recordIn(tx, …)` (never the phone number) and
     `usage.inc('outreach.reached')`.
3. **Match, don't duplicate.** Before creating anyone, look for a person with
   the same phone (compared on digits of `dial + phone`, with a leading `0`
   read as the dialling code, the way `libphonenumber-js` normalises it), or —
   only when no phone was given — a close name (Postgres `similarity()`, as
   the finance item suggestions already use). Answer `409 POSSIBLE_MATCH`
   with the candidates instead of saving: *"Neema Mollel, reached 3 Aug in
   Kaloleni. Same person?"* — name, when and where they were last reached or
   registered, nothing else. **Same person** resends with `samePersonId` and
   adds a second reach and interaction on her; **Someone else** resends with
   `notSamePerson: true` and saves a new person. This must be in the first
   version — it is the whole reason the People list is shared.
4. **Consent (D22).** The form carries one tick box, *"May the church send
   them messages?"*, which the evangelist ticks after asking. Unticked sets
   `sms_opt_out` on a new person, with `sms_opt_out_source = 'outreach'`. On a
   person already known it only ever turns messages off, never back on.
5. **Filled in later.** The area, the note and whether they still need
   following up are editable afterwards (`PATCH /v1/outreach/reached/:id`):
   the team often records *"after the team returns, when they meet and
   discuss the people they reached"*. The Reached list marks records that are
   still thin (no phone, no area), so the team can see what is worth
   finishing. The person's own name and number are corrected in Membership,
   by the office, where the rest of their record is.
6. **The counts.** A team's number reached is the rows recorded for it,
   counted — plus `spokenToOnly`, a number the team may type for people spoken
   to without taking details, shown separately as "spoken to, no details".
   Saturdays genuinely produce both.

**Check.**

- e2e: recording with only the four fields works; recording the same phone
  number twice returns the match, and accepting it leaves one person with two
  interactions; a viewer gets 403 on every write; unticking consent opts the
  new person out.
- In the browser at phone width (360 px wide in Chrome's device toolbar): the
  record form can be filled and saved scrolling at most once.
- Time yourself recording five people: under a minute each.

**Commit.** "Plan a Saturday and send teams to areas"; "Record someone reached
in four fields"; "Match a person we already know instead of making a second
one".

---

## 8.6 — Follow-up, and whether they came

**Goal.** Answer the question Outreach actually cares about: *did the people we
reached ever come to church?*

**Do.**

1. **The Follow-up page:** people Outreach reached who still need following
   up, oldest first, each with the last thing that happened and a call button
   (a `tel:` link). The number is Outreach's to show here, to anyone with
   `outreach.reached.read`: following up by phone is the member's job.
2. **Recording a follow-up** (`POST /v1/outreach/people/:personId/followups`,
   `outreach.reached.record`) adds one `person_interactions` row — `CALL`,
   `VISIT` or `INVITED` — with a short note, and optionally clears
   `needs_follow_up`. **As many as it takes, in any order** — the owner:
   *"every interaction is recorded separately, so someone can be contacted or
   visited multiple times."* It is not a pipeline. The note is read by
   everyone who can see the person, in either portal, and the form says so.
3. **"Came to church"** is an `ATTENDED_SERVICE` interaction. Nothing in the
   system records Sunday attendance yet, so this page has a **Came on Sunday**
   button that writes one, with the date. When Membership gains attendance
   marking, it writes the same interaction and this button can go.
4. **The timeline component**, used by both the Membership person page and
   Outreach, in `apps/portal/src/modules/membership/Timeline.tsx`, showing
   exactly the owner's example:

   ```
   Sept 5   Evangelised by Peter & John · Sombetini      Outreach
   Sept 7   Follow-up call — will come on Sunday          Outreach
   Sept 12  Home visit — met her husband                  Outreach
   Sept 19  Invited to church                             Outreach
   Sept 20  First attendance                              Outreach
   Sept 27  Attended again                                Membership
   ```

   Served twice, from one query: `GET /v1/membership/people/:id/timeline`
   behind `membership.people.read`, and inside
   `GET /v1/outreach/people/:personId` behind `outreach.reached.read` — which
   answers only for someone Outreach has reached (404 otherwise), so it
   cannot be used to read the rest of People.
5. **Stage and timeline must agree.** `people.stage` is a one-word summary of
   the timeline, never a separate truth. Attending does not change a stage;
   Membership's own actions (saved, class, confirmed) still do, and now also
   write their interaction (8.3, point 4).

**Check.** e2e: three calls and two visits on one person all appear, in order,
with who did each; a Membership user sees Outreach's interactions on the
person page, and an Outreach member sees Membership's; an Outreach member
asking for a person Outreach never reached gets 404.

**Commit.** "Follow someone up as many times as it takes"; "One timeline, from
the doorstep to membership".

---

## 8.7 — Friday training

**Goal.** The weekly training, who came, and a reminder that goes out without
the leader asking anyone.

**Do.**

1. Training pages: topic, trainer, date and time, venue; then mark each of the
   team present or absent with the same marking control the foundation class
   register uses (`apps/portal/src/app/(app)/membership/discipleship/`), so
   nobody learns it twice. `outreach.training.manage`.
2. Each mark of *attended* also writes a `TRAINING` interaction on that
   person's timeline, once per training.
3. **The reminder uses Phase 7 — nothing about sending is built here.**
   - The team is `departments.everyone` for the Outreach department, which
     its leaders can already reach (07 step 7.8).
   - Register one audience provider, `outreach.reached` (church-wide): people
     Outreach reached who have not opted out. It is **not** granted
     automatically (D22); Communications grants it in Comms → Audiences if the
     church decides to.
   - The leader drafts a training-reminder template, in each language, under
     My departments → Outreach → Templates, and Communications approves it.
   - **Remind the team** on the training page opens **My departments →
     Outreach → Messages** with the department's everyone-audience chosen,
     shown only to its leaders. Or the leader sets up a beat there
     (Thursdays at 18:00, two variants).
4. **History:** each person's attendance over the last twelve trainings, so
   the leader can see who has stopped coming.

**Check.** e2e: create a training, mark nine present and one absent; nine
`TRAINING` interactions exist; a leader sending an approved template to
`departments.everyone` for Outreach queues one message per team member, each
in their own language; an Outreach member who is not a leader cannot send it
(403); `outreach.reached` is refused to the Outreach leader until granted.

**Commit.** "Friday training and who came"; "Remind the team through their
department's messages".

---

## 8.8 — The dashboard

**Goal.** The numbers the leader reports upward, on one screen, for a week, a
month or a year.

**Do.** One page (`/outreach`), one API call
(`GET /v1/outreach/dashboard?from=&to=`), computed in SQL:

| Figure | How it is counted |
| --- | --- |
| People reached | `outreach_reached` rows in the period; "spoken to, no details" shown separately |
| Awaiting follow-up | people with a reach still marked `needs_follow_up` |
| Follow-ups done | `CALL`, `VISIT` and `INVITED` interactions recorded by Outreach in the period |
| People visited | distinct people with a `VISIT` in the period |
| First-time attenders from Outreach | people with an `EVANGELISED` and a later **first** `ATTENDED_SERVICE` in the period |
| Sessions held | sessions `COMPLETED` in the period |
| Areas covered | distinct areas on the period's teams |
| Team participation | distinct people on a session team, and each person's count |
| Training attendance | `ATTENDED` marks ÷ marks, over trainings held |
| Trends | each figure by week, using the chart components in `apps/portal/src/modules/dev/components/Charts.tsx` |

**Every figure is a link** to the list behind it. A number that cannot be
opened is a number nobody trusts.

Add the metrics to `packages/shared/src/usage-metrics.ts`: `outreach.reached`,
`outreach.followups`, `outreach.visits`, `outreach.sessions`,
`outreach.training.attendance` (counters), `outreach.followups.pending`
(gauge, in the nightly snapshot).

**Check.** Seed a known Saturday by hand in a test, and assert each figure
against a hand count; in the browser, click every figure and see the list it
came from.

**Commit.** "The Outreach dashboard, and the metrics behind it".

---

## 8.9 — The session report as a PDF

**Goal.** The leader keeps writing their report the way they always have, and
the system keeps it beside the session.

**Why a step of its own.** This is the first file the system stores, and how
files work is decided once for every later module (D24; Finance receipts, Q7,
will use the same thing).

**Do.**

1. **Storage.** An S3-compatible bucket — Cloudflare R2 or Backblaze B2 (both
   cheap for a few hundred PDFs a year, and the code does not care which).
   Private. Add `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_BUCKET`,
   `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY` to `env.ts` (optional; uploads
   are refused with a clear message when unset) and `.env.example`, and a
   section to `docs/deployment.md` on creating the bucket and its CORS rule.
   Behind a `FileStorage` interface in `apps/api/src/core/files/`, with an
   in-memory one for tests, the way SMS has its providers.
2. **One `files` table** in core, for every module:
   `id, module_key, entity_type, entity_id, key, original_name, content_type,
   bytes, uploaded_by_id, uploaded_at, deleted_at`. Keys look like
   `outreach/sessions/<session-id>/<uuid>.pdf`.
3. **The browser uploads straight to storage.**
   `POST /v1/outreach/sessions/:id/report/upload` (`outreach.reports.upload`)
   returns a **presigned POST** that itself refuses anything but
   `application/pdf` and anything over 10 MB. The browser uploads, then calls
   `POST /v1/outreach/sessions/:id/report { key, name }`, and the API checks
   the object is there, is a PDF and is under the limit, then records the
   row. A 10 MB file never passes through the API. (The presign route lives
   with the session rather than as a general `/v1/files/presign`: which
   permission covers an upload is the owning module's to say.)
4. **Reading** is `GET /v1/outreach/sessions/:id/report`, which checks
   `outreach.reports.read` and answers with a signed link valid for five
   minutes.
5. One report per session; uploading again keeps the old one as a previous
   version (`deleted_at` set, object kept).
6. A nightly job reports and removes storage objects older than a day with no
   row (an upload abandoned half-way), and reports rows with no object.
7. Metrics `storage.bytes` and `storage.files`.
8. **Say plainly what erasure cannot do.** Add a row to
   `docs/data-inventory.md`: session reports may contain names and places, live
   in object storage, and `person:erase` cannot reach inside a PDF. Add a step
   to `docs/runbooks/erasure-request.md` telling the operator to check the
   reports of the months the person was reached, by hand.

**Check.** A 12 MB file is refused before it uploads; a `.docx` is refused;
the signed link stops working after five minutes; someone without
`outreach.reports.read` gets 403 for the link; the orphan job lists what it
removed. (The first two are the bucket's to refuse: check them against a real
bucket before launch, and in tests check the policy the presign produces.)

**Commit.** "Keep files in object storage, once, for every module"; "Attach the
Saturday report to its session".

---

## 8.10 — Prove it

**What you get for free:** the generated permission matrix and the
impersonation sweep cover every new route (see 7.15).

**Do**, in `apps/api/test/outreach.e2e-spec.ts` and `e2e/outreach.spec.ts`:

1. **Member and leader.** A member records people and follow-ups, and cannot
   make a partner group, plan a session, mark training, upload a report or
   send the department's messages. The Outreach leader can, with no role.
2. **Viewer.** A viewer can open every page and every write answers 403.
3. **No duplicate people.** Fifty records with overlapping phone numbers and
   names produce exactly the number of distinct people the test expects, and
   every reach points at one of them.
4. **The wall around People.** An Outreach member cannot open a person
   Outreach never reached, nor anything under `/v1/membership`.
5. **Journey (Playwright).** Plan a Saturday with two teams; at phone width,
   record four people; match one against a person already known; follow one
   up twice; mark the training; see the dashboard's numbers change.

**Check.** All three test commands pass; remove each guard once and watch its
test fail.

**Commit.** "Prove Outreach's permissions and its person matching".

---

## 8.11 — Phase check

- [ ] Outreach can be turned on in Admin → Portals for its department, and its two roles and its leaders' list work.
- [ ] The team is the Outreach department; nobody is typed twice.
- [ ] A Saturday can be planned, teams sent to areas, and numbers recorded.
- [ ] A person is recorded in four fields, on a phone, in under a minute.
- [ ] A person already known is matched, not duplicated.
- [ ] One timeline shows the doorstep, the calls, the visits and the first Sunday — in both portals.
- [ ] Follow-up can happen many times, in any order.
- [ ] Friday training is recorded, and the team reminded through the department's Messages.
- [ ] Every dashboard number opens the list behind it.
- [ ] The session PDF is attached, limited, private, and named in the data inventory and the erasure runbook.
- [ ] `appendix-database.md`, `what-works-now.md` and the metric list are updated.
- [ ] Someone other than the builder has walked it in a browser, at phone width.

# Phase 8 — The Outreach & Evangelism portal

> **In one sentence:** the evangelism team stops keeping names and phone
> numbers in a notebook and on someone's phone, and instead records them in
> four fields on a phone — into the church's one list of people — then follows
> each person up until they come to church.

**Status:** not started. **Comes after:** Phase 7 (the Friday reminders are
sent through Communications). **Comes before:** Phase 9, which uses the
person timeline this phase builds.

---

## Before you start

**1. What must already be true.**

- Phase 7 is done: templates, audiences and sending work.
- Step 8.1 needs four answers from the Outreach leader. You can build 8.2–8.4
  while you wait.

**2. Read these first** (about 30 minutes):

| Read | Why |
| --- | --- |
| `00-decisions.md`, D23 | One person record, and one timeline every portal writes to. The most important idea in this phase. |
| `00-decisions.md`, D22 | Why Outreach may text its team but not, by default, the people it reached. |
| `00-decisions.md`, D24 | How files are stored. Step 8.9 is the first file upload in the system. |
| `docs/modules/outreach-brief.md` | What the Outreach department told us it does. |
| `docs/adding-a-module.md` | The recipe for a new portal. |
| `apps/api/src/modules/membership/people/people.service.ts` | How people are searched and created today. Outreach reuses it rather than keeping its own list. |

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
   who is in it        a session               name, phone,            calls, visits,
   partner groups      teams sent to areas     location, who           invitations,
   of two or three     counts per team         reached them —          "came to church"
                       a PDF report after      nothing else required
                                   Friday training
                                   ───────────────
                                   topic, trainer, venue, who came
```

…and one dashboard over all of it.

**The rule that shapes the tables (D23):** a person reached on a Saturday
becomes a row in the church's **existing** `people` table — the same list the
registration form and the Membership portal use — not an "outreach contact".
The owner: *"The person then becomes part of the central church People
system, so if they later attend church, register for something, or become a
member, the church doesn't create another duplicate record."*

## Words used in this phase

| Word | Meaning |
| --- | --- |
| **Team member** | Someone in the Outreach department. Always a person already in the church's People list. |
| **Partner group** | Two or three team members who usually go out together. |
| **Session** | One Saturday's outreach. |
| **Session team** | A group sent to one area on that Saturday. Its people may differ from the standing group — partners get swapped on the day. |
| **Reached** | A person the team spoke to, recorded against a session and team. |
| **Interaction** | One thing that happened with a person — evangelised, called, visited, invited, came to church — from any portal. Together they make the person's **timeline**. |
| **Follow-up** | Calls, visits and invitations after someone was reached. Any number of each, in any order. |

## The steps at a glance

| Step | What | You are done when |
| --- | --- | --- |
| 8.1 | The brief | The Outreach leader's answers are in `outreach-brief.md`. |
| 8.2 | The module and permissions | Outreach appears in Admin → Portals with three roles. |
| 8.3 | The tables, and the shared timeline | The migration runs; the timeline cannot be deleted from. |
| 8.4 | The team | A member is added by searching the People list — never typed. |
| 8.5 | Saturday, and the people reached | A person is recorded in four fields on a phone, and a known person is matched, not duplicated. |
| 8.6 | Follow-up and the timeline | Calls, visits and "came to church" show on one timeline, in both portals. |
| 8.7 | Friday training | Attendance is marked, and the team reminded through Communications. |
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
   People list already? (If not, they are added through Membership's "Add a
   person" — Outreach never creates a staff record.)
2. Do partner groups hold for a season, or change every Saturday? (The tables
   allow both; the answer decides what the Saturday screen shows first.)
3. Which areas do they go to, by name? (These become suggestions, not a fixed
   list: a new estate must never need a developer.)
4. Which dashboard numbers do they report upward, and to whom? Those must be
   exact, not roughly right.

Write the answers, with the date, in place of each *TBC*.

**Check.** `grep -n TBC docs/modules/outreach-brief.md` finds nothing in
sections 1–3.

**Commit.** "Write down how Outreach actually works on a Saturday".

---

## 8.2 — The module, its permissions and its roles

**Goal.** An `outreach` module, with roles matching how the department is run:
a leader, the people who go out, and someone who may only look.

**Do.**

1. Create `packages/shared/src/modules/outreach.ts` (copy the shape of
   `finance.ts`):

   ```ts
   // sketch — complete it, keeping these keys exactly
   export const outreachModule = defineModule({
     key: 'outreach',
     name: 'Outreach',
     description: 'Evangelism: the team, the Saturdays, the people reached and the follow-up.',
     kind: 'department',
     home: '/outreach',
     permissions: {
       'outreach.dashboard.read':   { kind: 'read',  label: 'See the Outreach dashboard' },
       'outreach.team.read':        { kind: 'read',  label: 'See who is in Outreach' },
       'outreach.team.manage':      { kind: 'write', label: 'Add people to Outreach and make partner groups' },
       'outreach.sessions.read':    { kind: 'read',  label: 'See the Saturday sessions' },
       'outreach.sessions.manage':  { kind: 'write', label: 'Plan a Saturday and record what happened' },
       'outreach.reached.read':     { kind: 'read',  label: 'See the people reached' },
       'outreach.reached.record':   { kind: 'write', label: 'Record someone reached, and follow them up' },
       'outreach.training.read':    { kind: 'read',  label: 'See the Friday training' },
       'outreach.training.manage':  { kind: 'write', label: 'Plan training and mark who came' },
       'outreach.reports.read':     { kind: 'read',  label: 'See and download session reports' },
       'outreach.reports.upload':   { kind: 'write', label: 'Attach a session report' },
       'outreach.comms.send':       { kind: 'write', label: 'Send Outreach messages to its own audiences' },
       'outreach.comms.send_adhoc': { kind: 'write', label: 'Send Outreach words no template covers',
                                      hint: 'Off by default. An administrator grants it deliberately.' },
     },
     systemRoles: [
       { key: 'outreach.leader', name: 'Outreach leader',
         description: 'Runs the department: the team, the Saturdays, the training, the messages.',
         permissions: [/* everything except outreach.comms.send_adhoc */] },
       { key: 'outreach.member', name: 'Outreach member',
         description: 'Goes out on Saturdays and records who was reached.',
         permissions: ['outreach.dashboard.read', 'outreach.team.read', 'outreach.sessions.read',
                       'outreach.reached.read', 'outreach.reached.record', 'outreach.training.read'] },
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
       { label: 'Messages',  href: '/outreach/messages', icon: 'messages',     permission: 'outreach.comms.send' },
     ],
   });
   ```

2. Add `sessions` and `training` to the `NavIcon` type
   (`packages/shared/src/rbac/define.ts`) and draw them in
   `apps/portal/src/components/shell/NavIcon.tsx` (a map pin on a route; a
   board with a person).
3. Add `outreachModule` to `CHURCH_MODULES` in
   `packages/shared/src/modules/index.ts`. Because its key ends in
   `.comms.send`, `outreach.comms.send` joins `SEND_PERMISSIONS` (7.2) on its
   own.
4. **What Outreach needs from Membership.** A role holds permissions from one
   module only, so an Outreach leader who needs to search people also needs a
   Membership role. Add a Membership system role for it, in
   `packages/shared/src/modules/membership.ts`:

   | Role | Permissions | Given to |
   | --- | --- | --- |
   | `membership.outreach_access` — "People, for Outreach" | `membership.people.read` | every Outreach member and leader |
   | (existing roles) `membership.people.read_sensitive` via a second role, `membership.outreach_contact` — "Phone numbers, for Outreach" | `membership.people.read`, `membership.people.read_sensitive` | **the leader only** |

   Prayer requests stay hidden from the member role: they are behind
   `read_sensitive`, and the person page Outreach shows is the same gated
   shape the Membership portal serves. **Never** copy people's data into
   Outreach tables to avoid this; a copy is how a church ends up with the same
   family three times.

**Check.** `npm test` passes. In the browser, **Admin → Portals** offers
Outreach; turning it on shows its three roles in **Admin → Roles**, and
Membership now lists the two new roles.

**Commit.** "Describe the Outreach module"; "Let Outreach search the church's
people, and let its leader see their numbers".

---

## 8.3 — The tables, and the shared timeline

**Goal.** Outreach's own tables, plus one timeline table every portal writes
to. No `church_id` anywhere (D27).

**Do.**

1. Add to `apps/api/prisma/schema.prisma`. References to people and users are
   ordinary relations with foreign keys — write the `@relation` lines.

   ```prisma
   // sketch

   /// Who is in Outreach. A person from the church's People list, never a new record.
   model OutreachMember {
     id        String    @id @default(uuid(7)) @db.Uuid
     personId  String    @unique @map("person_id") @db.Uuid
     /// Their standing in the department, in the department's words.
     role      String    @default("EVANGELIST") @db.VarChar(20)
     isActive  Boolean   @default(true) @map("is_active")
     joinedOn  DateTime  @default(now()) @map("joined_on") @db.Date
     leftOn    DateTime? @map("left_on") @db.Date
     addedById String    @map("added_by_id") @db.Uuid

     @@map("outreach_members")
   }

   /// A standing partnership: two or three people who usually go out together.
   model OutreachGroup {
     id       String  @id @default(uuid(7)) @db.Uuid
     name     String  @unique @db.VarChar(60)
     isActive Boolean @default(true) @map("is_active")
     members  OutreachGroupMember[]

     @@map("outreach_groups")
   }

   model OutreachGroupMember {
     groupId  String @map("group_id") @db.Uuid
     personId String @map("person_id") @db.Uuid

     @@id([groupId, personId])
     @@map("outreach_group_members")
   }

   /// One Saturday.
   model OutreachSession {
     id          String        @id @default(uuid(7)) @db.Uuid
     heldOn      DateTime      @map("held_on") @db.Date
     title       String        @default("") @db.VarChar(80)
     status      SessionStatus @default(PLANNED)   // PLANNED | COMPLETED | CANCELLED
     notes       String        @default("") @db.VarChar(2000)
     createdById String        @map("created_by_id") @db.Uuid
     createdAt   DateTime      @default(now()) @map("created_at") @db.Timestamptz(6)
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
     needsFollowUp Boolean  @default(true) @map("needs_follow_up")
     note          String   @default("") @db.VarChar(1000)
     recordedById  String   @map("recorded_by_id") @db.Uuid
     createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

     @@index([reachedOn(sort: Desc)])
     @@index([needsFollowUp])
     @@map("outreach_reached")
   }

   /// A Friday training.
   model OutreachTraining {
     id          String   @id @default(uuid(7)) @db.Uuid
     topic       String   @db.VarChar(120)
     trainer     String   @default("") @db.VarChar(80)
     heldAt      DateTime @map("held_at") @db.Timestamptz(6)
     venue       String   @default("") @db.VarChar(80)
     notes       String   @default("") @db.VarChar(2000)
     createdById String   @map("created_by_id") @db.Uuid
     attendance  OutreachTrainingAttendance[]

     @@index([heldAt(sort: Desc)])
     @@map("outreach_trainings")
   }

   model OutreachTrainingAttendance {
     trainingId String         @map("training_id") @db.Uuid
     personId   String         @map("person_id") @db.Uuid
     mark       AttendanceMark                   // ATTENDED | MISSED — the enum the foundation class uses
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
     // REGISTERED | CLASS_SESSION | APPLIED | CONFIRMED | MESSAGE_SENT | NOTE
     at        DateTime        @db.Timestamptz(6)
     /// Which portal recorded it, for the timeline's small labels.
     moduleKey String          @map("module_key") @db.VarChar(30)
     /// The staff member, or null when the system recorded it.
     byId      String?         @map("by_id") @db.Uuid
     /// One line in plain words: "Evangelised by Peter and John, Sombetini".
     summary   String          @db.VarChar(200)
     /// Whatever the recording portal wants back later: session id, message id.
     meta      Json            @default("{}")
     createdAt DateTime        @default(now()) @map("created_at") @db.Timestamptz(6)

     @@index([personId, at(sort: Desc)])
     @@index([kind, at(sort: Desc)])
     @@map("person_interactions")
   }
   ```

   And on `people`: `source String @default("FORM") @db.VarChar(10)` — one of
   `FORM`, `OFFICE`, `OUTREACH` — so the dashboard can say how many people
   came from evangelism. Backfill: `OFFICE` where `registration_id is null`,
   else `FORM`.

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
   ```

   Then `npx prisma migrate dev`.

4. **Write the timeline from what already happens.** In the same commit,
   make the existing Membership code add an interaction when it already
   records an event: a registration submitted (`REGISTERED`), a class session
   ticked (`CLASS_SESSION`), an application entered (`APPLIED`), a member
   confirmed (`CONFIRMED`). Use one helper,
   `apps/api/src/modules/membership/timeline.ts`, `recordInteraction(tx,
   {...})`, called inside the same `db.tx()` as the change it describes.

5. Add the new tables to `docs/plan/appendix-database.md`.

**Check.** `npx prisma migrate dev` runs; `npm run test:e2e -w @irca/api` is
green; as the app role, `delete from person_interactions` is refused; after
submitting a registration in the form, the person has a `REGISTERED` row.

**Commit.** "Tables for Outreach"; "One timeline per person, written by every
portal".

---

## 8.4 — The team

**Goal.** Adding someone to Outreach is searching the People list and pressing
a button — never typing a name twice.

**Do.**

1. API, in `apps/api/src/modules/outreach/team.controller.ts`:
   `GET /v1/outreach/team`, `POST /v1/outreach/team { personId, role }`,
   `PATCH /v1/outreach/team/:id` (role, or leave with `isActive: false` and
   `leftOn`). Anyone qualifies, whatever their stage — the owner: *"regardless
   of their current membership/visitor status"*.
2. **The search is Membership's**, reached with `membership.people.read`
   (8.2). The portal's "Add to team" drawer calls
   `GET /v1/membership/people?search=…`. If the person isn't there at all, the
   drawer offers Membership's own "Add a person" form, with a note saying that
   is what is happening.
3. Partner groups: `POST /v1/outreach/groups { name, personIds }` (two or three
   people), rename, deactivate. A group that has ever gone out is never
   deleted, because sessions point at it.
4. Leaving the team keeps the row (`isActive = false`), so last year's
   Saturdays still say who was there.

**Check.** An e2e test (`apps/api/test/outreach.e2e-spec.ts`): adding the same
person twice is refused with `ALREADY_EXISTS`; someone who left still appears
on their old sessions; a member without `outreach.team.manage` gets 403.

**Commit.** "Pick the Outreach team from the church's own people"; "Partner
groups that hold for a season".

---

## 8.5 — Saturday, and the people reached

**Goal.** The Saturday screens work on a phone, standing up, and record a
person in **four fields**: name, phone, location, who reached them.

**Do.**

1. **Plan the session** (the leader, before the day): date and title, then a
   team per area — pick a standing group or put people together for the day,
   and type the area, with suggestions from areas already used.
2. **Record who was reached** (any member, during the day or after):
   `POST /v1/outreach/reached` with `{ sessionId?, teamId?, fullName, dial,
   phone, area, reachedByIds, lang?, needsFollowUp? }`. Only the first four
   ideas are required. In one `db.tx()`:
   - find the person (next point) or create one in `people` with
     `source = 'OUTREACH'`, `stage = 'VISITOR'`, `lang` as ticked (default the
     church's default language);
   - add an `outreach_reached` row joining them to the session and team;
   - add a `person_interactions` row, kind `EVANGELISED`, summary like
     *"Evangelised by Peter and John, Sombetini"*;
   - `audit.recordIn(tx, …)` and `usage.inc('outreach.reached')`.
3. **Match, don't duplicate.** Before creating anyone, look for a person with
   the same phone (normalised with `libphonenumber-js`, comparing `dial +
   phone`), or — only when no phone was given — a close name (Postgres
   `similarity()`, as the finance item suggestions already use). Return the
   match to the recorder instead of saving: *"Neema Mollel, reached 3 Aug in
   Kaloleni. Same person?"* Choosing **Same person** saves a second interaction
   on her; **Someone else** saves a new person. This must be in the first
   version — it is the whole reason the People list is shared.
4. **Consent (D22).** The record form carries one tick box, ticked by default
   only after the evangelist has asked: *"May the church send them messages?"*
   Unticked sets `sms_opt_out` on the new person.
5. **Filled in later.** Everything is editable afterwards: the team often
   records *"after the team returns, when they meet and discuss the people
   they reached"*. The Reached list marks records that are still thin (no
   phone, no area), so the team can see what is worth finishing.
6. **The counts.** A team's number reached is the rows recorded for it,
   counted — plus `spokenToOnly`, a number the team may type for people spoken
   to without taking details, shown separately as "spoken to, no details".
   Saturdays genuinely produce both.

**Check.**

- e2e: recording with only the four fields works; recording the same phone
  number twice returns the match, and accepting it leaves one person with two
  interactions; a viewer gets 403 on every write.
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

1. **The Follow-up page:** people with `needs_follow_up`, oldest first, each
   with the last thing that happened and a call button (a `tel:` link; the
   number is shown only to those with `membership.people.read_sensitive`).
2. **Recording a follow-up** adds one `person_interactions` row — `CALL`,
   `VISIT` or `INVITED` — with a note, and optionally clears
   `needs_follow_up`. **As many as it takes, in any order** — the owner:
   *"every interaction is recorded separately, so someone can be contacted or
   visited multiple times."* It is not a pipeline.
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

   `GET /v1/membership/people/:id/timeline` serves it, behind
   `membership.people.read`.
5. **Stage and timeline must agree.** `people.stage` is a one-word summary of
   the timeline, never a separate truth. Attending does not change a stage;
   Membership's own actions (saved, class, confirmed) still do, and now also
   write their interaction (8.3, point 4).

**Check.** e2e: three calls and two visits on one person all appear, in order,
with who did each; a Membership user sees Outreach's interactions on the
person page, and an Outreach leader sees Membership's.

**Commit.** "Follow someone up as many times as it takes"; "One timeline, from
the doorstep to membership".

---

## 8.7 — Friday training

**Goal.** The weekly training, who came, and a reminder that goes out without
the leader asking anyone.

**Do.**

1. Training pages: topic, trainer, date and time, venue; then mark each team
   member present or absent with the same marking control the foundation class
   register uses (`apps/portal/src/app/(app)/membership/discipleship/`), so
   nobody learns it twice.
2. Each mark also writes a `TRAINING` interaction on that member's timeline.
3. **The reminder uses Phase 7 — nothing about sending is built here.**
   - Register an audience provider `outreach.team` (7.5): active team members.
     It is granted to Outreach automatically.
   - Register `outreach.reached` too: people reached who have not opted out.
     It is **not** granted automatically (D22).
   - The leader drafts a template `outreach.training.reminder`, in each
     language, and Communications approves it.
   - **Remind the team** on the training page opens the Phase 7 composer with
     the audience and template already chosen. Or the leader sets up a beat in
     Messages → Recurring (Thursdays at 18:00, two variants).
4. **History:** each member's attendance over the last twelve trainings, so
   the leader can see who has stopped coming.

**Check.** e2e: create a training, mark nine present and one absent; **Remind
the team** queues nine messages, each in the member's own language; a member
who is not the leader's sender cannot send it (403).

**Commit.** "Friday training and who came"; "Remind the team through
Communications".

---

## 8.8 — The dashboard

**Goal.** The numbers the leader reports upward, on one screen, for a week, a
month or a year.

**Do.** One page (`/outreach`), one API call
(`GET /v1/outreach/dashboard?from=&to=`), computed in SQL:

| Figure | How it is counted |
| --- | --- |
| People reached | `outreach_reached` rows in the period; "spoken to, no details" shown separately |
| Awaiting follow-up | people with `needs_follow_up` |
| Follow-ups done | `CALL`, `VISIT` and `INVITED` interactions in the period |
| People visited | distinct people with a `VISIT` in the period |
| First-time attenders from Outreach | people with an `EVANGELISED` and a later **first** `ATTENDED_SERVICE` in the period |
| Sessions held | sessions `COMPLETED` in the period |
| Areas covered | distinct areas on the period's teams |
| Team participation | distinct members on a team, and each member's count |
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
   Private. Add `STORAGE_ENDPOINT`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY`,
   `STORAGE_SECRET_KEY` to `env.ts` (optional; uploads are refused with a clear
   message when unset) and `.env.example`, and a section to
   `docs/deployment.md` on creating the bucket.
2. **One `files` table** in core, for every module:
   `id, module_key, entity_type, entity_id, key, original_name, content_type,
   bytes, uploaded_by_id, uploaded_at, deleted_at`. Keys look like
   `outreach/sessions/<session-id>/<uuid>.pdf`.
3. **The browser uploads straight to storage.** `POST /v1/files/presign` (the
   API checks `outreach.reports.upload` for that session) returns a
   **presigned POST** that itself refuses anything but `application/pdf` and
   anything over 10 MB. The browser uploads, then calls
   `POST /v1/outreach/sessions/:id/report { key }`, and the API records the row.
   A 10 MB file never passes through the API.
4. **Reading** is `GET /v1/outreach/sessions/:id/report`, which checks
   `outreach.reports.read` and answers with a signed link valid for five
   minutes.
5. One report per session; uploading again keeps the old one as a previous
   version (`deleted_at` set, object kept).
6. A nightly job reports and removes storage objects with no row (an upload
   abandoned half-way), and reports rows with no object.
7. Metrics `storage.bytes` and `storage.files`.
8. **Say plainly what erasure cannot do.** Add a row to
   `docs/data-inventory.md`: session reports may contain names and places, live
   in object storage, and `person:erase` cannot reach inside a PDF. Add a step
   to `docs/runbooks/erasure-request.md` telling the operator to check the
   reports of the months the person was reached, by hand.

**Check.** A 12 MB file is refused before it uploads; a `.docx` is refused;
the signed link stops working after five minutes; someone without
`outreach.reports.read` gets 403 for the link; the orphan job lists what it
removed.

**Commit.** "Keep files in object storage, once, for every module"; "Attach the
Saturday report to its session".

---

## 8.10 — Prove it

**What you get for free:** the generated permission matrix and the
impersonation sweep cover every new route (see 7.12).

**Do**, in `apps/api/test/outreach.e2e-spec.ts` and `e2e/outreach.spec.ts`:

1. **Member and leader.** A member records people and follow-ups, and cannot
   add team members, plan a session, mark training, send a message, or see
   phone numbers.
2. **Viewer.** A viewer can open every page and every write answers 403.
3. **No duplicate people.** Fifty records with overlapping phone numbers and
   names produce exactly the number of distinct people the test expects, and
   every reach points at one of them.
4. **Journey (Playwright).** Plan a Saturday with two teams; at phone width,
   record four people; match one against a person already known; follow one
   up twice; mark the training; see the dashboard's numbers change.

**Check.** All three test commands pass; remove each guard once and watch its
test fail.

**Commit.** "Prove Outreach's permissions and its person matching".

---

## 8.11 — Phase check

- [ ] Outreach can be turned on in Admin → Portals, and its three roles work.
- [ ] Team members come from the church's People list; nobody is typed twice.
- [ ] A Saturday can be planned, teams sent to areas, and numbers recorded.
- [ ] A person is recorded in four fields, on a phone, in under a minute.
- [ ] A person already known is matched, not duplicated.
- [ ] One timeline shows the doorstep, the calls, the visits and the first Sunday — in both portals.
- [ ] Follow-up can happen many times, in any order.
- [ ] Friday training is recorded, and the team reminded through Communications.
- [ ] Every dashboard number opens the list behind it.
- [ ] The session PDF is attached, limited, private, and named in the data inventory and the erasure runbook.
- [ ] `appendix-database.md`, `what-works-now.md` and the metric list are updated.
- [ ] Someone other than the builder has walked it in a browser, at phone width.

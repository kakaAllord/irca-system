# Phase 8 — The Outreach & Evangelism portal

**Goal of the phase.** Replace the notebook and the list of phone numbers on
somebody's phone with something *easier than the notebook* — not with
paperwork.

The owner's principle, in their own words (22 Sept 2026):

> Capture minimally during the work, enrich the record later. The system
> should replace their notebook/phone-number process with something easier,
> not turn Saturday evangelism into paperwork.

Everything in this phase is measured against that sentence. If a screen makes
a Saturday afternoon slower, it is wrong, however complete its data.

Phase 7 (Communications) comes first: the Friday-training reminders are sent
through it.

---

## 8.0 — The shape of it

Five things, in the order the department lives them:

```
   Team            →   Saturday            →   People reached      →   Follow-up
   ────                ────────                ──────────────          ─────────
   who is in it        a session               name, phone,            call, visit,
   partner groups      teams sent out          location — and          invited, came
   who partners        an area each            nothing else            to church
   with whom           numbers reached         required
                       a PDF report later

                                   Friday training
                                   ───────────────
                                   topic, trainer, venue, who came
```

And one dashboard over all of it.

**The one rule that shapes the schema:** a person reached on a Saturday is a
row in the church's **existing** `people` table, not an outreach-only
contact. The owner was explicit: *"The person then becomes part of the central
church People system, so if they later attend church, register for something,
or become a member, the church doesn't create another duplicate record."*
See D23.

---

## 8.1 — The brief

**Goal.** The department's own words, before any code.

**Do.** `docs/modules/outreach-brief.md` is written from the owner's notes of
22 September. Take it to the Outreach leader and settle:

1. How many are in the team, and are they all in the church's People list
   already? (If not, Membership's "add a person by hand" is how they get
   there — Outreach never creates a staff record.)
2. Do partner groups change every Saturday, or hold for a season? (The schema
   supports both; the UI should default to whichever they actually do.)
3. What are the areas they go to, by name? (These become suggestions, not a
   fixed list — a new estate must not need a developer.)
4. Which of the dashboard numbers do they report upward, and to whom? Those
   are the ones that must be right to the person, not approximately right.

**Check.** The brief's first four sections have no "TBC".

**Commit.** "Write down how Outreach actually works on a Saturday".

---

## 8.2 — The module, its permissions and its roles

**Goal.** `outreach` exists, with roles that match how the department is
actually run: a leader, the people who go out, and someone who may only look.

**Do.** `packages/shared/src/modules/outreach.ts`:

```ts
// sketch
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
    'outreach.comms.send':       { kind: 'write', label: 'Send Outreach messages to its own audiences' },
    'outreach.comms.send_adhoc': { kind: 'write', label: 'Send Outreach words no template covers',
                                   hint: 'Off by default. An administrator grants it deliberately.' },
  },
  systemRoles: [
    { key: 'outreach.leader', name: 'Outreach leader',
      description: 'Runs the department: the team, the Saturdays, the training, the messages.',
      permissions: [/* everything except send_adhoc */] },
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

Add `sessions` and `training` to the `NavIcon` union and draw them (a map pin
with a route; a board with a person). Register in `CHURCH_MODULES`.

**The cross-module reads Outreach needs**, granted to its roles as ordinary
permissions from the other module (never a copy of the data):

| What for | Permission held by the Outreach role |
| --- | --- |
| Choose team members from the church's People list | `membership.people.read` |
| See a person's timeline and church attendance | `membership.people.read` |
| Phone numbers, to call and to message | `membership.people.read_sensitive` — **leader only** |

Prayer requests stay invisible: they are behind
`membership.people.read_sensitive` too, and the person detail Outreach sees
is the same gated shape the Membership portal serves. An Outreach member who
needs a number for a follow-up call sees it; the viewer role does not.

**Check.** `npm test`; the Portals page offers Outreach; the role editor shows
the three roles with those permissions and marks the sensitive one.

**Commit.** "Describe the Outreach module".

---

## 8.3 — Tables

**Goal.** The schema, with the person record shared and everything else the
department's own.

**Do.**

```prisma
// sketch

/// Who is in Outreach. A person from the church's People list, never a new record.
model OutreachMember {
  id        String   @id @default(uuid(7)) @db.Uuid
  churchId  String   @map("church_id") @db.Uuid
  personId  String   @map("person_id") @db.Uuid
  /// Their standing in the department, in the department's words.
  role      String   @default("EVANGELIST") @db.VarChar(20)
  isActive  Boolean  @default(true) @map("is_active")
  joinedOn  DateTime @default(now()) @map("joined_on") @db.Date
  leftOn    DateTime? @map("left_on") @db.Date
  addedById String   @map("added_by_id") @db.Uuid

  @@unique([churchId, personId])
  @@map("outreach_members")
}

/// A standing partnership: two or three people who go out together.
model OutreachGroup {
  id       String  @id @default(uuid(7)) @db.Uuid
  churchId String  @map("church_id") @db.Uuid
  name     String  @db.VarChar(60)
  isActive Boolean @default(true) @map("is_active")

  members OutreachGroupMember[]

  @@unique([churchId, name])
  @@unique([churchId, id])
  @@map("outreach_groups")
}

model OutreachGroupMember {
  churchId String @map("church_id") @db.Uuid
  groupId  String @map("group_id") @db.Uuid
  personId String @map("person_id") @db.Uuid

  @@id([groupId, personId])
  @@map("outreach_group_members")
}

/// One Saturday.
model OutreachSession {
  id         String   @id @default(uuid(7)) @db.Uuid
  churchId   String   @map("church_id") @db.Uuid
  heldOn     DateTime @map("held_on") @db.Date
  title      String   @default("") @db.VarChar(80)
  status     SessionStatus @default(PLANNED)  // PLANNED | COMPLETED | CANCELLED
  notes      String   @default("") @db.VarChar(2000)
  createdById String  @map("created_by_id") @db.Uuid
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  teams OutreachSessionTeam[]

  @@index([churchId, heldOn(sort: Desc)])
  @@unique([churchId, id])
  @@map("outreach_sessions")
}

/// A team sent to an area on that Saturday. Its people may differ from the
/// standing group: partners get swapped on the day, and that is normal.
model OutreachSessionTeam {
  id            String  @id @default(uuid(7)) @db.Uuid
  churchId      String  @map("church_id") @db.Uuid
  sessionId     String  @map("session_id") @db.Uuid
  /// The standing group this started from, if any.
  groupId       String? @map("group_id") @db.Uuid
  area          String  @db.VarChar(80)
  reachedCount  Int     @default(0) @map("reached_count")
  followUpCount Int     @default(0) @map("follow_up_count")
  notes         String  @default("") @db.VarChar(1000)

  members OutreachSessionTeamMember[]

  @@unique([churchId, id])
  @@index([churchId, sessionId])
  @@map("outreach_session_teams")
}

model OutreachSessionTeamMember {
  churchId String @map("church_id") @db.Uuid
  teamId   String @map("team_id") @db.Uuid
  personId String @map("person_id") @db.Uuid

  @@id([teamId, personId])
  @@map("outreach_session_team_members")
}

/// The join between a Saturday and a person reached on it. The person's own
/// details live in `people`, like everyone else's.
model OutreachReached {
  id           String   @id @default(uuid(7)) @db.Uuid
  churchId     String   @map("church_id") @db.Uuid
  personId     String   @map("person_id") @db.Uuid
  sessionId    String?  @map("session_id") @db.Uuid
  teamId       String?  @map("team_id") @db.Uuid
  reachedOn    DateTime @map("reached_on") @db.Date
  area         String   @default("") @db.VarChar(80)
  needsFollowUp Boolean @default(true) @map("needs_follow_up")
  note         String   @default("") @db.VarChar(1000)
  recordedById String   @map("recorded_by_id") @db.Uuid
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  @@index([churchId, reachedOn(sort: Desc)])
  @@index([churchId, needsFollowUp])
  @@map("outreach_reached")
}

/// Friday.
model OutreachTraining {
  id        String   @id @default(uuid(7)) @db.Uuid
  churchId  String   @map("church_id") @db.Uuid
  topic     String   @db.VarChar(120)
  trainer   String   @default("") @db.VarChar(80)
  heldAt    DateTime @map("held_at") @db.Timestamptz(6)
  venue     String   @default("") @db.VarChar(80)
  notes     String   @default("") @db.VarChar(2000)
  createdById String @map("created_by_id") @db.Uuid

  attendance OutreachTrainingAttendance[]

  @@index([churchId, heldAt(sort: Desc)])
  @@unique([churchId, id])
  @@map("outreach_trainings")
}

model OutreachTrainingAttendance {
  churchId    String @map("church_id") @db.Uuid
  trainingId  String @map("training_id") @db.Uuid
  personId    String @map("person_id") @db.Uuid
  mark        AttendanceMark          // ATTENDED | MISSED — the existing enum
  markedById  String @map("marked_by_id") @db.Uuid
  markedAt    DateTime @default(now()) @map("marked_at") @db.Timestamptz(6)

  @@id([trainingId, personId])
  @@map("outreach_training_attendance")
}
```

And the **central timeline**, which belongs to Membership because every portal
writes to it (D23):

```prisma
/// Every contact with a person, from any portal, append-only. The coarse
/// journey stays on `people.stage`; this is what actually happened, in order.
model PersonInteraction {
  id        String   @id @default(uuid(7)) @db.Uuid
  churchId  String   @map("church_id") @db.Uuid
  personId  String   @map("person_id") @db.Uuid
  kind      InteractionKind
  // EVANGELISED | CALL | VISIT | INVITED | ATTENDED_SERVICE | TRAINING |
  // REGISTERED | CLASS_SESSION | APPLIED | CONFIRMED | MESSAGE_SENT | NOTE
  at        DateTime @db.Timestamptz(6)
  /// Which portal recorded it, for the timeline's little labels.
  moduleKey String   @map("module_key") @db.VarChar(30)
  /// The staff member, or null when the system recorded it.
  byId      String?  @map("by_id") @db.Uuid
  /// One line, in plain words: "Evangelised by Peter and John, Sombetini".
  summary   String   @db.VarChar(200)
  /// Whatever the recording portal wants back later: session id, message id.
  meta      Json     @default("{}")
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  @@index([churchId, personId, at(sort: Desc)])
  @@index([churchId, kind, at(sort: Desc)])
  @@map("person_interactions")
}
```

Plus, on `people`: `source varchar(20) not null default 'FORM'`
(`'FORM' | 'OFFICE' | 'OUTREACH'`) so the dashboard can say how many of this
year's people came from evangelism, and `lang` and `sms_opt_out` from Phase 7
step 7.3 if that migration has not already added them.

RLS, plane lists and `revoke delete` on `person_interactions` and
`outreach_reached` (a timeline that can be tidied up is not a timeline), as
`docs/adding-a-module.md` §2 sets out.

**Check.** `npx prisma migrate dev`; tenancy tests green; as `irca_app`,
`delete from person_interactions` is refused.

**Commit.** "Tables for Outreach"; "One timeline per person, written by every
portal".

---

## 8.4 — The team

**Goal.** Adding someone to Outreach is searching the church's People list and
pressing a button — never typing a name twice.

**Do.**

1. `GET /v1/outreach/team` and `POST /v1/outreach/team { personId, role }`.
   The search is the Membership people search, reached with
   `membership.people.read`, so the same person cannot exist twice. Any
   person qualifies, whatever their stage — the owner was explicit that the
   leader can add anyone *"regardless of their current membership/visitor
   status"*.
2. Someone not in the church's list at all is added there first, through
   Membership's own "add a person" drawer, opened from the Outreach page with
   a note saying that is what is happening. Outreach never writes a `people`
   row of its own except through 8.5, where a doorstep contact becomes one.
3. Partner groups: `POST /v1/outreach/groups { name, personIds }`, two or
   three people. Renaming and deactivating; never deleting a group that has
   been out, because sessions point at it.
4. Leaving: `isActive = false` with `leftOn`, so last year's Saturdays still
   say who was there.

**Check.** e2e: adding the same person twice is refused with
`ALREADY_EXISTS`; a person from another church is 404; a deactivated member
still appears on their old sessions.

**Commit.** "Pick the Outreach team from the church's own people"; "Partner
groups that hold for a season".

---

## 8.5 — Saturday, and the people reached

**Goal.** The Saturday screens are usable on a phone, standing up, and ask for
**four fields** to record a person.

**Do.**

1. **Plan the session** (leader, before the day): date, title, then a team per
   area — pick a standing group or assemble people for the day, and type the
   area (with suggestions from the areas already used).
2. **Record who was reached** (any member, during or after):
   `POST /v1/outreach/reached` with **name, phone, location, and who reached
   them** — everything else optional. Behind that one call:
   - a `people` row is created (`source = 'OUTREACH'`, `stage = VISITOR`,
     `lang` as ticked, default the church's), or an **existing** person is
     matched and reused;
   - an `outreach_reached` row joins them to the session and team;
   - a `person_interactions` row of kind `EVANGELISED` with a summary like
     *"Evangelised by Peter and John, Sombetini"*.
3. **Matching, not duplicating.** Before creating, the API looks for a person
   in the church with the same phone number (normalised), or a close name with
   no phone. A match is offered to the recorder — *"Neema Mollel, reached 3
   Aug in Kaloleni. Same person?"* — and taking it adds a second interaction
   instead of a second person. This is the whole reason the central People
   list exists; it must be in the first slice, not a later tidy-up.
4. **Completing later.** Everything is editable afterwards: the owner said the
   team often records *"after the team returns, when they meet and discuss the
   people they reached"*. A person recorded with a name and a number can gain
   an age group, a location and a note a week later without anything being
   re-entered. The list shows which records are still thin, so the team can
   see what is worth finishing.
5. **The counts.** A team's `reached_count` is the number of rows recorded
   for it, computed, not typed — except that a team may also record a bare
   number for people they spoke to without taking details
   (`reachedCount` may be raised above the rows, with the difference shown as
   "spoken to, no details"). Saturday evangelism genuinely produces both.

**Check.** e2e: recording with only the four fields works; the same phone
number recorded twice offers the match and creates one person with two
interactions; another church's session is 404; an impersonated leader gets
`IMPERSONATION_READ_ONLY`. On a phone-sized viewport, the record form is
reachable and submittable without scrolling past the fold more than once.

**Commit.** "Plan a Saturday and send teams to areas"; "Record someone
reached in four fields"; "Match a person we already know instead of making a
second one".

---

## 8.6 — Follow-up, and whether they came

**Goal.** The question Outreach actually cares about: *did the people we
reached ever come to church?*

**Do.**

1. The Follow-up page is the list of people with `needs_follow_up`, oldest
   first, with the last thing that happened to each and a phone button.
2. Recording a follow-up is one row in `person_interactions`
   (`CALL`, `VISIT`, `INVITED`) with a note, and optionally clearing
   `needs_follow_up`. **Multiple of each, in any order** — the owner was
   explicit that this is not a pipeline: *"every interaction is recorded
   separately, so someone can be contacted or visited multiple times."*
3. **Attendance** is the join to the rest of the church. `ATTENDED_SERVICE`
   interactions are written by whoever marks attendance (Membership, when that
   exists; by hand from this page until then), so the Outreach dashboard can
   count *first-time attenders who came from Outreach* — a person with an
   `EVANGELISED` interaction and a later `ATTENDED_SERVICE` one.
4. The person's timeline is one component, used by both portals, showing
   exactly the owner's example:

   ```
   Sept 5   Evangelised by Peter & John · Sombetini      Outreach
   Sept 7   Follow-up call — will come on Sunday          Outreach
   Sept 12  Home visit — met her husband                  Outreach
   Sept 19  Invited to church                             Outreach
   Sept 20  First attendance                              Membership
   Sept 27  Attended again                                Membership
   ```

   The stage on `people` moves with it where the journey is unambiguous
   (first `ATTENDED_SERVICE` does not change a stage; `CONFIRMED` does), and
   is otherwise left to Membership's own rules. A timeline that argues with
   the stage is a bug: the stage is a summary of the timeline, never a
   separate truth.

**Check.** e2e: three calls and two visits on one person all appear, in order,
with who did them; the dashboard's "came to church" count matches a hand count
on seeded data; a Membership user sees Outreach's interactions on the person
page and vice versa.

**Commit.** "Follow someone up as many times as it takes"; "One timeline,
from the doorstep to membership".

---

## 8.7 — Friday training

**Goal.** The weekly training, its attendance, and a reminder that goes out
without the leader asking anyone.

**Do.**

1. `outreach_trainings` and its attendance: topic, trainer, date and time,
   venue; mark the team present or absent, with the same marking UI as the
   foundation class so nobody learns it twice.
2. Attendance writes a `TRAINING` interaction too, so a member's own timeline
   shows their training history.
3. The reminder is a **Comms** template owned by Outreach
   (`outreach.training.reminder`), approved once, and either sent by the
   leader from the training page ("Remind the team") or set up as a beat in
   Comms → Recurring (Thursdays at 18:00, two variants). Nothing about
   sending is implemented here: this page calls Phase 7.
4. The history view: attendance per member over the last twelve sessions, so
   the leader can see who has stopped coming.

**Check.** e2e: creating a training, marking nine people, one absent; pressing
"Remind the team" queues nine messages through Comms in each member's
language; a member without the leader's send row cannot press it.

**Commit.** "Friday training and who came"; "Remind the team through
Communications".

---

## 8.8 — The dashboard

**Goal.** The numbers the leader reports upward, on one screen, for a week, a
month or a year.

**Do.** One page, one API call, the figures the owner listed:

| Figure | How it is counted |
| --- | --- |
| People reached | `outreach_reached` rows in the period, plus the "spoken to, no details" difference, shown separately |
| Awaiting follow-up | people with `needs_follow_up` |
| Follow-ups done | `CALL`/`VISIT`/`INVITED` interactions in the period |
| People visited | distinct people with a `VISIT` interaction |
| First-time attenders from Outreach | people with `EVANGELISED` and a later first `ATTENDED_SERVICE` |
| Sessions held | `outreach_sessions` with status `COMPLETED` |
| Areas covered | distinct `area` on the period's teams |
| Team participation | distinct members on a team, and each member's count |
| Training attendance | `ATTENDED` marks over sessions held |
| Trends | each of the above by week, on the same charts the dev console uses |

Plus the usage metrics, in the catalogue: `outreach.reached`,
`outreach.followups`, `outreach.visits`, `outreach.sessions`,
`outreach.training.attendance`, and the gauge
`outreach.followups.pending`.

**Check.** The dashboard's numbers match a hand count on the seed. Every
figure has a link to the list behind it — a number on a dashboard that cannot
be opened is a number nobody trusts.

**Commit.** "The Outreach dashboard, and the metrics behind it".

---

## 8.9 — The session report as a PDF

**Goal.** The leader keeps their existing report — written the way they have
always written it — and the system keeps it beside the session.

This is the **first file upload in the system**, so it is its own step and its
own decision (D24). Do not fold it into 8.5.

**Do.**

1. Object storage, S3-compatible (Cloudflare R2 or Backblaze B2 — cheapest
   for a few hundred PDFs a year, and both have an S3 API, so the code does
   not care which). One bucket for the platform, keys prefixed
   `<church-slug>/outreach/<session-id>/<uuid>.pdf`, private, read through a
   short-lived signed URL. Credentials in the host's environment, like Beem's.
2. A core `files` table — `church_id`, `module_key`, `entity_type`,
   `entity_id`, `key`, `original_name`, `content_type`, `bytes`,
   `uploaded_by_id`, `uploaded_at`, `deleted_at` — so the next module that
   needs an attachment (finance receipts, Q7) does not invent a second one.
3. Upload is direct from the browser to storage with a **presigned POST** the
   API issues, so a 4 MB PDF never travels through the API. The API then
   records the row when the browser reports the key back, and a nightly job
   removes storage objects with no row (an abandoned upload) and rows with no
   object (a lost one), reporting both.
4. Limits, refused by the presign itself, not by hope: `application/pdf`
   only, 10 MB, one report per session (a second replaces the first, with the
   first kept as a version).
5. `storage.bytes` and `storage.files` metrics per church — the dev console
   has been reserving `storage_bytes` since Phase 6 step 6.1.
6. `docs/data-inventory.md` gains a row: session reports may contain names and
   locations of people reached, they live in object storage, and
   `person:erase` cannot reach inside a PDF. The erasure runbook therefore
   tells the operator to check the session reports of the period by hand. Say
   this plainly rather than implying erasure is complete when it is not.

**Check.** Uploading a 12 MB file is refused before it uploads; a
non-PDF is refused; the signed URL expires; another church cannot fetch the
key even with the exact path; the orphan job reports what it cleaned.

**Commit.** "Keep files in object storage, once, for every module";
"Attach the Saturday report to its session".

---

## 8.10 — Prove it

**Do.** The four standard proofs (`docs/adding-a-module.md` §5) plus:

1. **The member/leader line.** A member records people and follow-ups; they
   cannot add or remove team members, plan a session, mark training, send a
   message, or see phone numbers if they lack
   `membership.people.read_sensitive`.
2. **The viewer line.** A viewer can open every page and change nothing; every
   write route answers 403 for them.
3. **No duplicate people.** A property-style test: 50 records with overlapping
   phone numbers and names produce exactly the number of distinct people the
   fixture says, and every reach is attached to one of them.
4. **Journey (Playwright).** Plan a Saturday with two teams; record four
   people from a phone-sized viewport; match one against an existing person;
   follow one up twice; mark the training; see the dashboard's numbers change.

**Commit.** "Prove Outreach's permissions, walls and person matching".

---

## 8.11 — Phase check

- [ ] Outreach can be turned on in Admin → Portals, and its three roles work.
- [ ] Team members come from the church's People list; nobody is typed twice.
- [ ] A Saturday can be planned, teams sent to areas, and numbers recorded.
- [ ] A person is recorded in four fields, on a phone, in under a minute.
- [ ] A person already known is matched, not duplicated.
- [ ] One timeline shows the doorstep, the calls, the visits and the first Sunday.
- [ ] Follow-up can happen many times, in any order.
- [ ] Friday training is recorded and the team reminded through Comms.
- [ ] The dashboard's every number opens the list behind it.
- [ ] The session PDF is attached, limited, private, and mentioned in the data inventory.
- [ ] `appendix-database.md`, `what-works-now.md` and step 6.1's metrics are updated.

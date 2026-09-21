# Phase 5 — Registration on the API, and the Membership portal

**Outcome.** The visitor registration form looks and behaves exactly as today,
but it no longer touches a database. Its server code calls the API with a
per-church key, and all the answers live in the one system database, next to
everything else. The live registrations are copied across with their tokens,
so links already sent by SMS keep working. The old unauthenticated `/admin`
pages are gone. In their place is the **Membership portal** from the design,
behind login and RBAC: Dashboard, Members, Applications, Discipleship and
Insights.

> **Two words, two meanings.** "*Membership*" in code (`ChurchMembership`)
> is a staff user's access to a church. The **Membership portal** is about
> *church members*: people who register, get saved, go through foundation
> class, get baptised and are confirmed. In code the pastoral records are
> `Person`, `MembershipApplication` and so on. Never call a `Person` a
> "member" in code. Use `Person.stage === 'CONFIRMED_MEMBER'`.

| Step | What |
| --- | --- |
| 5.1 | Move the registration flow into `packages/shared` |
| 5.2 | The Membership module manifest |
| 5.3 | Tables |
| 5.4 | API client keys for the registration app |
| 5.5 | The public registration API |
| 5.6 | The registration app talks to the API (behind a switch) |
| 5.7 | Copying the live registrations |
| 5.8 | People records |
| 5.9 | Members API |
| 5.10 | Applications API |
| 5.11 | Discipleship API |
| 5.12 | Dashboard and Insights API |
| 5.13 | Portal: Dashboard |
| 5.14 | Portal: Members and the person panel |
| 5.15 | Portal: Applications |
| 5.16 | Portal: Discipleship (board, list, class register) |
| 5.17 | Portal: Insights |
| 5.18 | Cutover runbook |
| 5.19 | Removing the old paths |
| 5.20 | Tests |
| 5.21 | Phase check |

**Blast radius (checked before writing this phase).** In `apps/registration`:
`src/lib/db.ts` (the pool), `src/lib/registration.ts` (all SQL),
`src/lib/actions.ts` (server actions: `startRegistration`, `changeLanguage`,
`switchLanguage`, `saveStep`, `submitRegistration`, `registerAnother`),
`src/app/api/draft/route.ts` (beacon autosave), `src/app/page.tsx`, and
`src/app/r/[token]/{page,[step]/page,done/page}.tsx` (all call `getByToken`).
Also `src/office/RegistrationsList.tsx` and `src/office/InsightsReport.tsx`,
the former `/admin` and `/admin/insights` pages. They were **taken off the web
on 21 Sept 2026** (commit `2290ffa`, "Take the office screens off the web"),
because they served prayer requests with no sign-in. They are kept unrouted as
the reference this phase ports from (see "Porting the office screens" below).
They read `listRegistrations` and `computeInsights`.
`src/lib/insights.ts`, `scripts/setup-db.mjs` and `scripts/apply-schema.mjs`,
`db/schema.sql`, `vercel.json` (its build runs `db:migrate`),
`.env.example`, `src/types/pg.d.ts`, and the `irca_token` cookie. `flow.ts`,
`validate.ts` and `dialCodes.ts` are pure: no I/O, only `libphonenumber-js`.
Components (`StepScreen`, `CountryPicker`, `DateWheel`, `LanguageSwitch`)
import from `flow`, `validate` and `dialCodes`, and call the server actions.
They do **not** change in this phase, apart from import paths.

**Porting the office screens.** `apps/registration/src/office/` holds the two
old office pages. Nothing in them is thrown away. Each piece has a home in
this phase:

| In `src/office/` | What it does | Goes to | Step |
| --- | --- | --- | --- |
| `RegistrationsList`: sort order | Unfinished registrations first, then newest updated | Members, **Incomplete** tab and the default sort of the Dashboard's *Incomplete registrations* card | 5.9, 5.13 |
| `RegistrationsList`: *Progress* `3 / 11` | Answered vs applicable steps, counted with `applicableSteps` + `isAnswered` (only the questions that person was shown) | The Members row flag "Incomplete · 3 of 11", and "Missing …" on the Dashboard | 5.9, 5.12 |
| `RegistrationsList`: *Where* | Ward (or the typed ward) in Arusha, otherwise region or country | Members **Lives in** column and filter | 5.9, 5.14 |
| `RegistrationsList`: *Link* `/r/{token}` | The person's own link to carry on | **Send their link** (*Copy link* / *Open WhatsApp*), now behind `membership.registrations.remind` | 5.9, 5.14 |
| `RegistrationsList`: "Nobody has registered yet." | Empty state | Members empty state | 5.14 |
| `InsightsReport`: Started / Completed / Unfinished tiles, with % | Headline completion | Insights, top tiles | 5.12, 5.17 |
| `InsightsReport`: *Question by question* (reached, answered, left blank, stopped here, with the funnel bar) | Where people drop off, counted only against the people shown each question | Insights, "Where people stop on the form" table, same columns and the same bar | 5.12, 5.17 |
| `InsightsReport`: *What people choose* cards | Option counts per question, % of those who answered | Insights, option cards | 5.12, 5.17 |
| `InsightsReport`: counts **beside** percentages, and its notes text | "At a couple of dozen visitors a percentage on its own lies" | A rule for every Membership number: never a bare percentage. Keep the two explanatory notes word for word | 5.13, 5.17 |

---

## 5.1 — Move the registration flow into `packages/shared`

**Goal:** the form, the API and the portal all use one copy of the questions,
their three languages, the branching and the validation.

**Do**

1. `git mv apps/registration/src/lib/flow.ts packages/shared/src/registration/flow.ts`,
   and likewise `validate.ts`, `dialCodes.ts` and `insights.ts` (it is pure
   too: it only imports `flow` and `validate` and a *type* from
   `registration.ts`). Move the `Registration` type it needs into
   `packages/shared/src/registration/types.ts`.
2. Move `libphonenumber-js` from `apps/registration/package.json` to
   `packages/shared/package.json`. Keep `scripts/gen-dial-codes.mjs` in the
   registration app, but make it write to the new path.
3. `packages/shared/src/registration/index.ts` re-exports all of it. Add
   `export * as registration from './registration'` to the shared index, or a
   subpath export `@irca/shared/registration` (preferred: add a second tsup
   entry and an `exports` entry, which keeps portal bundles small).
4. In `apps/registration`: replace imports of `@/lib/flow`, `@/lib/validate`,
   `@/lib/dialCodes` and `@/lib/insights` with `@irca/shared/registration`,
   and add `transpilePackages: ['@irca/shared']` to its `next.config.ts`.
   **Change nothing else.**
5. Move the comments with the code. The long "why" comments in `flow.ts` are
   the documentation of the flow, and `docs/plan/README.md` should point to the
   new path as "the single source of truth for the flow".

**Check:** `npm run build -w @irca/registration` passes. Walk the entire form
in a browser, in all three languages, including the membership branch and the
language change from the first question. It must behave exactly as before
(the app still uses its own database at this point).

**Commit:** "Share the registration flow so the API and portal use the same questions".

---

## 5.2 — The Membership module manifest

`packages/shared/src/modules/membership.ts`:

| Permission | Kind | Label |
| --- | --- | --- |
| `membership.dashboard.read` | read | See the membership dashboard |
| `membership.people.read` | read | See people's names, gender, age group, phone, where they live, how they heard, and their stage |
| `membership.people.read_sensitive` | read | See email, date of birth, faith and family answers, prayer requests, what they liked, and notes. *Hint:* "Prayer requests are private. Give this only to pastors and the office." |
| `membership.people.update` | write | Mark saved or baptised, move people between stages, and add people by hand |
| `membership.people.export` | read | Download people as CSV |
| `membership.notes.write` | write | Add notes and log visits and calls |
| `membership.registrations.remind` | write | See and send a person their registration link |
| `membership.applications.read` | read | See membership applications |
| `membership.applications.submit` | write | Enter a membership application for someone |
| `membership.applications.decide` | write | Approve, reject and confirm applications. *Hint:* "The pastors' decision." |
| `membership.discipleship.read` | read | See foundation classes and progress |
| `membership.discipleship.manage` | write | Run foundation classes: groups, sign-ups and attendance |
| `membership.insights.read` | read | See insights |

System roles (from the 17 Sept notes: approvals are made "by Pastor Ndelimbi
or Pastor Sarah alone", and Comms "should see names, gender and phone numbers"
only):

| Role | Permissions |
| --- | --- |
| **Pastor** (`membership.pastor`) | all of the above |
| **Office secretary** (`membership.secretary`) | all except `applications.decide` |
| **Follow-up team** (`membership.followup`) | dashboard, people.read, notes.write, registrations.remind, discipleship.read, discipleship.manage |
| **Membership viewer** (`membership.viewer`) | dashboard, people.read, applications.read, discipleship.read, insights.read |

Nav: Dashboard `/membership` (D), Members `/membership/people` (M),
Applications `/membership/applications` (A), Discipleship
`/membership/discipleship` (C), Insights `/membership/insights` (I). These
are the design's letters.

Add the module to `CHURCH_MODULES` **before** Finance, so it appears first in
the sidebar.

**Commit:** "Describe the Membership portal".

---

## 5.3 — Tables

All are tenant models: add each to `TENANT_MODELS` and to `TENANT_PLANE_MODELS` (02 step 2.4b), and give each the row-level security template from 02 step 2.4a in this migration. The exception is `ApiClient`, which is control plane with core-only RLS. References to users (`createdById`, `authorId` and so on) are plain uuid columns with no `@relation`, as 2.4b requires.

```prisma
/// The visitor's own answers, one row per registration. Same columns as the
/// original db/schema.sql (see its comments for why it is one wide table), plus
/// church_id and a uuid id. Column names are unchanged so the copy is 1:1.
model Registration {
  id             String    @id @default(uuid(7)) @db.Uuid
  churchId       String    @map("church_id") @db.Uuid
  /// The original bigserial id from the first database, kept for tracing.
  legacyId       BigInt?   @map("legacy_id")
  token          String    @unique @db.Char(32)
  lang           String    @default("en") @db.VarChar(2)
  status         String    @default("in_progress") @db.VarChar(20)   // in_progress | submitted
  currentStep    String?   @map("current_step")
  furthestStep   String?   @map("furthest_step")
  heard          String[]  @default([])
  heardOtherText String    @default("") @map("heard_other_text")
  friendName     String    @default("") @map("friend_name")
  fullname       String    @default("")
  // … every remaining column of db/schema.sql, same name, same default …
  wantMore       Boolean?  @map("want_more")
  prayer         String    @default("")
  comments       String    @default("")
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)
  submittedAt    DateTime? @map("submitted_at") @db.Timestamptz(6)

  person Person?

  @@index([churchId, status, updatedAt(sort: Desc)])
  @@map("registrations")
}

enum PersonStage {
  VISITOR
  NEW_CONVERT
  FOUNDATION_CLASS
  AWAITING_BAPTISM
  MEMBERSHIP_REVIEW
  CONFIRMED_MEMBER
}

/// Someone the church is caring for. Usually created with a registration; the
/// office can also add someone who never filled in the form.
model Person {
  id               String      @id @default(uuid(7)) @db.Uuid
  churchId         String      @map("church_id") @db.Uuid
  registrationId   String?     @unique @map("registration_id") @db.Uuid
  /// Copied from the registration on every save while linked (5.8); set by hand otherwise.
  fullName         String      @default("") @map("full_name") @db.VarChar(120)
  gender           String      @default("") @db.VarChar(20)
  ageGroup         String      @default("") @map("age_group") @db.VarChar(20)
  dial             String      @default("+255") @db.VarChar(6)
  phone            String      @default("") @db.VarChar(20)
  email            String      @default("") @db.VarChar(254)
  stage            PersonStage @default(VISITOR)
  /// Null = go by what they said on the form. true/false = the office has confirmed it.
  saved            Boolean?
  savedSetById     String?     @map("saved_set_by_id") @db.Uuid
  savedSetAt       DateTime?   @map("saved_set_at") @db.Timestamptz(6)
  baptised         Boolean?
  baptisedSetById  String?     @map("baptised_set_by_id") @db.Uuid
  baptisedSetAt    DateTime?   @map("baptised_set_at") @db.Timestamptz(6)
  memberNumber     Int?        @map("member_number")
  confirmedAt      DateTime?   @map("confirmed_at") @db.Timestamptz(6)
  createdById      String?     @map("created_by_id") @db.Uuid
  createdAt        DateTime    @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt        DateTime    @updatedAt @map("updated_at") @db.Timestamptz(6)

  registration Registration? @relation(fields: [registrationId], references: [id])

  @@unique([churchId, memberNumber])
  @@index([churchId, stage])
  @@map("people")
}

model PersonStageEvent {
  id        String       @id @default(uuid(7)) @db.Uuid
  churchId  String       @map("church_id") @db.Uuid
  personId  String       @map("person_id") @db.Uuid
  fromStage PersonStage? @map("from_stage")
  toStage   PersonStage  @map("to_stage")
  byId      String?      @map("by_id") @db.Uuid     // null when automatic
  note      String?      @db.VarChar(300)
  at        DateTime     @default(now()) @db.Timestamptz(6)
  @@index([churchId, personId, at])
  @@map("person_stage_events")
}

enum PersonNoteKind {
  NOTE
  VISIT
  CALL
}

model PersonNote {
  id        String         @id @default(uuid(7)) @db.Uuid
  churchId  String         @map("church_id") @db.Uuid
  personId  String         @map("person_id") @db.Uuid
  kind      PersonNoteKind @default(NOTE)
  body      String         @db.VarChar(2000)
  authorId  String         @map("author_id") @db.Uuid
  createdAt DateTime       @default(now()) @map("created_at") @db.Timestamptz(6)
  @@index([churchId, personId, createdAt(sort: Desc)])
  @@map("person_notes")
}

enum ApplicationStatus {
  UNDER_REVIEW
  APPROVED
  REJECTED
  CONFIRMED
  WITHDRAWN
}

model MembershipApplication {
  id            String            @id @default(uuid(7)) @db.Uuid
  churchId      String            @map("church_id") @db.Uuid
  personId      String            @map("person_id") @db.Uuid
  status        ApplicationStatus @default(UNDER_REVIEW)
  source        String            @db.VarChar(10)          // 'FORM' | 'OFFICE'
  submittedAt   DateTime          @default(now()) @map("submitted_at") @db.Timestamptz(6)
  submittedById String?           @map("submitted_by_id") @db.Uuid
  reviewNote    String?           @map("review_note") @db.VarChar(1000)
  decidedById   String?           @map("decided_by_id") @db.Uuid
  decidedAt     DateTime?         @map("decided_at") @db.Timestamptz(6)
  rejectReason  String?           @map("reject_reason") @db.VarChar(500)
  confirmedById String?           @map("confirmed_by_id") @db.Uuid
  confirmedAt   DateTime?         @map("confirmed_at") @db.Timestamptz(6)
  @@index([churchId, status, submittedAt(sort: Desc)])
  @@map("membership_applications")
}

model FoundationGroup {
  id        String  @id @default(uuid(7)) @db.Uuid
  churchId  String  @map("church_id") @db.Uuid
  name      String  @db.VarChar(60)          // 'Thursday group'
  isActive  Boolean @default(true) @map("is_active")
  @@unique([churchId, name])
  @@map("foundation_groups")
}

model FoundationEnrollment {
  id          String    @id @default(uuid(7)) @db.Uuid
  churchId    String    @map("church_id") @db.Uuid
  personId    String    @map("person_id") @db.Uuid
  groupId     String    @map("group_id") @db.Uuid
  enrolledAt  DateTime  @default(now()) @map("enrolled_at") @db.Timestamptz(6)
  completedAt DateTime? @map("completed_at") @db.Timestamptz(6)
  droppedAt   DateTime? @map("dropped_at") @db.Timestamptz(6)
  @@index([churchId, groupId])
  @@map("foundation_enrollments")
}

enum AttendanceMark {
  ATTENDED
  MISSED
}

model FoundationAttendance {
  churchId     String         @map("church_id") @db.Uuid
  enrollmentId String         @map("enrollment_id") @db.Uuid
  sessionNo    Int            @map("session_no")    // 1..sessions (setting, default 6)
  mark         AttendanceMark
  markedById   String         @map("marked_by_id") @db.Uuid
  markedAt     DateTime       @default(now()) @map("marked_at") @db.Timestamptz(6)
  @@id([enrollmentId, sessionNo])
  @@map("foundation_attendance")
}

model RegistrationReminder {
  id             String   @id @default(uuid(7)) @db.Uuid
  churchId       String   @map("church_id") @db.Uuid
  registrationId String   @map("registration_id") @db.Uuid
  channel        String   @db.VarChar(20)        // 'COPY_LINK' | 'WHATSAPP' | later 'SMS'
  sentById       String   @map("sent_by_id") @db.Uuid
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  @@index([churchId, registrationId])
  @@map("registration_reminders")
}

/// Per-church settings with defaults in code (membership.probationDays = 30,
/// membership.foundationSessions = 6).
model ChurchSetting {
  churchId  String   @map("church_id") @db.Uuid
  key       String   @db.VarChar(80)
  value     Json
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  @@id([churchId, key])
  @@map("church_settings")
}

/// Keys that let a church's own apps (the registration form) call the public API.
model ApiClient {
  id         String    @id @default(uuid(7)) @db.Uuid
  churchId   String    @map("church_id") @db.Uuid
  name       String    @db.VarChar(80)
  kind       String    @db.VarChar(20)         // 'REGISTRATION'
  keyPrefix  String    @map("key_prefix") @db.VarChar(12)   // first chars, to recognise a key in lists
  keyHash    String    @unique @map("key_hash") @db.Char(64)
  createdAt  DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  lastUsedAt DateTime? @map("last_used_at") @db.Timestamptz(6)
  revokedAt  DateTime? @map("revoked_at") @db.Timestamptz(6)
  @@map("api_clients")
}
```

`ApiClient` is core-owned (the guard reads it before there is a church in
context), so it is **not** in `TENANT_MODELS`.

**Migration extras** (append to the `--create-only` SQL):

```sql
-- Registration is meant to happen once per phone number per church. Partial, so the
-- many in-progress rows with an empty phone don't collide (as in the original schema).
create unique index registrations_phone_idx on registrations (church_id, dial, phone) where phone <> '';

alter table registrations
  add constraint registrations_lang check (lang in ('en','sw','fr')),
  add constraint registrations_status check (status in ('in_progress','submitted'));

-- One open application per person.
create unique index membership_applications_open_idx on membership_applications (person_id)
  where status in ('UNDER_REVIEW','APPROVED');

-- One open foundation class sign-up per person.
create unique index foundation_enrollments_open_idx on foundation_enrollments (person_id)
  where completed_at is null and dropped_at is null;
```

**Commit:** "Store registrations, people and their journey in the shared database".

---

## 5.4 — API client keys for the registration app

**Goal:** the registration app proves which church it serves, and the key
never reaches a browser.

**Do**

1. Key format: `irk_` + 32 random bytes base64url. Store the SHA-256 and the
   first 8 characters as `keyPrefix`.
2. CLI: `npm run cli -w @irca/api -- api-client:create --church IRCA --kind REGISTRATION --name "Registration form (production)"`
   prints the key **once**. `api-client:revoke --id …`.
3. `@PublicClient('REGISTRATION')` decorator + `PublicClientGuard`: reads
   `Authorization: Bearer irk_…`, looks up the hash, and rejects if revoked or
   of the wrong kind (`401`). Sets CLS `churchId = client.churchId`, with no
   user. Updates `lastUsedAt` at most once a minute. The route audit (2.7)
   accepts `@PublicClient` as an access rule.
4. **Client IP for rate limits:** only when the client key is valid, trust
   `X-Forwarded-For`'s first address as the visitor's IP (the registration
   server forwards it). Implement a custom throttler `getTracker`.
5. The CSRF guard accepts `X-IRCA-Client: registration` for these routes.
   The registration server sends no `Origin` (it is server-to-server), which the guard allows.

**Commit:** "Let a church's registration form call the API with its own key".

---

## 5.5 — The public registration API

**Goal:** the API does exactly what `apps/registration/src/lib/actions.ts`
and `registration.ts` do today, with the same rules and the same messages.

**Do** — `src/modules/membership/public-registration/`:

| Route | Replaces | Behaviour |
| --- | --- | --- |
| `POST /v1/public/registrations` `{ lang }` | `createRegistration` | Unknown lang → `en`. Create a registration with a 32-hex token (`randomBytes(16)`), `current_step = FIRST_STEP`, and its `Person` (5.8). Count `registrations.started`. Return the registration DTO. |
| `GET /v1/public/registrations/:token` | `getByToken` | Returns `{ token, lang, status, currentStep, furthestStep, values, createdAt, updatedAt, submittedAt }`. `values` is built exactly like `toRegistration` (fresh array copies, `children` at least `['']`). 404 if not found. |
| `POST /v1/public/registrations/:token/steps/:stepId` `{ draft }` | `saveStep` | **Port `saveStep` line by line**: submitted → `{ ok: true, next: 'done' }`; unknown step → error; take only `keysForStep(step)`; merge; `validateStep` in the registration's language; compute `next` from `screenIds(merged)`; save with `current_step = next` and `furthest_step` via the ported `furthest()`; the phone unique index → `{ ok: false, error: t(UI.eTaken, lang) }`; when `next === 'done'` re-validate every step then submit. Returns `SaveResult` with **step ids**, not URLs (the app builds URLs). |
| `POST /v1/public/registrations/:token/draft` `{ stepId, values }` | `/api/draft` | Port it: no validation, only the step's keys, swallow the phone-taken error, always `204`. |
| `PUT /v1/public/registrations/:token/lang` `{ lang }` | `setLanguage` | An unrecognised value is ignored (not coerced), as today. |
| `POST /v1/public/registrations/:token/submit` | `submitRegistration` | Re-validate every applicable step, then submit. Count `registrations.submitted`. |

Rules:

- Every `:token` must match `/^[a-f0-9]{32}$/` (`400` otherwise).
- Throttle per visitor IP: create 20/hour, steps 120/min, draft 240/min.
- Registration writes are **not** audited per step (a busy Sunday would bury
  the log). Submits are, as `membership.registration.submitted`, with no actor.
- **Port the comments too.** The reasoning about snapshot semantics in
  `registration.ts` (why each write uses a single statement with `RETURNING`)
  matters if anyone switches this to raw SQL. With Prisma, an
  `update … where token and status = 'in_progress'` followed by returning the
  row is the equivalent. Use `updateMany` + `findUnique` inside one
  transaction, or a single `update` with a `where` on the unique token plus
  `status`.

**Check:** e2e tests that mirror today's behaviour (5.20). Then point a local
registration app at the API (5.6) and walk the form.

**Commits:** "Serve the registration form from the API"; "Autosave
registration drafts through the API".

---

## 5.6 — The registration app talks to the API (behind a switch)

**Goal:** the same app can run on either backend, chosen by one environment
variable. Switching over (and back, if needed) is a redeploy, not a code change.

**Do**

1. Env (`apps/registration/.env.example`):

   ```bash
   # 'db' = the original direct database (until cutover), 'api' = the IRCA API.
   REGISTRATION_BACKEND=db
   API_INTERNAL_URL=http://localhost:4000
   REGISTRATION_API_KEY=irk_...        # from api-client:create; server-only, never NEXT_PUBLIC_
   DATABASE_URL=...                    # only needed while REGISTRATION_BACKEND=db
   ```

2. Rename the current `src/lib/registration.ts` to `registration-db.ts`
   (unchanged). Write `registration-api.ts` (`import 'server-only'`) with the
   **same exported functions and types**: `createRegistration`, `getByToken`,
   `setLanguage` and `submit`, plus the higher-level `saveStepRemote` and
   `saveDraftRemote`. Each is a `fetch` to the API with `Authorization`,
   `X-IRCA-Client: registration`, `X-Forwarded-For` (from `headers()`) and
   `cache: 'no-store'`, and it turns ISO date strings back into `Date`.
3. New `src/lib/registration.ts` re-exports one or the other:

   ```ts
   import 'server-only';
   import * as db from './registration-db';
   import * as api from './registration-api';
   const impl = process.env.REGISTRATION_BACKEND === 'api' ? api : db;
   export const { createRegistration, getByToken, setLanguage, submit } = impl;
   export const usingApi = impl === api;
   ```

4. `actions.ts`: `saveStep` and `submitRegistration` call the remote versions
   when `usingApi` and map `next` step ids to URLs as before. Otherwise the
   existing code runs untouched. `src/app/api/draft/route.ts`: when `usingApi`,
   forward to the API's draft route.
5. `src/office/**` is not routed, so nothing to switch. It keeps compiling
   against `registration-db.ts` until 5.19 deletes it.
6. **Do not change `vercel.json` yet.** Its `db:migrate` still runs against
   the old database while the backend is `db`.

**Check:** run the registration app locally both ways (`db`, then `api`), and
walk the full form each time, including: language change mid-way, going back
from the review, a phone number already used (the message appears), closing
the tab mid-question and reopening the link (the draft was saved), finishing
(`done` page, name in the thanks), and "Register someone else".

**Commit:** "Let the registration form run on the API, switched by one variable".

---

## 5.7 — Copying the live registrations

**Goal:** a re-runnable copy from the old database into the new one that
never loses a row or a token.

**Do** — CLI command:

```bash
npm run cli -w @irca/api -- registrations:import \
  --from "$OLD_DATABASE_URL" --church IRCA [--dry-run]
```

1. Read all rows from the old `registrations` table, in batches of 500 by `id`.
2. For each, `insert … on conflict (token) do update set <every column> =
   excluded.<column> where registrations.updated_at < excluded.updated_at`,
   with `church_id` set, `legacy_id = old.id`, and **`token`, `created_at`,
   `updated_at` and `submitted_at` copied exactly**. Disable the Prisma
   `@updatedAt` behaviour by using raw SQL for this insert (with a `-- tenant:`
   comment). This makes the command a **delta sync**: run it again and it
   brings over only new and changed rows.
3. Create the `Person` for each imported registration that has none (5.8's
   copy function), in the same batch transaction.
4. At the end print a verification report and **exit non-zero if anything differs**:
   - row counts by `status`, old vs new (for this church);
   - `md5(string_agg(token || updated_at::text, ',' order by token))` old vs new;
   - 20 random tokens compared field by field;
   - the number of people created.
5. `--dry-run` does everything inside a transaction and rolls it back.
6. A reverse command, `registrations:export-back --to "$OLD_DATABASE_URL"
   --church IRCA --since <iso time>`, copies rows **created or changed in the
   new database after a moment** back into the old table (the same
   conflict-on-token rule). It is only for rollback (5.18).

**Check:** make a Neon **branch** of the production database, and run the
import against it into a staging API database. The report shows all equal.
Run it again: 0 changes.

**Commit:** "Copy registrations across without losing a row or a link".

---

## 5.8 — People records

**Rules**

1. Every registration gets a `Person` when it is created (public API) or
   imported. That way the Members list includes unfinished ones, as the design
   shows ("Unknown — +255 622…").
2. On every registration save, copy `fullname → fullName`, `gender`,
   `age → ageGroup`, `dial`, `phone` and `email` into the linked Person, in the
   same transaction. The visitor owns these facts. The office does not edit
   them for linked people (the UI says "From the registration form" and offers
   "Send them their link" instead).
3. A person added by hand (`POST /v1/membership/people`, `people.update`) has
   no registration, and their identity fields are editable.
4. **Effective salvation and baptism** for display and filters:
   `effectiveSaved = person.saved ?? registration.saved ?? false` (the same for
   baptism). The office's "Mark saved" sets `person.saved = true` with who and
   when. Unmarking sets `false`, which is different from `null` ("go by the
   form"). Show which: "Saved · confirmed by Pastor Sarah" vs "Saved · said on the form".
5. **When someone answers "Joining the church"** on the form (`visit`/`interest`
   includes `JOINING`, and they finish), create a `MembershipApplication {
   source: 'FORM' }` automatically if they have no open one. This is the
   "Visitors → Request being a member" step in the notes.

**Commit:** "Keep a person record for everyone who registers".

---

## 5.9 — Members API

**`GET /v1/membership/people`** (`membership.people.read`). All filters come
from the design's Members screen:

| Param | Values | Meaning |
| --- | --- | --- |
| `tab` | `all`, `joining`, `salvation`, `baptism`, `volunteers`, `new_converts`, `incomplete` | `joining` = interest includes "Joining the church"; `salvation` = effectiveSaved; `baptism` = effectiveBaptised; `volunteers` = interest includes "Serving"; `new_converts` = effectiveSaved and not effectiveBaptised; `incomplete` = registration `in_progress` |
| `q` | text | name, phone or email contains (email only matched if the caller has `read_sensitive`) |
| `salvation` | `any`, `saved`, `not` | |
| `baptism` | `any`, `baptised`, `not` | |
| `gender` | `any`, `Female`, `Male` | |
| `age` | `any`, `18–25`, `26–35`, `36–45`, `46+` | the stored keys from `flow.ts` |
| `lives` | `any`, `Arusha`, `region`, `country` | from `where_at` |
| `source` | `any`, one of the `heard` keys, `other` | |
| `page`, `pageSize` | | |

The response includes `rows`, `total`, and **`tabCounts`** (the count for
every tab with the other filters applied), because the design shows counts on
the tabs.

**Field-level access:** the row DTO always has name, initials, phone,
registered date, age group, interested-in, heard-via, stage, the effective
saved/baptised flags and `complete`. **Only with
`membership.people.read_sensitive`** does the detail include email, DOB, faith
answers, family, ministries, `liked`, `prayer` and notes. Build the DTO in one
function, `toPersonDto(row, auth)`, and unit-test that a caller without the
permission never receives those keys, not even as `null`.

**Other endpoints**

| Route | Permission |
| --- | --- |
| `GET /v1/membership/people/:id` | `people.read` (sensitive parts as above) |
| `POST /v1/membership/people` (add by hand) | `people.update` |
| `POST /v1/membership/people/:id/saved` `{ value: true\|false\|null }` | `people.update`. `true` at stage `VISITOR` moves them to `NEW_CONVERT` (with a stage event) |
| `POST /v1/membership/people/:id/baptised` `{ value }` | `people.update` |
| `POST /v1/membership/people/:id/stage` `{ to, note? }` | `people.update`. Allowed moves below |
| `GET/POST /v1/membership/people/:id/notes` | `read_sensitive` / `notes.write` |
| `GET /v1/membership/people/:id/registration-link` | `registrations.remind`. Returns `{ url, whatsappUrl }` |
| `POST /v1/membership/people/:id/reminders` `{ channel }` | `registrations.remind`. Records that it was sent |
| `GET /v1/membership/people/export.csv?…` | `people.export` (sensitive columns only with `read_sensitive`), audited |

**Allowed stage moves** (anything else → `422 STAGE_MOVE_NOT_ALLOWED`):

```
VISITOR ─► NEW_CONVERT ─► FOUNDATION_CLASS ─► AWAITING_BAPTISM ─► MEMBERSHIP_REVIEW ─► CONFIRMED_MEMBER
   ▲            │                │                    │                  │
   └────────────┴── back one step is allowed, with a note ───────────────┘
MEMBERSHIP_REVIEW and CONFIRMED_MEMBER are entered only through Applications (5.10), never by drag.
```

The WhatsApp link: `https://wa.me/<dial+phone digits>?text=<message>`, with
the message in the person's registration language, e.g. (Swahili) "Habari
Neema, asante kwa kutembelea IRCA. Unaweza kumaliza usajili wako hapa:
{link}". Put the three messages in `flow.ts`'s `UI` so they are translated
with everything else. The registration link is
`${REGISTRATION_ORIGIN}/r/${token}`, where `REGISTRATION_ORIGIN` is a new API env var.

**Commits:** "List and filter people as the design does"; "Show prayer
requests and personal answers only to those allowed"; "Mark people saved and
baptised and move them along"; "Send an unfinished registration its link".

---

## 5.10 — Applications API

The approval steps from the design: **Application submitted → Under review →
Approved → Confirmed.** From the notes: approved or rejected by a pastor alone,
then after a month (the probation) they become members.

| Route | Permission | Rule |
| --- | --- | --- |
| `GET /v1/membership/applications?status=` | `applications.read` | Tabs with counts: Under review, Approved, Confirmed (and Rejected, Withdrawn behind "More"). Each row: person, meta line ("Applied 14 Sept · attends since March"), foundation class status, baptised? |
| `POST /v1/membership/applications` `{ personId, note? }` | `applications.submit` | No open application for them → create `UNDER_REVIEW`, `source: 'OFFICE'`, and move the person to `MEMBERSHIP_REVIEW`. |
| `POST /v1/membership/applications/:id/approve` `{ note? }` | `applications.decide` | `UNDER_REVIEW` → `APPROVED`, `decidedBy/At`. |
| `POST /v1/membership/applications/:id/reject` `{ reason }` | `applications.decide` | `UNDER_REVIEW` → `REJECTED`, and the person goes back to their previous stage (from the stage events). |
| `POST /v1/membership/applications/:id/confirm` | `applications.decide` | `APPROVED` and `decidedAt + probationDays <= today` → `CONFIRMED`, and in the same transaction assign `memberNumber = sequences.next(tx, 'membership:member_number')`, set the person to `CONFIRMED_MEMBER` with `confirmedAt`. Too early → `422 PROBATION_NOT_OVER` with `details.availableOn`. |
| `POST /v1/membership/applications/:id/withdraw` | `applications.submit` | Open → `WITHDRAWN`. |

Every change is audited. `probationDays` comes from `church_settings`
(default 30, editable later on an Admin settings page).

**Commit:** "Review, approve and confirm membership applications".

---

## 5.11 — Discipleship API

| Route | Permission |
| --- | --- |
| `GET /v1/membership/discipleship/board?group=` | `discipleship.read` |
| `GET /v1/membership/discipleship/register?group=` | `discipleship.read` |
| `GET/POST/PATCH /v1/membership/discipleship/groups` | read / `discipleship.manage` |
| `POST /v1/membership/discipleship/enrollments` `{ personId, groupId }` | `discipleship.manage` |
| `POST /v1/membership/discipleship/enrollments/:id/drop` | `discipleship.manage` |
| `PUT /v1/membership/discipleship/attendance` `{ enrollmentId, sessionNo, mark: 'ATTENDED'\|'MISSED'\|null }` | `discipleship.manage` |
| `POST /v1/membership/discipleship/groups/:id/sessions/:no/mark-all` `{ attendedEnrollmentIds[] }` | `discipleship.manage` ("Mark today's session") |

Rules:

- Enrolling moves the person to `FOUNDATION_CLASS` (stage event) and needs no
  open enrollment.
- When all `foundationSessions` (default 6) are `ATTENDED`, set `completedAt`,
  and move to `AWAITING_BAPTISM` if not effectively baptised. Otherwise leave
  them ready for an application (the board shows "Ready to apply").
- **Two `MISSED` in a row** sets a warning flag in the DTO
  (`atRisk: true`). The design's note says "Two in a row would drop him
  back", so show it. **Do not** drop anyone automatically. A person decides.
- The board returns the five columns from the design: New convert,
  Foundation class, Awaiting baptism, Membership review, Confirmed member, each
  with `count` and the first 20 cards (`meta`, `note` from the latest person
  note, and which actions apply). Confirmed shows the most recent 20.

**Commit:** "Run foundation classes and follow people from decision to membership".

---

## 5.12 — Dashboard and Insights API

1. **`GET /v1/membership/dashboard`** (`dashboard.read`): the design's five
   stats (Total registrations, Joining church, Salvation, Baptism, This month),
   each with a delta vs the previous 30 days; applications under review (top 3;
   `null` without `applications.read`); new converts in follow-up (top 4, with
   class progress; `null` without `discipleship.read`); heard-via counts; the
   typed "Other" count; and incomplete registrations (top 4, with "Missing: name,
   age group" computed from `applicableSteps`/`isAnswered`, and `total`).
2. **`GET /v1/membership/insights?period=90d|year|all`** (`insights.read`):
   - the step insights and option insights from the shared `computeInsights`
     (the existing office insights, now per church and period);
   - the design's cards: heard via (count and share), typed "Other" answers
     **grouped** by normalised text (lowercase, trimmed, punctuation removed)
     with counts, age groups, where they live, what they came for, and form
     completion ("Finished the form", "Stopped at contacts"…).
   - Loading every registration row into memory is fine up to tens of
     thousands. `computeInsights` already works that way. Note in a comment
     where to switch to SQL aggregation if a church grows past that.

**Commit:** "Summarise registrations for the dashboard and insights".

---

## 5.13 — Portal: Dashboard

**Route:** `/membership`. Build it to match the design's Dashboard screen
(open `../design/admin/IRCA Admin Portal v2.dc.html`, screen "Dashboard"):

1. The title "Dashboard" and the subtitle "{weekday, date} · live from the
   registration form", plus **Export CSV** (`<Can membership.people.export>`).
2. The stat row (5 tiles, with the `+62`-style delta in `--pos`).
3. **Applications under review** card: initials, name, meta, `Open` and
   `Approve` (`<Can membership.applications.decide>`), and "See all" →
   Applications.
4. **New converts in follow-up**: name, "Saved 7 Sept · Thursday group",
   class label and progress bar, and **Log visit** (`<Can membership.notes.write>`),
   which opens a small dialog to record a `VISIT` note.
5. **How they heard about IRCA**: vertical columns (design), "34 people
   typed their own answer — read them →" linking to Insights.
6. **Incomplete registrations**: name ("Unknown — +255 715 …" when there is
   no name yet), "Missing …", when, and **Remind** (`<Can
   membership.registrations.remind>`), which opens a menu: *Copy link* /
   *Open WhatsApp*. Each records a reminder. The footer "Send reminder to all
   47" is **replaced** by "Download list (CSV)" until an SMS portal exists,
   with a tooltip "Sending to everyone at once needs the Comms portal (SMS)".
7. Each card is hidden when the API returns `null` for it, so a Follow-up
   team member sees a dashboard without Applications.

**Commit:** "Add the Membership dashboard".

---

## 5.14 — Portal: Members and the person panel

**Route:** `/membership/people`. Match the design's Members screen.

1. Search ("filtered as you type"), the six filter selects (Salvation,
   Baptism, Gender, Age, Lives in, Heard via; a select with a value gets the
   accent border as in the design), **Clear** (shown only when a filter is
   set), and the tab pills with counts. Everything is in the URL, with live
   updates (the 3.7 pattern), and "12 of 1,284 shown · filtering live".
2. The table: Member (initials, name, flags "Saved · Baptised · Incomplete"),
   Phone, Registered, Age, Interested in, Heard via, and a chevron. Clicking
   expands the row in place, as in the design:
   - **Registration**: email, gender, lives in, occupation, first visit,
     heard via (email only with `read_sensitive`);
   - **Prayer request**: only with `read_sensitive`. Without it, the section
     is absent (not "hidden" text);
   - **Spiritual status**: the *Saved* / *Baptised* pills. Filled = yes,
     dashed = "Mark saved" (`<Can people.update>`, otherwise plain text). Show
     the source ("said on the form" / "confirmed by …");
   - **Add to foundation class** (`<Can discipleship.manage>`) → pick a group;
   - **Open full record** → `/membership/people/[id]`.
3. The full record page: identity, registration answers (sensitive gated),
   stage and history (stage events), notes timeline with "Add note / Log
   visit / Log call", application status, foundation class progress, and for
   incomplete registrations the **Send their link** menu.
4. Empty result: "No member matches these filters. **Clear them**" (design text).

**Commits:** "Add the Members list with live filters"; "Expand a member in
place and mark them saved or baptised"; "Add a full record for each person".

---

## 5.15 — Portal: Applications

**Route:** `/membership/applications`. Match the design's Applications screen.

1. The tabs "Under review (12) · Approved (5) · Confirmed (318)".
2. Rows: initials, name, meta, the stage badge, and the action button:
   *Approve* (under review), *Confirm* (approved; **disabled with the text
   "From 21 Oct"** until probation is over), and *Record* (confirmed, opening
   the person). Actions are in `<Can membership.applications.decide>`.
   *Reject* sits next to Approve in a `⋯` menu, and asks for a reason.
3. The **Approval steps** side panel from the design (Submitted → Under review →
   Approved → Confirmed, with the notes), with the filled dots showing where
   the selected application is.
4. **+ New application** (`<Can applications.submit>`): pick a person
   (a combobox over people, reusing the Finance combobox pattern **without**
   create).
5. Confirming shows the result: "Joyce Temba is member #1199".

**Commit:** "Add the Applications page".

---

## 5.16 — Portal: Discipleship (board, list, class register)

**Route:** `/membership/discipleship`, with a **Board / List / Class
register** segmented control and a group filter (Thursday group, Saturday
group, All groups), all as in the design.

1. **Board:** the five columns with coloured dots and counts, and cards with
   initials, name, meta, note, and the primary/secondary buttons from the
   design (`Open record` / `Add to class` / `Mark session` / `Mark baptised` /
   `Approve` / `Assign role`). Each button is behind its permission.
   *Assign role* (serving ministries) is **out of scope**. Leave it out
   rather than showing a dead button.
   - **Drag a card to move a person on** (design subtitle): use `@dnd-kit/core`,
     which has keyboard dragging built in. The drop calls `POST …/stage` and
     reverts with a toast on `422`. Columns that cannot be entered by drag
     (Membership review, Confirmed) do not accept drops, and the cursor shows it.
   - `+ Add person` under New convert (`<Can people.update>`).
2. **List:** the table from the design (Person, Stage badge, Saved on,
   Foundation class progress, Class group).
3. **Class register:** "Only people who signed up for the classes. Six
   sessions; a tick is a session attended." A grid of 6 cells per person
   (✓ attended, × missed, empty = not yet held), clicking a cell cycles
   through them (`<Can discipleship.manage>`, otherwise read-only), the
   "Done" column ("5 of 6"), and **Mark today's session** (pick the session
   number and tick who attended, which sends `mark-all`). At-risk people (two
   misses in a row) get the accent colour and a tooltip.

**Commits:** "Add the discipleship board"; "Move people along the board by
dragging"; "Take foundation class attendance".

---

## 5.17 — Portal: Insights

**Route:** `/membership/insights`. Match the design's Insights screen:
"How they heard about IRCA — 1,194 answers. This is what the church should
keep doing.", the period switch (Last 90 days / This year / All time),
horizontal bars with count and share, the "Typed 'Other' answers" card
("34 people wrote their own. Grouped by what they said."), and the four cards
(Age groups, Where they live, What they came for, Form completion).

Below the design's cards, keep what the old `/admin/insights` page showed:
per-question **reached / answered / left blank / stopped here**, and each
question's option counts. That is what tells the office whether a question
is earning its place (see the comments in `insights.ts`).

**Commit:** "Add Insights, including where people stop on the form".

---

## 5.18 — Cutover runbook

Do this on a **Sunday evening after the last service** (the lowest traffic of
the week). Two people: one runs the commands, the other checks. Write the
actual times into the PR as you go.

**A week before**

1. The API with Membership is deployed to production (Phase 6 deployment
   steps), the migrations applied, IRCA exists, Membership is enabled, and
   pastors have roles.
2. `api-client:create --church IRCA --kind REGISTRATION --name "Registration form (production)"`.
   Store the key in Vercel as `REGISTRATION_API_KEY` for **Production only**.
   Create a second key for a **TEST** church and put it in **Preview**, so
   preview deployments never write IRCA data.
3. Set Vercel env `API_INTERNAL_URL` (production and preview), and
   `REGISTRATION_BACKEND=api` in **Preview** only. Open a preview deploy and
   walk the whole form. The rows land in the TEST church.
4. Import dry-run against production data, and then a real first import:
   `registrations:import --from "$OLD_PROD_URL" --church IRCA`. The report
   must be all equal. Pastors check the Members page against what they know.

**On the evening (T = start)**

| Time | Step | Check |
| --- | --- | --- |
| T+0 | Run the import again (delta). | Report equal. |
| T+2 | Vercel → registration → Production env: `REGISTRATION_BACKEND=api`. Redeploy production. | The deploy is green. |
| T+5 | Run the import again. It catches anything saved to the old database during the deploy. | "n changed" is small, and the report is equal. |
| T+6 | On a phone, start a registration on the production URL, finish it, and check that it appears in the portal's Members list. Then open an **old** link from the Incomplete list, and check it continues where that person stopped. | Both work. |
| T+15 | Run the import one last time. | **0 changes.** The old database is no longer written to. |
| T+16 | In Neon, make the old database's role read-only (`alter role … set default_transaction_read_only = on`), or revoke `insert, update` on `registrations`. Keep the old database for 90 days. | A write attempt from the old code path fails. |
| T+20 | Change `apps/registration/vercel.json` `buildCommand` to `next build` (no more `db:migrate`) and remove `DATABASE_URL` from Vercel **after** the next successful deploy. | The next deploy builds without the old database. |

**Rollback** (only in the first 48 hours, and only for a real breakage):

1. Re-grant writes on the old database.
2. `registrations:export-back --to "$OLD_PROD_URL" --church IRCA --since <T+2>`.
3. Set `REGISTRATION_BACKEND=db` and redeploy.
4. Write down what broke, and fix it before trying again.

---

## 5.19 — Removing the old paths

One week after a clean cutover:

1. Delete `apps/registration/src/lib/registration-db.ts`, `src/lib/db.ts`,
   `src/types/pg.d.ts`, `db/schema.sql`, `scripts/setup-db.mjs`,
   `scripts/apply-schema.mjs`, the `db:*` scripts, and the `pg` / `@types/pg`
   dependencies.
2. Delete `src/office/**` and the "Office screens" block in `globals.css`
   (the `.admin*`, `.stats`, `.option*` classes), **after** checking the
   porting table below. Every row must be ticked, and the funnel comments must
   live on in the API's insights code.
3. Remove the switch. `registration.ts` *is* the API version now.
4. Update `apps/registration/README.md`: "Running it" now means "start the
   API (see the root README) and set `API_INTERNAL_URL` and
   `REGISTRATION_API_KEY`". Remove the Neon/Vercel migration section, and
   replace it with a pointer to the API's deployment notes.

**Commits:** one per bullet group, each explaining why the code is no longer needed.

---

## 5.20 — Tests

**API e2e — registration parity** (`test/membership/public-registration.e2e-spec.ts`).
These are the behaviours the owner found by walking the form. Pin every one:

- Create → first step. Unknown lang → `en`.
- `saveStep` only writes the keys of its step (editing phone cannot blank a
  neighbour).
- Ticking "Joining the church" opens the membership path on the **next** screen, not one late.
- `furthest_step` never moves backwards when walking back.
- A phone number already registered → the localised "taken" message, in each language.
- The last question submits. Submitting with an earlier required step
  empty → that step's error.
- A draft saves partial data without validation and ignores the phone-taken error.
- The language switch ignores unknown values.
- A submitted registration: further `saveStep` returns `next: 'done'` and changes nothing.
- A bad key → 401. A revoked key → 401. The TEST church's key cannot read an IRCA token (404).
- Throttling: the 21st create in an hour from one visitor IP → 429.

**Import:** import twice → identical; change a row in the "old" database →
the delta brings exactly that; tokens and timestamps are identical.

**Members:** the tab and filter semantics match the design's `byTab` rules; a
Follow-up team member gets no `prayer`, `email` or `dob` keys at all (assert
key absence); the export for a non-sensitive role has no sensitive columns.

**Applications:** the full path to member number; confirming before probation
→ 422 with the date; two parallel confirms give two different member numbers;
a non-pastor gets 403 on approve.

**Discipleship:** six ticks complete the class and move the stage; two misses
in a row → `atRisk`; a drag to Membership review → 422.

**Permission matrix** for the four Membership roles, generated like Finance's
(4.16). **Impersonation:** every Membership write → `IMPERSONATION_READ_ONLY`.

**Playwright:**

1. Register on the registration app (backend `api`) → the person appears in
   Members, filtering live finds them, and expanding shows their prayer request as a pastor.
2. As Follow-up team: the same person, and **no** prayer request section.
3. Pastor approves an application. With time moved 31 days (a test-only
   clock endpoint, `NODE_ENV=test`), they confirm, and a member number shows.

**Commit:** "Pin the registration form's behaviour on the API, and test the
Membership portal".

---

## 5.21 — Phase check

- [ ] The cutover runbook was followed, times recorded, and the final delta was 0.
- [ ] An SMS link sent before the cutover still opens the right registration.
- [ ] The old `/admin` pages are gone from production.
- [ ] Prayer requests are visible only with `membership.people.read_sensitive`, proven by test and by viewing as a Follow-up team member.
- [ ] Every screen of the design exists and was compared side by side with `../design/admin` in both themes.
- [ ] `registrations.started` / `registrations.submitted` appear in usage.

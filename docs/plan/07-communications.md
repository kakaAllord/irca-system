# Phase 7 — The Communication system (SMS through Beem)

> **In one sentence:** the church gets one place that sends text messages —
> with one account, one history, one set of approved words and one bill — and
> each department uses it to send its own routine messages without waiting
> for anyone.

**Status:** not started. **Comes after:** Phase 6. **Comes before:** Phase 8
(Outreach sends its Friday reminders through this) and Phase 9 (pledge
reminders).

---

## Before you start

**1. What must already be true.**

- Phases 1–6 are built (they are; see `README.md`).
- Step 7.1 below needs three answers from the Communications team. You can
  build steps 7.2–7.6 while you wait for them, but not 7.7 (sending), because
  the daily spending cap comes from their budget.

**2. Read these first, in this order** (about 30 minutes):

| Read | Why |
| --- | --- |
| `00-decisions.md`, D21, D22, D25, D26 | The four decisions this whole phase carries out. D21 is *who controls what*, D22 is *opt-out and language*, D25 is *cost*, D26 is *where the Beem key lives*. |
| `00-decisions.md`, D27 | There is one church. No table gets a `church_id`. |
| `docs/modules/comms-brief.md` | What the Communications department told us it does. |
| `docs/adding-a-module.md` | The recipe every portal follows. This phase follows it. |
| `apps/api/src/core/email/email.service.ts` | Email already works the way SMS will: written to an outbox table first, sent by a background job. Copy its shape. |
| `apps/api/src/core/change-requests/` | The "registry" pattern: core code that modules plug into without core importing them. Audiences (7.5) use the same trick. |

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
step → do it → run its **Check** → run the four checks below → commit with
the step's commit title → push `dev-allord`.

```bash
npm run typecheck && npm run lint && npm test
npm run test:e2e -w @irca/api
```

---

## What you are building, in plain words

Today nobody at the church can send a text from the system. After this phase:

- **Communications** (the department) owns the Beem account, approves the
  wording of every message template, decides which groups of people each
  department may text, and sees what everything cost.
- **A department** (Outreach first) writes its own templates, sends them to
  the groups it was given, and sets up weekly reminders — without asking
  Communications each time, because Communications already approved the words.
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
  presses Send  ──▶  checks: may they? may they reach these people?
                     are the words approved? is it under today's cap?
                     ──▶  one row per phone in comms_recipients (the outbox)
                                           background job  ──────────▶  SMS
  sees delivered / failed  ◀─────────────  delivery reports  ◀──────────
```

## Words used in this phase

| Word | Meaning |
| --- | --- |
| **Template** | The approved wording of a message, with a body in each language (`en`, `sw`, `fr`) and blanks like `{{first_name}}`. |
| **Audience** | A group of people a message can go to, such as "the Outreach team". Worked out fresh at the moment of sending; never stored as a copy of a list. |
| **Audience provider** | The code, belonging to one module, that turns an audience into names and phone numbers. |
| **Grant** | Permission for a department to use a particular audience. |
| **Sender** | One of the (at most two) people allowed to send for a department: its leader and one delegate. |
| **Segment** | The unit carriers charge by: 160 plain characters, or 70 if any character is outside the basic SMS alphabet. |
| **Beat** | A message that repeats on a rhythm ("every Tuesday at 18:00"), picking one of several approved templates each time so it doesn't read like an alarm. |
| **Cap** | The most the church may spend on SMS in one day. A send that would pass it is refused. |

## The steps at a glance

| Step | What | You are done when |
| --- | --- | --- |
| 7.1 | The brief | The Comms team's answers are in `comms-brief.md`. |
| 7.2 | The module and its permissions | Communications appears in Admin → Portals with three roles. |
| 7.3 | The tables | The migration runs; the app role cannot rewrite history. |
| 7.4 | Beem, behind a provider | A send goes to the log in development, to memory in tests, to Beem in production. |
| 7.5 | Audiences | "Outreach team" turns into phone numbers without Comms importing Outreach. |
| 7.6 | Templates | Draft → pending → active, and nobody approves their own. |
| 7.7 | Sending | A send is refused, with a reason you can read, whenever it should be. |
| 7.8 | Beats | A weekly message goes out on its own, never in quiet hours. |
| 7.9 | Replies and delivery reports | A STOP reply stops all future messages to that number. |
| 7.10 | What it costs | The dev console shows messages sent and money spent. |
| 7.11 | The pages | The Comms portal and a department's Messages section work in a browser. |
| 7.12 | Prove it | The tests below exist and fail when their guard is removed. |
| 7.13 | Phase check | Every box ticked. |

---

## 7.0 — Who controls what (read, nothing to build)

| Communications and Admin control | A department does itself |
| --- | --- |
| The Beem account, the sender name, the credit | Writes and sends its routine messages |
| The full history and the delivery reports | Sees its own history and delivery reports |
| Which audiences exist, and which a department may use | Chooses among the audiences it was given |
| Approving a template, and every later version of it | Drafts a template and asks for approval |
| Who may send for a department (leader + one delegate) | The leader names that one delegate |
| Messages to the whole church, or across departments | — |
| The daily cap and the price per segment | Sees what its own sending cost |

**A department can never:** send to an audience it was not granted; send
words no approved template covers (unless an administrator has given it the
`<module>.comms.send_adhoc` permission, which nobody has by default); or read
another department's history.

---

## 7.1 — The brief

**Goal.** Get three answers from the Communications team before any code
depends on them.

**Why.** Guessing who sends, and how much the church can spend, is how a
messaging system empties an account on its first weekend.

**Do.**

1. Open `docs/modules/comms-brief.md`. Sections 1–6 are written from the
   owner's notes; the places marked *TBC* are what you must ask.
2. Ask the Communications team (or the owner, if they speak for them):
   1. Who leads Communications, and who is their one delegate?
   2. What do they send today, and in which languages? The church's default
      language is what someone with no recorded language gets.
   3. What is the monthly SMS budget, in TZS? Divide by 30 for the daily cap
      in 7.7, and write both numbers in the brief.
3. Replace each *TBC* with the answer and the date you got it.

**Check.** `grep -n TBC docs/modules/comms-brief.md` finds nothing in
sections 1–3 and 6.

**Commit.** "Write down what Communications actually sends".

**If it goes wrong.** No answers yet? Build 7.2–7.6 and come back. Do not
invent a budget.

---

## 7.2 — The module, its permissions and its roles

**Goal.** A `comms` module exists, and each department that will send gets a
permission of its own.

**Why.** Everything a person may do is a permission defined in code
(`README.md`, "Words we use"). The sidebar, the role editor and the API's
guards all read these definitions, so this step is what makes the rest
possible.

**Do.**

1. Create `packages/shared/src/modules/comms.ts`. Copy the shape of
   `packages/shared/src/modules/finance.ts`:

   ```ts
   // sketch — complete it, keeping these keys exactly
   export const commsModule = defineModule({
     key: 'comms',
     name: 'Communications',
     description: 'Messages the church sends, and the standards they follow.',
     kind: 'department',
     home: '/comms',
     permissions: {
       'comms.messages.read':     { kind: 'read',  label: 'See every message the church sent' },
       'comms.messages.send':     { kind: 'write', label: 'Send church-wide and cross-department messages' },
       'comms.messages.send_adhoc': { kind: 'write', label: 'Send words no template covers',
                                      hint: 'For emergencies. Held by the Communications lead.' },
       'comms.messages.cancel':   { kind: 'write', label: 'Stop a scheduled or sending message' },
       'comms.templates.read':    { kind: 'read',  label: 'See message templates' },
       'comms.templates.draft':   { kind: 'write', label: 'Write and change templates' },
       'comms.templates.approve': { kind: 'write', label: 'Approve a template for use',
                                    hint: 'Nobody approves their own.' },
       'comms.audiences.read':    { kind: 'read',  label: 'See who the audiences are' },
       'comms.audiences.manage':  { kind: 'write', label: 'Make audiences and give them to departments' },
       'comms.senders.manage':    { kind: 'write', label: 'Say who may send for a department' },
       'comms.schedules.read':    { kind: 'read',  label: 'See recurring messages' },
       'comms.schedules.manage':  { kind: 'write', label: 'Set up recurring messages' },
       'comms.costs.read':        { kind: 'read',  label: 'See what messages cost and the credit left' },
       'comms.settings.manage':   { kind: 'write', label: 'Set the Beem account, the sender name, the daily cap and the price' },
     },
     systemRoles: [
       { key: 'comms.lead',   name: 'Communications lead',   description: '…', permissions: [/* all of the above */] },
       { key: 'comms.sender', name: 'Communications sender', description: '…',
         permissions: ['comms.messages.read', 'comms.messages.send', 'comms.templates.read',
                       'comms.templates.draft', 'comms.audiences.read', 'comms.schedules.read',
                       'comms.costs.read'] },
       { key: 'comms.viewer', name: 'Communications viewer', description: '…',
         permissions: ['comms.messages.read', 'comms.templates.read', 'comms.audiences.read',
                       'comms.schedules.read'] },
     ],
     nav: [
       { label: 'Overview',  href: '/comms',           icon: 'overview',  permission: 'comms.messages.read' },
       { label: 'Compose',   href: '/comms/compose',   icon: 'messages',  permission: 'comms.messages.send' },
       { label: 'History',   href: '/comms/history',   icon: 'activity',  permission: 'comms.messages.read' },
       { label: 'Templates', href: '/comms/templates', icon: 'templates', permission: 'comms.templates.read' },
       { label: 'Recurring', href: '/comms/schedules', icon: 'schedule',  permission: 'comms.schedules.read' },
       { label: 'Audiences', href: '/comms/audiences', icon: 'people',    permission: 'comms.audiences.read' },
       { label: 'Settings',  href: '/comms/settings',  icon: 'settings',  permission: 'comms.settings.manage' },
     ],
   });
   ```

2. **New sidebar drawings.** Add `messages`, `templates` and `schedule` to the
   `NavIcon` type in `packages/shared/src/rbac/define.ts`, and draw each in
   `apps/portal/src/components/shell/NavIcon.tsx` (an envelope, a page with a
   star, a clock). Copy an existing drawing and change its paths; keep the
   same `strokeWidth`. `usage` and `settings` already exist.

3. **Each department's own send permission.** A permission's key must start
   with its module's key, and a role holds permissions from one module only.
   So each department that sends gets its own pair, added to **its** module
   file when that department is built:

   | Module | Permission | Meaning |
   | --- | --- | --- |
   | `membership` | `membership.comms.send` | send Membership's approved templates to its granted audiences (welcomes, class reminders) — add now |
   | `outreach` | `outreach.comms.send`, `outreach.comms.send_adhoc` | same, for Outreach — added in Phase 8 |
   | `finance` | `finance.comms.send` | same, for pledge reminders — added in Phase 9 |

   The department's leader role holds `*.comms.send`. Nobody holds
   `*.comms.send_adhoc` until an administrator grants it on purpose.

4. **One list of every send permission**, so the API never hard-codes it. In
   `packages/shared/src/modules/index.ts`:

   ```ts
   /** Every permission that lets someone send for a department, from every module. */
   export const SEND_PERMISSIONS = ALL_MODULES.flatMap((m) =>
     Object.keys(m.permissions).filter((p) => p.endsWith('.comms.send')),
   );
   ```

5. Add `commsModule` to `CHURCH_MODULES` in the same file, before `adminModule`.

**Check.**

- `npm test` passes (it checks every permission key starts with its module's
  key, and that icons exist).
- `npm run dev`, sign in as `admin@irca.local`: **Admin → Portals** lists
  Communications. Turn it on; **Admin → Roles** now shows its three roles.

**Commit.** "Describe the Communications module"; "Give Membership a send
permission of its own".

**If it goes wrong.** *"Type '…' is not assignable to type 'NavIcon'"* means
step 2 is not finished. *A role is missing in Admin → Roles* — roles are
written at API start-up; restart `npm run dev`.

---

## 7.3 — The tables

**Goal.** Tables for senders, audiences, templates, messages, recipients,
schedules, blocked numbers, replies and the Beem account; plus each person's
language and opt-out.

**Why.** Every rule in this phase is either a row in one of these tables or a
refusal the database makes on its own. Getting them right first makes the
rest ordinary code.

**Do.**

1. Add these models to `apps/api/prisma/schema.prisma`. **No `church_id`
   anywhere** (D27). References to people and users are ordinary relations.

   ```prisma
   // sketch — names and shape; add @relation lines and the enums

   /// Who may send for a department: its leader, and at most one delegate.
   model CommsSender {
     id          String     @id @default(uuid(7)) @db.Uuid
     /// 'comms' for the central team, or the department's module key.
     moduleKey   String     @map("module_key") @db.VarChar(30)
     userId      String     @map("user_id") @db.Uuid
     kind        SenderKind                    // LEADER | DELEGATE
     grantedById String     @map("granted_by_id") @db.Uuid
     grantedAt   DateTime   @default(now()) @map("granted_at") @db.Timestamptz(6)
     revokedAt   DateTime?  @map("revoked_at") @db.Timestamptz(6)

     @@unique([moduleKey, userId])
     @@map("comms_senders")
   }

   /// A group of recipients. Worked out when a message is sent, never stored as a copy.
   model CommsAudience {
     id          String       @id @default(uuid(7)) @db.Uuid
     /// The department that owns it, or null for a church-wide audience.
     moduleKey   String?      @map("module_key") @db.VarChar(30)
     key         String       @unique @db.VarChar(60)   // 'outreach.team', 'church.members'
     name        String       @db.VarChar(80)           // 'Outreach team'
     kind        AudienceKind                           // PROVIDED | LIST
     /// For PROVIDED: the provider's parameters. For LIST: {}.
     definition  Json         @default("{}")
     isActive    Boolean      @default(true) @map("is_active")

     @@map("comms_audiences")
   }

   /// A department may use an audience only once it has been given it.
   model CommsAudienceGrant {
     audienceId  String   @map("audience_id") @db.Uuid
     moduleKey   String   @map("module_key") @db.VarChar(30)
     grantedById String   @map("granted_by_id") @db.Uuid
     grantedAt   DateTime @default(now()) @map("granted_at") @db.Timestamptz(6)

     @@id([audienceId, moduleKey])
     @@map("comms_audience_grants")
   }

   /// People named by hand, for a LIST audience. Exactly one of the two is set.
   model CommsAudienceMember {
     id         String  @id @default(uuid(7)) @db.Uuid
     audienceId String  @map("audience_id") @db.Uuid
     personId   String? @map("person_id") @db.Uuid
     userId     String? @map("user_id") @db.Uuid

     @@unique([audienceId, personId])
     @@unique([audienceId, userId])
     @@map("comms_audience_members")
   }

   /// The words, approved once and used many times. Editing makes a new version.
   model CommsTemplate {
     id           String         @id @default(uuid(7)) @db.Uuid
     moduleKey    String?        @map("module_key") @db.VarChar(30)
     key          String         @db.VarChar(60)    // 'outreach.training.reminder'
     name         String         @db.VarChar(80)
     version      Int            @default(1)
     status       TemplateStatus @default(DRAFT)    // DRAFT | PENDING | ACTIVE | REJECTED | RETIRED
     /// The blanks the bodies use, worked out from them: ['first_name', 'date'].
     fields       String[]       @default([])
     supersedesId String?        @map("supersedes_id") @db.Uuid
     createdById  String         @map("created_by_id") @db.Uuid
     createdAt    DateTime       @default(now()) @map("created_at") @db.Timestamptz(6)
     submittedAt  DateTime?      @map("submitted_at") @db.Timestamptz(6)
     decidedById  String?        @map("decided_by_id") @db.Uuid
     decidedAt    DateTime?      @map("decided_at") @db.Timestamptz(6)
     decisionNote String?        @map("decision_note") @db.VarChar(500)

     bodies CommsTemplateBody[]

     @@unique([key, version])
     @@map("comms_templates")
   }

   /// One body per language. One approval covers all of them.
   model CommsTemplateBody {
     templateId String @map("template_id") @db.Uuid
     lang       String @db.VarChar(2)     // 'en' | 'sw' | 'fr'
     body       String @db.VarChar(918)   // six segments at most

     @@id([templateId, lang])
     @@map("comms_template_bodies")
   }

   /// One send: now, at a set time, or from a beat.
   model CommsMessage {
     id             String        @id @default(uuid(7)) @db.Uuid
     moduleKey      String        @map("module_key") @db.VarChar(30)
     audienceId     String        @map("audience_id") @db.Uuid
     templateId     String?       @map("template_id") @db.Uuid
     scheduleId     String?       @map("schedule_id") @db.Uuid
     /// What was actually sent, per language.
     bodies         Json
     status         MessageStatus @default(SCHEDULED) // SCHEDULED | SENDING | SENT | PARTIAL | FAILED | CANCELLED
     scheduledFor   DateTime?     @map("scheduled_for") @db.Timestamptz(6)
     recipientCount Int           @default(0) @map("recipient_count")
     skippedCount   Int           @default(0) @map("skipped_count")
     failedCount    Int           @default(0) @map("failed_count")
     segments       Int           @default(0)
     /// Segments × the price per segment when it was sent, as money.
     cost           Decimal       @default(0) @db.Decimal(14, 2)
     createdById    String?       @map("created_by_id") @db.Uuid   // null when a beat sent it
     createdAt      DateTime      @default(now()) @map("created_at") @db.Timestamptz(6)
     startedAt      DateTime?     @map("started_at") @db.Timestamptz(6)
     finishedAt     DateTime?     @map("finished_at") @db.Timestamptz(6)

     recipients CommsRecipient[]

     @@index([createdAt(sort: Desc)])
     @@index([moduleKey, createdAt(sort: Desc)])
     @@map("comms_messages")
   }

   /// The outbox: one row per phone number, which is also the delivery record.
   model CommsRecipient {
     id                String          @id @default(uuid(7)) @db.Uuid
     messageId         String          @map("message_id") @db.Uuid
     personId          String?         @map("person_id") @db.Uuid
     userId            String?         @map("user_id") @db.Uuid
     phone             String          @db.VarChar(20)    // E.164, e.g. +255712345678
     lang              String          @db.VarChar(2)
     body              String          @db.VarChar(918)
     segments          Int             @default(1)
     status            RecipientStatus @default(PENDING)
     // PENDING | SENT | DELIVERED | FAILED | SKIPPED_OPT_OUT | SKIPPED_NO_PHONE | SKIPPED_DUPLICATE
     attempts          Int             @default(0)
     nextAttemptAt     DateTime        @default(now()) @map("next_attempt_at") @db.Timestamptz(6)
     providerMessageId String?         @map("provider_message_id") @db.VarChar(200)
     lastError         String?         @map("last_error")
     sentAt            DateTime?       @map("sent_at") @db.Timestamptz(6)
     deliveredAt       DateTime?       @map("delivered_at") @db.Timestamptz(6)

     @@index([status, nextAttemptAt])
     @@index([messageId])
     @@index([phone])
     @@map("comms_recipients")
   }

   /// A beat: the same message on a rhythm, from two or more templates.
   model CommsSchedule {
     id            String    @id @default(uuid(7)) @db.Uuid
     moduleKey     String    @map("module_key") @db.VarChar(30)
     name          String    @db.VarChar(80)
     audienceId    String    @map("audience_id") @db.Uuid
     templateIds   String[]  @map("template_ids") @db.Uuid
     daysOfWeek    Int[]     @map("days_of_week")          // 1 = Monday … 7 = Sunday
     timeOfDay     String    @map("time_of_day") @db.VarChar(5)   // 'HH:MM', church time
     jitterMinutes Int       @default(0) @map("jitter_minutes")
     startsOn      DateTime  @map("starts_on") @db.Date
     endsOn        DateTime? @map("ends_on") @db.Date
     isActive      Boolean   @default(true) @map("is_active")
     lastRunAt     DateTime? @map("last_run_at") @db.Timestamptz(6)
     nextRunAt     DateTime? @map("next_run_at") @db.Timestamptz(6)
     createdById   String    @map("created_by_id") @db.Uuid

     @@index([isActive, nextRunAt])
     @@map("comms_schedules")
   }

   /// A number that asked to be left alone, or that the carrier says is dead.
   model CommsBlockedNumber {
     phone     String   @id @db.VarChar(20)
     reason    String   @db.VarChar(40)        // 'replied STOP', 'invalid number', 'by hand'
     personId  String?  @map("person_id") @db.Uuid
     blockedAt DateTime @default(now()) @map("blocked_at") @db.Timestamptz(6)
     note      String?  @db.VarChar(200)

     @@map("comms_blocked_numbers")
   }

   /// Whatever Beem sent us — replies and delivery reports — exactly as it came.
   model CommsInbound {
     id         String   @id @default(uuid(7)) @db.Uuid
     phone      String   @db.VarChar(20)
     body       String   @db.VarChar(1000)
     receivedAt DateTime @default(now()) @map("received_at") @db.Timestamptz(6)
     action     String   @db.VarChar(40)     // 'opted out', 'delivery report', 'kept'
     raw        Json

     @@index([receivedAt(sort: Desc)])
     @@map("comms_inbound")
   }

   /// The Beem account. Exactly one row (a check constraint, like `church`).
   model CommsBeemAccount {
     id              Int      @id @default(1)
     apiKeyEnc       Bytes    @map("api_key_enc")
     secretKeyEnc    Bytes    @map("secret_key_enc")
     senderId        String   @map("sender_id") @db.VarChar(11)
     updatedAt       DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
     updatedById     String   @map("updated_by_id") @db.Uuid

     @@map("comms_beem_account")
   }
   ```

2. **On existing tables:**
   - `people.lang` — `String @default("en") @db.VarChar(2)`: the language the
     person answered the registration form in. The owner asked for exactly
     this (D22). The migration **backfills** it:
     `update people p set lang = r.lang from registrations r where r.id = p.registration_id;`
     and the registration's submit code (`modules/membership/public-registration`)
     copies `lang` onto the person it creates from now on. The office can edit
     it on the person's page (7.11).
   - `people.sms_opt_out` (`Boolean @default(false)`), `sms_opt_out_at`,
     `sms_opt_out_source` (`'reply' | 'office' | 'form'`).
   - `users.sms_opt_out` (`Boolean @default(false)`): staff are texted too, and
     may turn reminders off on their Account page.

3. **Create the migration without applying it**, so you can add the rules
   Prisma cannot express:

   ```bash
   cd apps/api
   npx prisma migrate dev --create-only --name comms
   ```

   Open the new `prisma/migrations/<timestamp>_comms/migration.sql` and add
   at the end:

   ```sql
   -- The Beem account is a single row, like the church itself.
   alter table comms_beem_account add constraint comms_beem_account_singleton check (id = 1);
   -- Nobody viewing as someone ever needs the encrypted key.
   revoke select on table comms_beem_account from irca_readonly;

   -- History is a record: it may be added to, never rewritten or removed.
   revoke delete, truncate on table comms_messages, comms_recipients, comms_inbound from irca_app;
   revoke update on table comms_inbound from irca_app;
   -- What may change as a message is sent, and nothing else.
   revoke update on table comms_messages, comms_recipients from irca_app;
   grant update (status, started_at, finished_at, failed_count) on table comms_messages to irca_app;
   grant update (status, attempts, next_attempt_at, provider_message_id,
                 last_error, sent_at, delivered_at) on table comms_recipients to irca_app;

   -- At most one live delegate per department.
   create unique index comms_one_delegate on comms_senders (module_key)
     where kind = 'DELEGATE' and revoked_at is null;
   ```

   New tables get `select` for `irca_readonly` and read-write for `irca_app`
   automatically (the default privileges from the earlier migrations), so you
   only write what is taken away.

4. Apply it: `npx prisma migrate dev` (still in `apps/api`).

5. Add each new table to `docs/plan/appendix-database.md` with one line on
   what it is for and its special rules.

**Check.**

- `npx prisma migrate dev` finishes without errors.
- `npm run test:e2e -w @irca/api` is still green.
- In `psql` as the app role, history cannot be rewritten:

  ```bash
  psql postgresql://irca_app:app_local_pw@localhost:5432/irca_dev \
    -c "delete from comms_messages"          # ERROR: permission denied
  ```

- `select lang, count(*) from people group by lang;` shows the backfilled
  languages, not all `en`.

**Commit.** "Tables for the Communication system"; "Record the language a
person answered in, and whether they want messages".

**If it goes wrong.** *"permission denied" when the worker updates a
recipient* — a column is missing from the `grant update (…)` list. Add it in a
**new** migration; never edit one that has been applied.

---

## 7.4 — Beem, behind a provider

**Goal.** Sending an SMS is one interface with three implementations, so
tests never touch the network and development never spends credit.

**Why.** Email already works this way (`core/email/providers/`). A developer
running the app on a laptop must not be able to text a real church member by
accident.

**Do.**

1. `apps/api/src/core/sms/sms.types.ts`:

   ```ts
   // sketch
   export const SMS_PROVIDER = Symbol('SMS_PROVIDER');
   export type SmsSend = { to: string; body: string; senderId: string };
   export type SmsResult = { providerMessageId: string | null; accepted: boolean; error?: string };
   export interface SmsProvider {
     send(message: SmsSend): Promise<SmsResult>;
     /** Credit left, or null when the provider cannot say. */
     balance(): Promise<{ amount: string; currency: string } | null>;
   }
   ```

2. Three providers in `apps/api/src/core/sms/providers/`:
   - `memory.provider.ts` — keeps sent messages in an array for tests to read,
     like `MemoryEmailProvider`.
   - `log.provider.ts` — writes the message to the server log. Used in
     development, and in production until Beem is set up.
   - `beem.provider.ts` — the real one. It reads the account from
     `comms_beem_account` **on every send** (not once at start-up), because
     Communications may change the key at any moment (D26).

   `sms.module.ts` chooses: tests (`NODE_ENV=test`) always get memory;
   otherwise Beem when a `comms_beem_account` row exists, else log.

3. **Beem's API.** At the time of writing: `POST
   https://apisms.beem.africa/v1/send` with HTTP Basic auth (key and secret)
   and a body `{ source_addr, encoding, message, recipients: [{ recipient_id,
   dest_addr }] }`; the balance at
   `https://apisms.beem.africa/public/v1/vendors/balance`. **Check both
   against Beem's current documentation before writing the code** — it is
   their API, and it changes.

4. **Keeping the key safe (D26).** The key must come back out in plain text
   (we send it to Beem on every message), so it cannot be hashed like
   passwords. It is encrypted instead:
   - Add `BEEM_SETTINGS_KEY` to `apps/api/src/config/env.ts` (optional; 32
     bytes, base64) and to `.env.example` with a comment on how to make one:
     `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
   - `core/sms/secret-box.ts`: `seal(text)` and `open(bytes)` using AES-256-GCM
     from `node:crypto`, with a fresh 12-byte nonce per value stored in front
     of the ciphertext. Unit-test that `open(seal(x)) === x` and that a changed
     byte fails to open.
   - With no `BEEM_SETTINGS_KEY`, saving a Beem account is refused with a
     message saying which variable to set.

5. **Counting segments** in `packages/shared/src/sms.ts`, so the API and the
   composer count the same way:
   - If every character is in the GSM-7 alphabet: 160 characters for one
     segment, 153 each when there are several.
   - Otherwise (UCS-2): 70 for one, 67 each when several.
   - Swahili is GSM-7. A curly apostrophe `’` pasted from Word is not, and
     halves the space. `segments(text)` returns `{ encoding, segments,
     charsLeft }` so the composer can warn at the boundary.

6. `BEEM_INBOUND_SECRET` (for 7.9) goes in `env.ts` and `.env.example` too. It
   is not Beem's key; it is the password Beem uses when it calls **us**.

**Check.**

- Unit tests for `segments`: 160 plain characters → 1; 161 → 2; 70 characters
  with one emoji → 1; 71 → 2; a Swahili sentence with `’` → UCS-2.
- `npm run dev` with no Beem account: the API starts, and a send (after 7.7)
  appears in the API's terminal.
- `grep -rn "BEEM_API_KEY" apps` finds nothing: the key is never an
  environment variable.

**Commit.** "Send SMS through Beem, or to the log"; "Count SMS segments the way
the carriers do"; "Keep the Beem key encrypted in the database".

---

## 7.5 — Audiences, without Comms knowing any department

**Goal.** "Everyone in the Outreach team" becomes a list of phone numbers
without the Communications code importing Outreach.

**Why.** If Comms imported every department, every new department would mean
editing Comms. The registry pattern (the same one change requests use) lets
each module plug its own audiences in.

**Do.**

1. `apps/api/src/core/comms/audience.registry.ts`:

   ```ts
   // sketch
   export interface AudienceProvider {
     readonly moduleKey: string;
     /** 'outreach.team', 'church.members', 'finance.pledge_outstanding'. */
     readonly key: string;
     readonly name: string;
     /** The blanks this audience can fill: ['first_name', 'balance']. */
     readonly fields: string[];
     /** Who is in it, right now. */
     resolve(tx: Tx, params: Record<string, unknown>): Promise<AudienceMember[]>;
   }
   export type AudienceMember = {
     personId?: string;
     userId?: string;
     dial: string;      // '+255'
     phone: string;     // as recorded
     lang?: string;     // theirs, if known
     fields: Record<string, string>;
   };
   ```

   `AudienceRegistry` is an `@Injectable()` in `CoreModule` with
   `register(provider)` and `get(key)`. Each module registers its providers in
   its own service's `onModuleInit()` — look at how
   `modules/finance/transaction-change.handler.ts` registers itself.

2. The audiences this phase ships:

   | Key | Registered by | Who is in it |
   | --- | --- | --- |
   | `church.staff` | admin | every active user with a phone number |
   | `church.members` | membership | people at stage `CONFIRMED_MEMBER` |
   | `church.people` | membership | every person with a phone number |
   | `membership.class` | membership | people in a foundation group (optionally one group) |
   | `list` | comms | the people named by hand in a LIST audience |

   On first start, a seed (or the registry sync) creates a `comms_audiences`
   row for each provider, so they can be granted.

3. **The rules**, in one function `AudienceResolver.resolve(...)` in
   `core/comms/`, so no caller can forget one:
   1. **Never** a number in `comms_blocked_numbers`, and never a person or user
      with `sms_opt_out`. They are still written as recipients, with status
      `SKIPPED_OPT_OUT`, so the sender sees "12 of 143 were left alone".
   2. **One message per number.** Someone listed twice (a staff member who is
      also a member) gets `SKIPPED_DUPLICATE` the second time.
   3. **A number that isn't one** gets `SKIPPED_NO_PHONE`. Normalise with
      `libphonenumber-js` (already in `packages/shared`) from `dial + phone`,
      and store the result as E.164 (`+255712345678`).
   4. **A department may only use an audience it has a grant for**
      (`comms_audience_grants`), or its own team audience, which is granted
      automatically when its portal is turned on. Its contacts audience (for
      Outreach, the people it reached) is **not** granted automatically: D22,
      people reached on a doorstep are not staff, and texting them is an
      administrator's deliberate choice.

**Check.**

- A unit test per provider against seeded data: the right people, no one else.
- An e2e test (`apps/api/test/comms-audiences.e2e-spec.ts`, using the helpers in
  `test/helpers.ts`): an opted-out person is skipped and counted; the same
  number twice is sent once; a department is refused an audience it was not
  granted (403), and allowed once an administrator grants it.

**Commit.** "Resolve an audience without Comms knowing any department"; "Never
message someone who asked us not to".

---

## 7.6 — Templates: written by the department, approved once

**Goal.** The wording is agreed before it is used, and using it needs nobody.

**Do.**

1. **The life of a template:** `DRAFT → PENDING → ACTIVE`, or `REJECTED`.
   Editing an `ACTIVE` template never changes it: it creates version *n+1* in
   `DRAFT`, pointing back with `supersedesId`. The old version keeps working
   until the new one is approved; then the old one becomes `RETIRED`. So a
   department is never left without words mid-week.
2. **A body per language.** One approval covers all three, because a template
   approved in English and quietly different in Swahili is exactly what this
   step prevents. A language left empty falls back to the church's default
   language (`comms.defaultLang` in `settings`, default `sw`).
3. **Blanks** are `{{snake_case}}`. When a draft is saved, work out its blanks
   from the bodies and store them in `fields`. Refuse — at draft time, naming
   the blank — one that none of the department's audiences can fill. The
   blanks in Phase 7: `first_name`, `full_name`, `church_name`, `event_name`,
   `date`, `time`, `venue`. (Phase 9 adds `amount`, `balance`, `due_date`,
   `campaign_name`.)
4. **Nobody approves their own.** Approving needs `comms.templates.approve`,
   and the approver must not be the person who submitted it — the same rule as
   change requests (D17), with the same wording in the refusal.
5. **Never deleted.** A template that was ever used is only `RETIRED`, so the
   history keeps meaning something.

Routes, in `apps/api/src/modules/comms/templates.controller.ts`: list, get,
create draft, edit (makes a version if active), submit, approve, reject,
retire. Each route has its `@RequirePermission(…)` — the API will not start
otherwise.

**Check.** An e2e test: a draft cannot be sent; approving makes it usable;
editing it makes version 2 while version 1 still sends; approving version 2
retires version 1; the author cannot approve their own (403, with the reason);
a draft with `{{nickname}}` is refused and the message names `nickname`.

**Commit.** "Approve the words once, then let the department use them"; "A
template is a version, not a rewrite".

---

## 7.7 — Sending

**Goal.** A send that cannot quietly cost more than the church meant, reach
the wrong people, or be started by the wrong person.

**Why.** This is the one action in the system that spends real money and
cannot be undone. Every refusal must say, in words, why.

**Do.**

1. `POST /v1/comms/messages` with `{ moduleKey, audienceId, templateId,
   fields?, scheduledFor? }` — or `{ moduleKey, audienceId, bodies }` for
   words no template covers. Guard it with
   `@RequireAnyPermission('comms.messages.send', ...SEND_PERMISSIONS)` (from
   7.2), then check the rest in the service, **in one `db.tx()`**, in this
   order:
   1. **May this person send for this department?** They hold
      `comms.messages.send` (central; any audience) or `<moduleKey>.comms.send`,
      **and** they have a live `comms_senders` row for that module. The
      permission says *what kind* of sending; the row says *they* are the one
      doing it. That is how "only the leader or their one delegate" works
      without a second role system.
   2. **May they use this audience?** 7.5, rule 4.
   3. **Are the words allowed?** An `ACTIVE` template belonging to that
      department or to Comms. Free text needs `<moduleKey>.comms.send_adhoc`
      (or `comms.messages.send_adhoc` for Comms itself — someone must be able
      to write "no service today, the road is flooded" at eight on a Sunday).
   4. **What will it cost?** Resolve the audience, fill each person's blanks,
      add the opt-out sentence (7.9), count segments, multiply by the price.
      If today's total would pass the **daily cap**, refuse and say the figure:
      *"This would bring today's messages to 52,300 TZS; the daily limit is
      50,000 TZS."*
   5. **Write, don't send.** One `comms_messages` row and one `comms_recipients`
      row per number, `PENDING`, in the same transaction. Nothing leaves yet.
      A crash half-way therefore leaves either everything owed or nothing —
      the same discipline as the email outbox.
   6. `usage.inc('sms.queued', n)`, and `audit.recordIn(tx, …)` with a summary
      naming the audience, the template and the count. **Never** a phone
      number in the activity log.

2. **Settings** used above, stored in the `settings` table with defaults in
   code — copy `modules/membership/settings.ts` into `modules/comms/settings.ts`:

   | Key | Default | Meaning |
   | --- | --- | --- |
   | `comms.pricePerSegment` | `30` | TZS per segment, from the Beem price list |
   | `comms.dailyCap` | from 7.1 | TZS per day; refuse above it |
   | `comms.defaultLang` | `sw` | for people with no language |
   | `comms.quietHours` | `21:00-07:00` | no beat sends inside it (7.8) |

3. **The background sender** — add to
   `apps/api/src/core/jobs/scheduled-jobs.service.ts`, beside `email-outbox`,
   every 15 seconds, through `JobRunner` like the others:
   - claim at most 20 `PENDING` recipients whose `next_attempt_at` has come;
   - send each through the provider;
   - `SENT` when Beem accepts it; retry a failure with the email service's
     back-off (1, 5, 30, 120, 360 minutes); `FAILED` after six tries, keeping
     Beem's words in `last_error`;
   - when a message has no `PENDING` rows left, set it `SENT`, `PARTIAL` or
     `FAILED`.

4. **What the composer shows before the button does anything:** how many
   people, how many are skipped and why, how many segments each message is,
   and the total. The button itself says *"Send to 143 people · about 4,290
   TZS"*. Add `POST /v1/comms/messages/preview`, which runs steps 1–4 and
   returns those numbers without writing anything.

**Check.** An e2e test (`test/comms-sending.e2e-spec.ts`):

- a leader with a sender row can send; a department member without one gets
  403; a second delegate for the same department is refused;
- the cap refuses and the message contains the figure;
- opted-out people are skipped and counted;
- the memory provider received exactly the expected bodies, each in the
  recipient's language, each with the opt-out sentence once;
- the activity log line contains no phone number.

**Commit.** "Send a message, or refuse to for a reason you can read"; "Deliver
the SMS queue in the background".

**If it goes wrong.** *Messages stuck at `SENDING`*: the job crashed mid-run.
Copy the email service's first statement, which puts rows stuck for ten
minutes back to `PENDING`.

---

## 7.8 — Beats: the same message on a rhythm

**Goal.** "Every Tuesday at six, one of these three reminders, to the class"
— set up once, and not sounding like a machine.

**Do.**

1. A beat names **two or more** approved templates and picks one at random
   each time. That is the owner's point (22 Sept): *"they can even put
   multiple and the system can randomly pick to have that sense of not like
   alarm"*. One template is allowed, with a hint that two sound more human.
2. `jitterMinutes` sends at a random minute within that window after the set
   time, for the same reason.
3. **When does it next run?** Write one pure function,
   `nextRun(schedule, after, timezone, quietHours)`, in
   `apps/api/src/core/comms/next-run.ts`, and unit-test it hard. It works in
   the church's timezone (`church.timezone`), so "Tuesday 18:00" means 18:00
   in Arusha whatever the server's clock says.
4. A job every minute finds due beats (`is_active`, `next_run_at <= now()`)
   and, for each, creates a message **through the same code as a manual send**
   (7.7) — cap, opt-outs and grants included, because a beat set up in March
   must not become a way around a rule made in June. Then it stores the next
   `next_run_at`.
5. **Quiet hours.** No beat sends between 21:00 and 07:00 (the setting from
   7.7). A run that falls inside waits until morning, and the log says so.
6. Pausing is one field, and is audited. Deleting a beat keeps the messages it
   sent: the history is what the church actually said.

**Check.** Unit tests for `nextRun`: a normal week; across the end of a month;
Sunday-only; a beat that ends mid-week; a time inside quiet hours. An e2e test:
a due beat produces a message using one of its templates, and its `next_run_at`
moves into the future.

**Commit.** "Say something every Tuesday without sounding like an alarm".

---

## 7.9 — Replies and delivery reports

**Goal.** Someone who texts back STOP is left alone for good, without anyone
having to notice.

**Do.**

1. Two public routes, for Beem to call:
   `POST /v1/public/comms/inbound` (replies) and
   `POST /v1/public/comms/delivery` (delivery reports). Mark them `@Public()`,
   rate-limit them with `@Throttle`, and refuse (401) unless the request
   carries `BEEM_INBOUND_SECRET`. Both **store what they received in
   `comms_inbound` before doing anything else**, so a shape we did not expect
   can be read later instead of lost.
2. **A reply** whose text, trimmed and lower-cased, is one of `stop`, `acha`,
   `simama`, `unsubscribe`, `toka`: add the number to `comms_blocked_numbers`,
   set `sms_opt_out` on the matching person or user, and send nothing back.
   Any other reply is kept and shown in **Comms → Overview → Replies**: a
   person answering a reminder deserves to be read.
3. **A delivery report** moves the recipient to `DELIVERED` or `FAILED`. A
   permanent failure (invalid or barred number) also blocks the number, with
   Beem's reason. A temporary one is retried.
4. **Every message carries the way out**, added by the renderer when the body
   does not already contain it: ` Jibu ACHA kuacha.` (sw), ` Reply STOP to
   stop.` (en), ` Répondez STOP pour arrêter.` (fr). It is counted into the
   segments, so the cost shown is honest. It cannot be switched off (D22).
5. Tell Beem the two URLs (in their dashboard), with the secret. Write where in
   `docs/deployment.md`.

**Check.** An e2e test: a STOP reply blocks the number and sets the flag, and
the next send skips them as `SKIPPED_OPT_OUT`; a delivery report marks a row
`DELIVERED`; a wrong secret gets 401 and writes nothing; every rendered body
contains the opt-out sentence exactly once.

**Commit.** "Honour a STOP, for good"; "Keep the delivery reports and what they
mean".

---

## 7.10 — What it costs, and what is left

**Goal.** Nobody is surprised by the bill, and credit running low is seen
before a Sunday.

**Do.**

1. Add to `packages/shared/src/usage-metrics.ts` (a test fails if the code
   counts a metric this list doesn't name):
   `sms.queued`, `sms.sent`, `sms.delivered`, `sms.failed`,
   `sms.skipped_opt_out`, `sms.segments` (counters), `sms.cost` (counter, TZS),
   `sms.balance` (gauge), `comms.templates.pending` and
   `comms.schedules.active` (gauges, measured by the nightly snapshot).
2. A job reads Beem's balance every hour into `sms.balance`.
3. **Dev console:** nothing new to build for the charts — **Dev → Usage →
   Every number** draws any metric in the catalogue. Add two figures to
   **Dev → Health**: the SMS queue (pending, failed) and the credit left.
4. **Comms → Overview** shows this month's messages, segments and cost by
   department, so a department can be shown what it spends.

**Check.** After an e2e send, `usage_daily` has `sms.queued` and `sms.cost`
for today; in the browser, **Dev → Usage → Every number** can chart
"Messages sent".

**Commit.** "Count what messaging costs, per department".

---

## 7.11 — The pages

**Goal.** Two front doors onto the same machinery: the Comms portal, and a
Messages section inside each department.

**Do.** Pages go in `apps/portal/src/app/(app)/comms/…`. Follow
`docs/adding-a-module.md` §4: forms open in the right-hand `Drawer`, yes-or-no
questions in the centred `Dialog`, required fields show the red star, every
button that changes something is inside `<Can permission="…">`, and filters
live in the address bar.

| Page | What is on it |
| --- | --- |
| Overview | This month: sent, delivered, failed and cost, by department; credit left; templates waiting for approval; recent replies. |
| Compose | Audience → template (or free text) → a preview in each language → the count, the skips, the segments and the cost → **Send** (a `Dialog`, because it spends money) or schedule. |
| History | Every message, newest first, filterable by department, audience and status. Opening one shows its recipients and their delivery status; numbers are masked unless the reader holds `membership.people.read_sensitive`. |
| Templates | Draft, pending, active and retired, with versions; approve and reject with a note. |
| Recurring | The beats: when each next runs and what it last said. Pause, resume, edit. |
| Audiences | Who each audience means today (the count, and the list for those allowed), and which departments hold it. Grant and revoke. |
| Settings | Beem account (key and secret as masked fields that are never sent back to the browser in full, sender name, **Test connection**), price per segment, daily cap, quiet hours, default language, and who may send for each department. |

**A department's Messages section** (`/membership/messages` now;
`/outreach/messages` and `/finance/messages` in their phases) is the same
Compose, History and Templates components with the department fixed. Put the
shared components in `apps/portal/src/modules/comms/` so each section is a
thin page that passes its `moduleKey`.

Also: the person's page in Membership gains an editable **Language** field and
a **No messages** switch; the Account page gains **Text me reminders** for
staff.

**Check.** From a fresh database (`npm run db:reset && npm run db:seed`),
walk it in a browser as the Communications lead (everything), as a department
leader (their section only), and as a department member (no Compose at all).
Send one message end to end and watch it appear in History as sent (the log
provider "sends" it).

**Commit.** One per group: "The Comms portal: what was sent and what it cost";
"Compose a message and see what it will do before sending"; "Templates, their
versions and their approval"; "Recurring messages"; "Audiences and who may use
them"; "Comms settings, with the Beem key kept masked"; "A department's own
Messages section".

---

## 7.12 — Prove it

**Goal.** Tests that fail the moment one of this phase's rules is broken.

**What you get for free.** Two tests from Phase 6 already cover every new
route without you writing anything: the **permission matrix**
(`apps/api/test/permission-matrix.e2e-spec.ts`) checks every route refuses
someone without its permission; the **impersonation sweep**
(`impersonation.e2e-spec.ts`) opens every GET route while viewing as someone,
on the read-only connection. Run them; if they fail, a route is wrong.

**Do**, in `apps/api/test/comms.e2e-spec.ts` and `e2e/comms.spec.ts`:

1. **Viewing as someone cannot send.** A developer viewing as the
   Communications lead presses Send and gets `IMPERSONATION_READ_ONLY`. Write
   this one first: it is the case that would cost real money.
2. **The department wall.** A Membership sender cannot send to an audience
   only Comms holds, cannot read another department's history, and cannot use
   a template approved for another department.
3. **The opt-out holds everywhere:** a manual send, a beat, and a preview all
   skip a blocked number.
4. **Browser journey (Playwright).** The Membership sender opens their
   Messages section, picks the welcome template, sees "to 3 people · 1 segment
   · about 90 TZS", sends, and sees three sent rows. Then a STOP reply is
   posted to the inbound route, and the next preview says "2 people, 1 left
   alone".

**Check.** `npm test`, `npm run test:e2e -w @irca/api` and `npm run e2e` all
pass. Then, once for each of tests 1–3, remove the guard it tests, watch the
test fail, and put the guard back. A test you have never seen fail proves
nothing.

**Commit.** "Prove the Communication system's walls".

---

## 7.13 — Phase check

- [ ] Communications can be turned on in Admin → Portals, with three roles.
- [ ] A template goes Draft → Pending → Active, and its author cannot approve it.
- [ ] A department sender sends to its own team without asking anyone.
- [ ] That sender cannot reach anyone outside the audiences granted to them.
- [ ] One delegate can be named, a second cannot, and Admin can revoke both.
- [ ] Every message carries the way to stop, and a STOP is honoured for good.
- [ ] Each person is written to in their own language (`people.lang`).
- [ ] The daily cap refuses an over-budget send and names the figure.
- [ ] A beat sends on its rhythm, from its variants, never in quiet hours.
- [ ] The Beem key is never shown in full and never sent back to the browser.
- [ ] Dev → Usage charts messages sent and their cost; Dev → Health shows the credit left.
- [ ] `appendix-database.md`, `data-inventory.md` (phone numbers now leave through Beem; opt-outs are kept), `what-works-now.md` and the metric list are updated in the same pull request.
- [ ] Someone other than the builder has walked it in a browser from a fresh database.

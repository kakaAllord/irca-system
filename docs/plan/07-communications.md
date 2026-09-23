# Phase 7 — The Communication system (SMS through Beem)

**Goal of the phase.** One place that owns messaging — the provider, the
history, the templates, the audiences, the cost — and department sections that
use it every week without asking anyone's permission each time.

The principle, in the owner's words (22 Sept 2026):

> Centralize control, standards, data, and infrastructure — decentralize
> routine communication.

So: Communications and Admin control **who may send, to whom, and in what
words**. A department, once it has been given those things, sends its own
reminders on a Friday afternoon without a queue forming behind an approver.
Approval happens when a **template** is written or changed, not when it is
used.

Read `00-decisions.md` D21, D22 and D25 before starting. Phase 7 comes before
Phase 8 (Outreach) because Outreach's Friday-training reminders are the first
department use of this machinery, and a throwaway send path would be written
twice.

---

## 7.0 — What is central and what is the department's

| Central (Comms + Admin own it) | The department's (its own section) |
| --- | --- |
| The Beem account, sender id and credit | Writing and sending its routine messages |
| Delivery status, history and the audit trail | Its own history and delivery status |
| Which audiences exist, and which a department may use | Choosing among the audiences it was given |
| Approving a template and every later version of it | Drafting a template and asking for it |
| Who may send for a department (leader + one delegate) | The leader naming that one delegate |
| Church-wide and cross-department sending | — |
| The per-church daily cap and the cost rate | Seeing what its own sending cost |

**Never.** A department cannot send to an audience it was not granted, cannot
send free text that no approved template covers **unless** it holds the
department's `*.comms.send_adhoc` permission (off by default, see 7.7), and
cannot see another department's history.

---

## 7.1 — The brief

**Goal.** The department notes in one place, so the module is not built from
guesses.

**Do.** `docs/modules/comms-brief.md` is already written from the owner's
notes of 17 and 22 September. Read it. Confirm three things with the
Communications team before writing code, and correct the brief in the same
commit as the answer:

1. Who is the Communications lead, and who is their one delegate?
2. What do they send today, and in which languages? (Every message in the
   system is per language — see 7.6 — and the church's default language
   decides what someone with no recorded language gets.)
3. What is their monthly SMS budget, in TZS? That becomes the daily cap in
   7.7, which is the thing that stops a mistake emptying the account.

**Check.** The brief has no "TBC" left in its first three sections.

**Commit.** "Write down what Communications actually sends".

---

## 7.2 — The module, its permissions and its roles

**Goal.** `comms` exists as a module, and every department that will send
gains one permission of its own.

**Do.**

1. `packages/shared/src/modules/comms.ts`:

   ```ts
   // sketch
   export const commsModule = defineModule({
     key: 'comms',
     name: 'Communications',
     description: 'Messages the church sends, and the standards they follow.',
     kind: 'department',
     home: '/comms',
     permissions: {
       'comms.messages.read':        { kind: 'read',  label: 'See every message the church sent' },
       'comms.messages.send':        { kind: 'write', label: 'Send church-wide and cross-department messages' },
       'comms.messages.cancel':      { kind: 'write', label: 'Stop a scheduled or sending message' },
       'comms.templates.read':       { kind: 'read',  label: 'See message templates' },
       'comms.templates.draft':      { kind: 'write', label: 'Write and change templates' },
       'comms.templates.approve':    { kind: 'write', label: 'Approve a template for use',
                                       hint: 'Nobody approves their own.' },
       'comms.audiences.read':       { kind: 'read',  label: 'See who the audiences are' },
       'comms.audiences.manage':     { kind: 'write', label: 'Make audiences and give them to departments' },
       'comms.senders.manage':       { kind: 'write', label: 'Say who may send for a department' },
       'comms.schedules.read':       { kind: 'read',  label: 'See recurring messages' },
       'comms.schedules.manage':     { kind: 'write', label: 'Set up recurring messages' },
       'comms.costs.read':           { kind: 'read',  label: 'See what messages cost and the credit left' },
       'comms.settings.manage':      { kind: 'write', label: 'Set the sender id, the daily cap and the rate' },
     },
     systemRoles: [
       { key: 'comms.lead',   name: 'Communications lead',   permissions: [/* all of the above */] },
       { key: 'comms.sender', name: 'Communications sender', permissions: ['comms.messages.read', 'comms.messages.send',
                                                                          'comms.templates.read', 'comms.audiences.read',
                                                                          'comms.schedules.read', 'comms.costs.read'] },
       { key: 'comms.viewer', name: 'Communications viewer', permissions: ['comms.messages.read', 'comms.templates.read',
                                                                          'comms.audiences.read', 'comms.schedules.read'] },
     ],
     nav: [
       { label: 'Overview',  href: '/comms',           icon: 'overview',  permission: 'comms.messages.read' },
       { label: 'Compose',   href: '/comms/compose',   icon: 'messages',  permission: 'comms.messages.send' },
       { label: 'History',   href: '/comms/history',   icon: 'activity',  permission: 'comms.messages.read' },
       { label: 'Templates', href: '/comms/templates', icon: 'templates', permission: 'comms.templates.read' },
       { label: 'Recurring', href: '/comms/schedules', icon: 'schedule',  permission: 'comms.schedules.read' },
       { label: 'Audiences', href: '/comms/audiences', icon: 'people',    permission: 'comms.audiences.read' },
       { label: 'Settings',  href: '/comms/settings',  icon: 'portals',   permission: 'comms.settings.manage' },
     ],
   });
   ```

2. Add `messages`, `templates` and `schedule` to the `NavIcon` union in
   `packages/shared/src/rbac/define.ts` and draw them in
   `apps/portal/src/components/shell/NavIcon.tsx`, in the same weight as the
   rest (an envelope, a page with a star, a clock).

3. **Every department that sends gets its own send permission**, because a
   permission must start with its module's key and a role bundles permissions
   from one module only. Add to each department module as it arrives:

   | Module | Permission | Meaning |
   | --- | --- | --- |
   | `outreach` | `outreach.comms.send` | may send this department's approved templates to its granted audiences |
   | `outreach` | `outreach.comms.send_adhoc` | may send words no template covers (off by default) |
   | `finance` | `finance.comms.send` | same, for pledge and giving reminders (Phase 9) |
   | `membership` | `membership.comms.send` | same, for welcomes and class reminders |

   The department's leader role holds the first; nobody holds the second
   until an administrator grants it.

4. Register `commsModule` in `CHURCH_MODULES`.

**Check.** `npm test` — the module registry tests pass, every permission key
starts with its module key, and the new icons compile. The Portals page in
Admin offers Communications, and the role editor lists its three roles.

**Commit.** "Describe the Communications module"; "Give each department a send
permission of its own".

---

## 7.3 — Tables

**Goal.** The schema for senders, audiences, templates, messages, recipients,
schedules and opt-outs.

**Do.** Add to `apps/api/prisma/schema.prisma`, every table with `church_id`,
every model in `TENANT_MODELS`/`TENANT_PLANE_MODELS` and every table name in
`TENANT_TABLES`/`TENANT_PLANE_TABLES`.

```prisma
// sketch — names and shape, not the finished file

/// Who may send for a department: its leader, and at most one delegate.
model CommsSender {
  id          String   @id @default(uuid(7)) @db.Uuid
  churchId    String   @map("church_id") @db.Uuid
  /// 'comms' for the central team, or the department's module key.
  moduleKey   String   @map("module_key") @db.VarChar(30)
  userId      String   @map("user_id") @db.Uuid
  kind        SenderKind            // LEADER | DELEGATE
  grantedById String   @map("granted_by_id") @db.Uuid
  grantedAt   DateTime @default(now()) @map("granted_at") @db.Timestamptz(6)
  revokedAt   DateTime? @map("revoked_at") @db.Timestamptz(6)

  @@unique([churchId, moduleKey, userId])
  @@map("comms_senders")
}

/// A group of recipients, resolved when a message is sent, never stored as a copy.
model CommsAudience {
  id          String   @id @default(uuid(7)) @db.Uuid
  churchId    String   @map("church_id") @db.Uuid
  /// The department that owns it, or null for a church-wide audience.
  moduleKey   String?  @map("module_key") @db.VarChar(30)
  key         String   @db.VarChar(60)   // 'outreach.team', 'church.members'
  name        String   @db.VarChar(80)   // 'Outreach team'
  kind        AudienceKind                // PROVIDED | LIST
  /// For PROVIDED: which provider and its parameters. For LIST: nothing.
  definition  Json     @default("{}")
  isActive    Boolean  @default(true) @map("is_active")

  @@unique([churchId, key])
  @@map("comms_audiences")
}

/// A department may use an audience only once it has been given it.
model CommsAudienceGrant {
  churchId    String   @map("church_id") @db.Uuid
  audienceId  String   @map("audience_id") @db.Uuid
  moduleKey   String   @map("module_key") @db.VarChar(30)
  grantedById String   @map("granted_by_id") @db.Uuid
  grantedAt   DateTime @default(now()) @map("granted_at") @db.Timestamptz(6)

  @@id([audienceId, moduleKey])
  @@map("comms_audience_grants")
}

/// People named by hand, for a LIST audience.
model CommsAudienceMember {
  churchId   String @map("church_id") @db.Uuid
  audienceId String @map("audience_id") @db.Uuid
  /// One of the two is set. No relation to people or users: see multi-tenancy.md §13.
  personId   String? @map("person_id") @db.Uuid
  userId     String? @map("user_id") @db.Uuid

  @@id([audienceId, personId, userId])
  @@map("comms_audience_members")
}

/// The words, approved once and used many times. Editing makes a new version.
model CommsTemplate {
  id           String   @id @default(uuid(7)) @db.Uuid
  churchId     String   @map("church_id") @db.Uuid
  moduleKey    String?  @map("module_key") @db.VarChar(30)
  key          String   @db.VarChar(60)    // 'outreach.training.reminder'
  name         String   @db.VarChar(80)
  version      Int      @default(1)
  status       TemplateStatus @default(DRAFT) // DRAFT | PENDING | ACTIVE | REJECTED | RETIRED
  /// The fields the bodies use, worked out from them: ['first_name','date'].
  fields       String[] @default([])
  supersedesId String?  @map("supersedes_id") @db.Uuid
  createdById  String   @map("created_by_id") @db.Uuid
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  submittedAt  DateTime? @map("submitted_at") @db.Timestamptz(6)
  decidedById  String?  @map("decided_by_id") @db.Uuid
  decidedAt    DateTime? @map("decided_at") @db.Timestamptz(6)
  decisionNote String?  @map("decision_note") @db.VarChar(500)

  bodies CommsTemplateBody[]

  @@unique([churchId, key, version])
  @@map("comms_templates")
}

/// One template, one body per language. Approval covers all of them at once.
model CommsTemplateBody {
  churchId   String @map("church_id") @db.Uuid
  templateId String @map("template_id") @db.Uuid
  lang       String @db.VarChar(2)     // 'en' | 'sw' | 'fr'
  body       String @db.VarChar(918)   // six SMS segments, GSM-7

  @@id([templateId, lang])
  @@map("comms_template_bodies")
}

/// One send: now, at a time, or by a schedule.
model CommsMessage {
  id            String   @id @default(uuid(7)) @db.Uuid
  churchId      String   @map("church_id") @db.Uuid
  moduleKey     String   @map("module_key") @db.VarChar(30)
  audienceId    String   @map("audience_id") @db.Uuid
  templateId    String?  @map("template_id") @db.Uuid
  scheduleId    String?  @map("schedule_id") @db.Uuid
  /// What was actually sent, per language, after the template was chosen.
  bodies        Json
  status        MessageStatus @default(DRAFT) // DRAFT | SCHEDULED | SENDING | SENT | PARTIAL | FAILED | CANCELLED
  scheduledFor  DateTime? @map("scheduled_for") @db.Timestamptz(6)
  recipientCount Int     @default(0) @map("recipient_count")
  skippedCount   Int     @default(0) @map("skipped_count")
  failedCount    Int     @default(0) @map("failed_count")
  segments       Int     @default(0)
  /// Segments × the church's rate at the time of sending, in minor units.
  costMinor      Decimal @default(0) @map("cost_minor") @db.Decimal(14, 2)
  createdById    String  @map("created_by_id") @db.Uuid
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  startedAt      DateTime? @map("started_at") @db.Timestamptz(6)
  finishedAt     DateTime? @map("finished_at") @db.Timestamptz(6)

  recipients CommsRecipient[]

  @@index([churchId, createdAt(sort: Desc)])
  @@index([churchId, moduleKey, createdAt(sort: Desc)])
  @@map("comms_messages")
}

/// The outbox: one row per phone, which is also the delivery record.
model CommsRecipient {
  id                String   @id @default(uuid(7)) @db.Uuid
  churchId          String   @map("church_id") @db.Uuid
  messageId         String   @map("message_id") @db.Uuid
  personId          String?  @map("person_id") @db.Uuid
  userId            String?  @map("user_id") @db.Uuid
  phone             String   @db.VarChar(20)   // E.164, as Beem wants it
  lang              String   @db.VarChar(2)
  body              String   @db.VarChar(918)
  segments          Int      @default(1)
  status            RecipientStatus @default(PENDING)
  // PENDING | SENT | DELIVERED | FAILED | SKIPPED_OPT_OUT | SKIPPED_NO_PHONE | SKIPPED_DUPLICATE
  attempts          Int      @default(0)
  nextAttemptAt     DateTime @default(now()) @map("next_attempt_at") @db.Timestamptz(6)
  providerMessageId String?  @map("provider_message_id") @db.VarChar(200)
  lastError         String?  @map("last_error")
  sentAt            DateTime? @map("sent_at") @db.Timestamptz(6)
  deliveredAt       DateTime? @map("delivered_at") @db.Timestamptz(6)

  @@index([status, nextAttemptAt])
  @@index([churchId, phone])
  @@map("comms_recipients")
}

/// A beat: the same message on a rhythm, with variants so it does not read
/// like an alarm clock.
model CommsSchedule {
  id            String   @id @default(uuid(7)) @db.Uuid
  churchId      String   @map("church_id") @db.Uuid
  moduleKey     String   @map("module_key") @db.VarChar(30)
  name          String   @db.VarChar(80)
  audienceId    String   @map("audience_id") @db.Uuid
  /// Two or more approved templates; one is picked at random each time.
  templateIds   String[] @map("template_ids") @db.Uuid
  /// 1 = Monday … 7 = Sunday.
  daysOfWeek    Int[]    @map("days_of_week")
  /// Local to the church, 'HH:MM'.
  timeOfDay     String   @map("time_of_day") @db.VarChar(5)
  /// Sent at a random minute within this many minutes after the time.
  jitterMinutes Int      @default(0) @map("jitter_minutes")
  startsOn      DateTime @map("starts_on") @db.Date
  endsOn        DateTime? @map("ends_on") @db.Date
  isActive      Boolean  @default(true) @map("is_active")
  lastRunAt     DateTime? @map("last_run_at") @db.Timestamptz(6)
  nextRunAt     DateTime? @map("next_run_at") @db.Timestamptz(6)
  createdById   String   @map("created_by_id") @db.Uuid

  @@index([isActive, nextRunAt])
  @@map("comms_schedules")
}

/// A number that asked to be left alone, or that the provider rejected as
/// unreachable. Kept per church, and consulted before every send.
model CommsBlockedNumber {
  churchId  String   @map("church_id") @db.Uuid
  phone     String   @db.VarChar(20)
  reason    String   @db.VarChar(40)   // 'replied STOP', 'invalid', 'by hand'
  personId  String?  @map("person_id") @db.Uuid
  blockedAt DateTime @default(now()) @map("blocked_at") @db.Timestamptz(6)
  note      String?  @db.VarChar(200)

  @@id([churchId, phone])
  @@map("comms_blocked_numbers")
}

/// What came back from the provider: replies and delivery reports, as sent.
model CommsInbound {
  id         String   @id @default(uuid(7)) @db.Uuid
  churchId   String?  @map("church_id") @db.Uuid
  phone      String   @db.VarChar(20)
  body       String   @db.VarChar(1000)
  receivedAt DateTime @default(now()) @map("received_at") @db.Timestamptz(6)
  /// What we did about it: 'opted out', 'ignored'.
  action     String   @db.VarChar(40)
  raw        Json

  @@index([churchId, receivedAt(sort: Desc)])
  @@map("comms_inbound")
}
```

Also, in **Membership's** tables (Phase 5):

- `people.lang varchar(2) not null default 'en'` — the language they answered
  the form in, copied from the registration when one is linked and editable by
  the office afterwards. Every message to that person is written in it. This is
  the owner's instruction of 22 Sept: *"in members remember to capture the
  languages they used in the registration, so we can design messages for them
  specifically"*. Backfill it in the migration from `registrations.lang`.
- `people.sms_opt_out boolean not null default false`, with
  `sms_opt_out_at`, and `sms_opt_out_source varchar(20)`
  (`'reply'`, `'office'`, `'form'`).
- `church_memberships.sms_opt_out boolean not null default false` — staff are
  messaged too, and a staff member may want reminders off in one church
  without affecting another.

**Migration, by hand after `--create-only`:** RLS on every new table exactly
as `docs/adding-a-module.md` section 2 shows, plus:

```sql
-- History is a record: it may be added to, never rewritten.
revoke update, delete, truncate on table comms_messages, comms_recipients,
  comms_inbound from irca_app;
-- A recipient's delivery status does change, and only through core's worker.
grant update (status, attempts, next_attempt_at, provider_message_id,
              last_error, sent_at, delivered_at) on table comms_recipients to irca_core;
-- At most one delegate per department.
create unique index comms_one_delegate on comms_senders (church_id, module_key)
  where kind = 'DELEGATE' and revoked_at is null;
-- A number is blocked once per church.
create index comms_recipients_message on comms_recipients (church_id, message_id);
```

**Check.** `npx prisma migrate dev`; the tenancy tests pass (they fail if a
table is missing from the plane lists or has no policy); `npm run test:e2e -w
@irca/api` still green. In `psql`, as `irca_app`, `update comms_messages set
status = 'SENT'` is refused.

**Commit.** "Tables for the Communication system"; "Record the language a
person answered in, and whether they want messages".

---

## 7.4 — Beem, behind a provider

**Goal.** Sending is one interface with three implementations, so tests never
touch the network and development never spends credit.

**Do.**

1. `apps/api/src/core/sms/sms.types.ts`:

   ```ts
   // sketch
   export const SMS_PROVIDER = Symbol('SMS_PROVIDER');
   export type SmsSend = { to: string; body: string; senderId: string };
   export type SmsResult = { providerMessageId: string | null; accepted: boolean; error?: string };
   export interface SmsProvider {
     send(message: SmsSend): Promise<SmsResult>;
     /** Credit left, in the account's currency, or null when the provider cannot say. */
     balance(): Promise<{ amount: string; currency: string } | null>;
   }
   ```

2. Three providers beside the email ones (`apps/api/src/core/sms/providers/`):
   `beem.provider.ts` (real), `log.provider.ts` (development: writes the
   message to the log), `memory.provider.ts` (tests: keeps an array, as
   `MemoryEmailProvider` does). Chosen by `SMS_PROVIDER` in
   `sms.module.ts` from `NODE_ENV` and whether the credentials are set,
   exactly as email does it.

3. Beem's HTTP details (`POST https://apisms.beem.africa/v1/send`, HTTP Basic
   with the API key and secret, `{ source_addr, schedule_time, encoding,
   message, recipients: [{ recipient_id, dest_addr }] }`; balance at
   `https://apisms.beem.africa/public/v1/vendors/balance`). **Check these
   against Beem's current documentation when you implement it** — they change
   endpoints between versions, and the plan is not the source of truth for
   someone else's API.

4. Configuration (`apps/api/src/config/env.ts`, `.env.example`):

   ```
   BEEM_API_KEY=            # the owner sets these in the host's environment
   BEEM_SECRET_KEY=
   BEEM_SENDER_ID=IRCA      # the approved sender name, per church in settings
   BEEM_INBOUND_SECRET=     # the shared secret on the inbound webhook (7.9)
   ```

   All optional: with none set the log provider is used, so the system runs
   with no Beem account at all. **The owner holds the credentials; nothing in
   the repository ever contains them.**

5. Segment counting (`packages/shared/src/sms.ts`, with unit tests): GSM-7
   when every character is in the GSM alphabet — 160 per segment, 153 when
   there are several — otherwise UCS-2, 70 and 67. Swahili is GSM-7; a curly
   apostrophe pasted from Word is not, and quietly halves the capacity. The
   composer shows the count and warns at the boundary.

**Check.** A unit test proves the segment maths on: a 160-character English
message (1), 161 (2), a 70-character message with one emoji (1), 71 (2). With
no credentials set, the API boots and `comms.messages.send` writes to the log.

**Commit.** "Send SMS through Beem, or to the log"; "Count SMS segments the
way the carriers do".

---

## 7.5 — Audiences, without Comms knowing any department

**Goal.** "Everyone in the Outreach team" resolves to phone numbers without
the Comms module importing Outreach.

**Do.** The same registry pattern as change requests (Phase 4, step 4.6a):

```ts
// sketch — apps/api/src/core/comms/audience.registry.ts
export interface AudienceProvider {
  readonly moduleKey: string;
  /** 'outreach.team', 'outreach.reached', 'finance.pledge_outstanding'. */
  readonly key: string;
  readonly name: string;
  /** Who is in it, right now, in this church. */
  resolve(tx: TenantTx, params: Record<string, unknown>): Promise<AudienceMember[]>;
  /** How many, for the composer's "this will go to 143 people". */
  count(tx: TenantTx, params: Record<string, unknown>): Promise<number>;
}
export type AudienceMember = {
  personId?: string;
  userId?: string;
  phone: string;       // as recorded; normalised to E.164 by the sender
  lang?: string;       // theirs, if known
  fields: Record<string, string>;  // first_name, and whatever the module offers
};
```

Each module registers its providers in its own `onModuleInit`, so core never
imports a module. Phase 7 ships these:

| Provider | Belongs to | Who is in it |
| --- | --- | --- |
| `church.staff` | admin | everyone with active access to this church |
| `church.members` | membership | people at stage `CONFIRMED_MEMBER` |
| `church.people` | membership | every person with a phone number |
| `membership.class` | membership | people in a foundation group, optionally one group |
| `list` | comms | the people named by hand in a LIST audience |

Rules the resolver enforces, in one place so no caller can forget:

1. **Never** a number in `comms_blocked_numbers`, and never a person or
   membership with `sms_opt_out`. Skipped rows are still written, with
   `SKIPPED_OPT_OUT`, so the sender can see that 12 of 143 were left alone.
2. One message per phone number: a person listed twice, or a staff member who
   is also a member, gets `SKIPPED_DUPLICATE` on the second.
3. No phone, or a number that is not a phone number →
   `SKIPPED_NO_PHONE`. Numbers are normalised with `libphonenumber-js`,
   already a dependency, against the church's country.
4. A department may only name an audience it holds a grant for
   (`comms_audience_grants`), or its own team audience, which is granted when
   the module is enabled. **Its contacts audience is not granted by default**
   — D22, the owner's decision of 22 Sept: people reached on a doorstep are
   not staff, and texting them is a decision an administrator makes on
   purpose.

**Check.** A unit test per provider against a seeded church. An e2e test:
Outreach's leader may send to `outreach.team`, gets 403 for
`outreach.reached` until an administrator grants it, and 403 for
`church.members` however hard they try. Another church's audience id is 404.

**Commit.** "Resolve an audience without Comms knowing any department"; "Never
message someone who asked us not to".

---

## 7.6 — Templates: written by the department, approved once

**Goal.** The words are agreed before they are used, and using them needs
nobody.

**Do.**

1. The workflow is `DRAFT → PENDING → ACTIVE`, with `REJECTED` and `RETIRED`
   as ends. Editing an `ACTIVE` template does not change it: it creates
   version *n+1* in `DRAFT`, pointing at its predecessor with `supersedesId`.
   The old version stays `ACTIVE` until the new one is approved, so a
   department is never left without words mid-week.
2. A body per language. One approval covers all three, because a template
   approved in English and quietly different in Swahili is exactly the problem
   this step exists to prevent. A language a church does not use is left
   empty; the sender falls back to the church's default language.
3. Fields are `{{snake_case}}`, worked out from the bodies and stored on the
   template. The sender refuses a field no audience provider offers, at draft
   time, naming it — not at send time in front of 400 people. The set for
   Phase 7: `first_name`, `full_name`, `church_name`, `event_name`, `date`,
   `time`, `venue`, `amount`, `balance`.
4. Approval is `comms.templates.approve`, and **nobody approves their own**:
   the same check as change requests (D17), with the same message. A
   department leader who also holds the approve permission still cannot
   approve their own draft.
5. An approved template that has been used is never deleted, only `RETIRED`:
   the history has to keep meaning.

**Check.** e2e: a draft is refused for sending; approving it makes it usable;
editing it makes a version 2 in `DRAFT` while version 1 stays sendable;
approving version 2 retires version 1; the drafter cannot approve their own;
a template with `{{nickname}}` is refused with the field named.

**Commit.** "Approve the words once, then let the department use them";
"A template is a version, not a rewrite".

---

## 7.7 — Sending

**Goal.** A send that cannot quietly cost more than the church meant, go to
the wrong people, or be started by the wrong person.

**Do.**

`POST /v1/comms/messages` with `{ moduleKey, audienceId, templateId, fields?,
scheduledFor? }`, or `{ bodies }` for an ad-hoc send. In one transaction:

1. **May this person send at all?** They hold `comms.messages.send` (central,
   any audience) or `<module>.comms.send`, **and** they have a live
   `comms_senders` row for that module. The permission says what kind of
   sending they may do; the row says they are the one doing it. That is how
   "only the leader, or the one person they delegate to" is enforced without
   inventing a second role system.
2. **May they use this audience?** 7.5, rule 4.
3. **Are these words allowed?** An `ACTIVE` template belonging to that
   department or to Comms. Free text needs `<module>.comms.send_adhoc`, which
   nobody holds by default; Comms itself holds it, because someone has to be
   able to write "the water is off, no service today" at eight on a Sunday.
4. **What will it cost?** Resolve the audience, render per recipient, count
   segments, multiply by the church's rate. If the total would take the
   church past its **daily cap** (`comms.daily_cap_minor` in church settings),
   refuse with the number it would have been. The cap is the thing that turns
   a mistake into an error message instead of an empty account.
5. Write the message and one `comms_recipients` row per number, `PENDING`,
   inside the same transaction. Nothing is sent yet: same discipline as the
   email outbox, so a crash halfway leaves either everything owed or nothing.
6. `usage.inc('sms.queued', n)`, `audit.recordIn(tx, …)` naming the audience,
   the template and the count — never the recipients.

The worker, in `ScheduledJobs` beside the email one, every 15 seconds:
claims at most **20 per church per round** so one church's bulk send does not
starve another's invitation, sends through the provider, and retries with the
email service's backoff. `SENT` when the provider accepts,
`DELIVERED` when a report says so (7.9), `FAILED` after six tries with the
provider's words kept.

**The composer must show, before the button does anything:** how many
recipients, how many are being skipped and why, how many segments each
message is, and the total cost in TZS. Then the button says
"Send to 143 people · about 4,290 TZS". Anything less and nobody can be
blamed for the bill.

**Check.** e2e: a delegate can send; a second delegate cannot be added; a
member of the department without the row gets 403; the daily cap refuses and
says the figure; the opted-out are skipped and counted; the memory provider
received exactly the expected bodies, in each recipient's language; the audit
line names no phone number.

**Commit.** "Send a message, or refuse to for a reason you can read";
"Deliver the queue in the background, one church at a time".

---

## 7.8 — Beats: the same message on a rhythm

**Goal.** "Every Tuesday at six, one of these three reminders, to the class"
— set once, and not sounding like a machine.

**Do.**

1. `comms_schedules` as in 7.3. A schedule names **two or more** approved
   templates; each run picks one at random. That is the owner's point of 22
   Sept: *"they can even put multiple and the system can randomly pick to have
   that sense of not like alarm"*. One template is allowed, with a hint in the
   UI saying that two read more like a person.
2. `jitterMinutes` sends at a random minute within the window after the time,
   for the same reason.
3. A job every minute computes due schedules (`is_active`, `next_run_at <=
   now()`), and for each one creates an ordinary `comms_messages` row through
   the same code path as a manual send — including the cap, the opt-outs and
   the audience grant, because a schedule set up in March must not become a
   way around a rule made in June. `next_run_at` is then recomputed in the
   church's own time zone, which is what makes "Tuesday at 18:00" mean
   Tuesday at 18:00 in Arusha through any change of server.
4. **Quiet hours.** A church setting (`comms.quiet_hours`, default 21:00–07:00)
   that no schedule may send inside. A run that falls in it waits for the
   morning rather than being dropped, and says so in the log.
5. Pausing a schedule is one field and is audited. Deleting one keeps its
   messages: the history is the record of what the church actually said.

**Check.** A unit test on the "when does it next run" function: across a
month, a change of month, a Sunday-only schedule, a schedule ending mid-week,
and a time inside quiet hours. An e2e test that a due schedule produces a
message with one of its variants and then has a `next_run_at` in the future.

**Commit.** "Say something every Tuesday without sounding like an alarm".

---

## 7.9 — Replies and delivery reports

**Goal.** Someone who texts back STOP is left alone, permanently, without
anyone having to notice.

**Do.**

1. Two public routes, guarded by a shared secret in the path or a header
   (`BEEM_INBOUND_SECRET`), rate-limited, and never returning anything about a
   church: `POST /v1/public/comms/inbound` and
   `POST /v1/public/comms/delivery`. Both write what they were given into
   `comms_inbound` before interpreting it, so a shape we did not expect can be
   read later instead of being lost.
2. A reply whose text, trimmed and folded to lower case, is one of
   `stop`, `acha`, `simama`, `unsubscribe`, `toka` → block that number for the
   church it was last messaged by, set `sms_opt_out` on the matching person or
   membership, and reply nothing. Anything else is kept and shown in the
   Comms inbox, because a person answering a reminder deserves to be read by
   somebody.
3. A delivery report moves the recipient to `DELIVERED` or `FAILED` and, for
   a permanent failure (invalid number, blacklisted), blocks the number with
   the provider's reason. A soft failure is retried.
4. Every message **must** carry a way out. The renderer appends
   ` Jibu ACHA kuacha.` (Swahili), ` Reply STOP to stop.` (English) or
   ` Répondez STOP pour arrêter.` (French) when the body does not already
   contain it, counted into the segments so the cost is honest. It cannot be
   turned off — D22.

**Check.** e2e: posting a STOP reply blocks the number and sets the flag; the
next send to that audience skips them with `SKIPPED_OPT_OUT`; a delivery
report marks the row delivered; a wrong secret is 401 and writes nothing; the
opt-out sentence is present in every rendered body exactly once.

**Commit.** "Honour a STOP, for good"; "Keep the delivery reports and what
they mean".

---

## 7.10 — What it costs, and what is left

**Goal.** Nobody is surprised by the bill, and the credit running out is
noticed before a Sunday.

**Do.**

1. Metrics, added to `packages/shared/src/usage-metrics.ts` (the catalogue
   test fails otherwise), all per church per day:
   `sms.queued`, `sms.sent`, `sms.delivered`, `sms.failed`,
   `sms.skipped_opt_out`, `sms.segments`, `sms.cost_minor` (counters),
   `sms.balance_minor` (gauge, platform), `comms.templates.pending` (gauge),
   `comms.schedules.active` (gauge).
2. A job reads Beem's balance every hour into `sms.balance_minor`, and the
   monitoring of 10 step 10.4 alerts below a configured floor.
3. The dev console's church page gains the SMS figures beside the rest; its
   Health page shows the balance and the queue depth. No new pages: the
   catalogue drives the usage tab already.
4. The church's own numbers live in Comms → Overview: this month's messages,
   segments and cost, by department, so a department can be shown what it
   spends without Finance having to ask.

**Check.** After an e2e send, `usage_daily` holds the counters and the cost;
the dev console's usage tab charts them by name.

**Commit.** "Count what messaging costs, per church and per department".

---

## 7.11 — The pages

**Goal.** Two front doors onto the same machinery: a Comms portal, and a
section inside each department.

**Do.**

**Comms portal** (`apps/portal/src/app/(app)/comms/…`):

| Page | What is on it |
| --- | --- |
| Overview | This month: sent, delivered, failed, cost, by department. Credit left. Templates waiting for approval. |
| Compose | Audience → template (or free text) → the preview per language → the count, the skips, the cost → send or schedule. |
| History | Every message, newest first, filterable by department, audience and status. One message opens its recipients with their delivery status, and their numbers masked unless the reader holds `membership.people.read_sensitive`. |
| Templates | Draft, pending, active and retired, with versions. Approve and reject, with a note. |
| Recurring | The beats, when each next runs, and what it last said. Pause, resume, edit. |
| Audiences | Who each audience resolves to today, and which departments hold it. Grant and revoke. |
| Settings | Sender id, the rate per segment, the daily cap, quiet hours, and who may send for each department. |

**A department's section** (`/outreach/messages`, `/finance/messages`, …) is
the same three pages with `moduleKey` fixed: Compose (its audiences, its
templates), History (its own only), Templates (its own drafts and the ones
Comms approved for it). It is deliberately the same components: a department
should not have to learn a second messaging screen.

Conventions are the ones in `docs/adding-a-module.md` §4 — forms in the
right-hand `Drawer`, confirmations in the centred `Dialog`, required fields
with the red star, `SubmitButton missing={[…]}` so a greyed-out button says
what it is waiting for, filters in the URL. Sending is a `Dialog`, because it
is the one action that spends money and cannot be undone.

**Check.** Walk it in a browser from a fresh seed as the Comms lead, as the
Outreach leader, and as an Outreach member: the third sees no Compose page at
all.

**Commit.** One per page group: "The Comms portal: what was sent and what it
cost"; "Compose a message and see what it will do before you send it";
"Templates, their versions and their approval"; "Recurring messages";
"Audiences and who may use them"; "A department's own messages section".

---

## 7.12 — Prove it

**Goal.** The same four proofs every module carries, plus the ones peculiar to
spending money on someone else's behalf.

**Do.**

1. **Permission matrix** — every system role against every route, from a table
   in the test file; a route with no row fails the test.
2. **Cross-church** — another church's audience, template, message, recipient
   and schedule are all 404, by id, including through the department sections.
3. **Impersonation** — every write route answers `IMPERSONATION_READ_ONLY`.
   A dev viewing as the Comms lead **cannot send a message**: this is the case
   to write first, because it is the one that would cost real money.
4. **The department wall** — Outreach's leader cannot send to
   `church.members`, cannot read Finance's history, and cannot use a template
   Comms approved for Membership.
5. **Journey (Playwright)** — the Outreach leader opens their section, picks
   the training reminder template, sees "to 9 people · 1 segment · about 270
   TZS", sends, and sees nine delivered rows; then a STOP reply arrives and
   the next send shows eight and one skipped.

**Check.** `npm test`, `npm run test:e2e -w @irca/api`, `npm run e2e` all
green, and the new tests fail when the guard they test is removed — try it
once for each of the four.

**Commit.** "Prove the Communication system's permissions and walls".

---

## 7.13 — Phase check

- [ ] Communications can be turned on for a church in Admin → Portals.
- [ ] A template goes Draft → Pending → Active, and its editor cannot approve it.
- [ ] A department leader sends to their team without asking anyone.
- [ ] That leader cannot reach anybody outside their granted audiences.
- [ ] A delegate can be named, a second cannot, and Admin can revoke both.
- [ ] Every message carries the way to stop, and a STOP is honoured for good.
- [ ] Messages are written in each person's own language (`people.lang`).
- [ ] The daily cap refuses an over-budget send and names the figure.
- [ ] A beat sends on its rhythm, from its variants, never in quiet hours.
- [ ] The dev console shows `sms.sent`, `sms.cost_minor` and the credit left.
- [ ] `docs/plan/appendix-database.md`, `docs/what-works-now.md` and step 6.1's
      metric list are updated in the same pull request.

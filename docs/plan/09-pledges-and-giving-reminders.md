# Phase 9 — Pledges, and reminding people about them

> **In one sentence:** Finance records what a person promised towards a
> campaign, what they have paid and what is left, and reminds them — kindly,
> in their own language, at most once a fortnight — through the Communication
> system.

**Status:** not started, and **must not start until step 9.0 is settled** —
three decisions only the church's leadership can make. **Comes after:**
Phase 7 (which sends the reminders) and Phase 8 (whose person timeline this
phase writes to).

The owner asked for this on 22 September 2026:

> finance need the sms thing for reminding people about their pledges

---

## Before you start

**1. What must already be true.**

- Phases 7 and 8 are done: templates, audiences, beats and the
  `person_interactions` timeline all exist.
- Step 9.0 is settled **in writing**. Until then, do not write any code.

**2. Read these first** (about 20 minutes):

| Read | Why |
| --- | --- |
| `docs/data-inventory.md`, section 3 | What the church promised its people about money records. This phase changes that promise. |
| `00-decisions.md`, D17 | Money records are never edited directly — only through an approved change request. Pledge payments follow the same rule. |
| `00-decisions.md`, Q8 and Q10 | Why pledges exist, why per-person tithe tracking still does not, and why a reminder names no figure by default. |
| `apps/api/src/modules/finance/transaction-change.handler.ts` | How a finance record is changed by approval. You will write one like it for payments. |
| Phase 7, steps 7.5, 7.6 and 7.8 | Audiences, templates and beats — the reminder is built from these, not from new code. |

**3. Get your machine ready**, as in every phase:

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

The church raises money for things — a building, a bus. People promise an
amount ("I will give 200,000 towards the building by December") and pay it in
parts. Today that lives on paper. After this phase:

- The finance manager records each **campaign** and each person's **pledge**.
- The clerk records **payments** against a pledge as the money comes in —
  usually the same money they already record as income.
- Anyone allowed sees each campaign's progress; only a few see **who** owes
  **how much**.
- Once a month, everyone who still owes gets a gentle text, in their own
  language, unless they asked not to be texted.

**Why this phase is careful.** Until now the Finance portal has recorded
money *by source*, never *by person*: "Sunday offering, 450,000", not "Neema
gave 20,000". The church's leadership read the data inventory saying exactly
that. Pledges change it, for pledges only. That is a promise to the church's
people being changed, so the leadership decides first (9.0).

## Words used in this phase

| Word | Meaning |
| --- | --- |
| **Campaign** | Something the church is raising for, such as "Ujenzi 2027". Has an optional target. |
| **Pledge** | One person's promise to a campaign: an amount, and optionally how and when they said they would pay. |
| **Payment** | Money received against a pledge. Points at the finance entry that recorded the money, when there is one. |
| **Balance** | What is left: the pledge minus its payments. **Always calculated, never stored.** |
| **Reminder** | A Phase 7 message to the `finance.pledge_outstanding` audience. |

## The steps at a glance

| Step | What | You are done when |
| --- | --- | --- |
| 9.0 | Three decisions by the leadership | They are written down, and the data inventory says what changed. |
| 9.1 | Campaigns, pledges and payments | The tables exist; the balance is always right, even with two payments at once. |
| 9.2 | The pages | The manager, the clerk and a pastor each see exactly what they should. |
| 9.3 | The reminder | People who owe get one text a month at most, in their own language. |
| 9.4 | Phase check | Every box ticked. |

---

## 9.0 — Three decisions by the leadership

**Goal.** The church decides what it is willing to hold and say, before any
code exists.

**Why.** The code takes about a fortnight. The trust of a church member whose
debt was texted to a phone their family reads cannot be won back.

**Do.** Take these three questions to the owner and the church's leadership.
Each has a recommendation; they may accept it or change it.

1. **Will the church hold per-person pledge records?** *Recommended: yes, for
   pledges only* — never per-person tithes or offerings (Q8).
2. **Who may see names against amounts?** *Recommended:* a new permission,
   `finance.pledges.read_sensitive`, held by the finance manager and by the
   pastors through a new "Pledges overseer" role; clerks may record a payment
   without browsing the list of who owes what.
3. **What may a reminder say?** *Recommended (Q10): no figure by default.* The
   default template is *"Salamu {{first_name}}, tunakukumbusha ahadi yako ya
   {{campaign_name}}. Karibu ofisini kwa maelezo."* A template containing
   `{{balance}}` is allowed, but — like every template (7.6) — needs
   Communications' approval, and the leadership should say whether it wants
   one at all.

Then:

- Write the answers, with the date and who gave them, into
  `docs/modules/pledges-brief.md` (new file; copy the headings of
  `comms-brief.md`).
- Rewrite `docs/data-inventory.md` section 3 to say what is now held about a
  person's pledges, who can see it, and — in section 5 — how long it is kept
  (*recommended:* for as long as the campaign runs, plus seven years, like
  other financial records).

**Check.** The brief exists with all three answers; `data-inventory.md`
section 3 no longer says the finance portal "never names a giver" without
qualification.

**Commit.** "Write down what the church agreed about pledges".

**If it goes wrong.** No answer from the leadership? Stop here. Build nothing
in this phase, and say so to the owner.

---

## 9.1 — Campaigns, pledges and payments

**Goal.** Three tables, the permissions to use them, and a balance that is
always right.

**Do.**

1. Add to `apps/api/prisma/schema.prisma`. No `church_id` (D27); `personId`
   is an ordinary relation to `Person` — the same person the rest of the system
   knows (D23).

   ```prisma
   // sketch

   /// Something the church is raising for: 'Ujenzi 2027', 'Bus fund'.
   model PledgeCampaign {
     id           String    @id @default(uuid(7)) @db.Uuid
     name         String    @unique @db.VarChar(80)
     /// What pledges count towards, for the progress bar.
     targetAmount Decimal?  @map("target_amount") @db.Decimal(14, 2)
     startsOn     DateTime  @map("starts_on") @db.Date
     endsOn       DateTime? @map("ends_on") @db.Date
     isActive     Boolean   @default(true) @map("is_active")

     pledges Pledge[]

     @@map("pledge_campaigns")
   }

   /// One person's promise.
   model Pledge {
     id           String       @id @default(uuid(7)) @db.Uuid
     campaignId   String       @map("campaign_id") @db.Uuid
     personId     String       @map("person_id") @db.Uuid
     amount       Decimal      @db.Decimal(14, 2)
     /// How they said they would pay: 'ONE_OFF' | 'MONTHLY' | 'WEEKLY'.
     rhythm       String       @default("ONE_OFF") @db.VarChar(10)
     dueOn        DateTime?    @map("due_on") @db.Date
     note         String       @default("") @db.VarChar(300)
     status       PledgeStatus @default(OPEN)       // OPEN | COMPLETED | CANCELLED
     promisedOn   DateTime     @map("promised_on") @db.Date
     recordedById String       @map("recorded_by_id") @db.Uuid
     createdAt    DateTime     @default(now()) @map("created_at") @db.Timestamptz(6)

     payments PledgePayment[]

     @@index([campaignId, status])
     @@index([personId])
     @@map("pledges")
   }

   /// Money received against a pledge.
   model PledgePayment {
     id            String   @id @default(uuid(7)) @db.Uuid
     pledgeId      String   @map("pledge_id") @db.Uuid
     amount        Decimal  @db.Decimal(14, 2)
     paidOn        DateTime @map("paid_on") @db.Date
     /// The finance entry that recorded this money, when there is one.
     transactionId String?  @map("transaction_id") @db.Uuid
     note          String   @default("") @db.VarChar(200)
     recordedById  String   @map("recorded_by_id") @db.Uuid
     createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

     @@index([pledgeId])
     @@map("pledge_payments")
   }
   ```

2. Create the migration without applying it (`cd apps/api && npx prisma
   migrate dev --create-only --name pledges`) and add:

   ```sql
   alter table pledges add constraint pledges_amount_positive check (amount > 0);
   alter table pledge_payments add constraint pledge_payments_amount_positive check (amount > 0);
   -- Money records are never deleted, and a payment changes only through an
   -- approved change request (D17), applied inside the approver's transaction.
   revoke delete, truncate on table pledges, pledge_payments from irca_app;
   ```

   Then `npx prisma migrate dev`.

3. **The balance is never stored.** It is `pledge.amount - sum(payments)`,
   worked out in SQL every time, like every other total in Finance. A stored
   total goes wrong the first time two clerks record payments at the same
   moment.

4. **Recording a payment** (`POST /v1/finance/pledges/:id/payments`), in one
   `db.tx()`:
   1. lock the pledge row (`select … for update`) so two payments at once are
      handled one after the other;
   2. insert the payment;
   3. if the balance is now zero or less, set the pledge `COMPLETED`;
   4. write a `PLEDGE_PAID` interaction on the person's timeline (add
      `PLEDGE_PROMISED` and `PLEDGE_PAID` to the `InteractionKind` enum in the
      same migration), the audit line, and `usage.inc('finance.pledges.payments')`.

5. **Corrections go through a change request** (D17). A payment is never
   edited; a clerk asks to correct or void it, and an administrator approves.
   Write `apps/api/src/modules/finance/pledge-payment-change.handler.ts`, copying
   `transaction-change.handler.ts`, and register it the same way in
   `onModuleInit`.

6. **Permissions**, added to `packages/shared/src/modules/finance.ts`:

   | Permission | Kind | Held by |
   | --- | --- | --- |
   | `finance.pledges.read` | read | manager, overseer — the campaigns and their progress |
   | `finance.pledges.read_sensitive` | read | manager, overseer — names against amounts |
   | `finance.pledges.manage` | write | manager — campaigns, pledges, cancelling |
   | `finance.pledges.record_payment` | write | clerk, manager |
   | `finance.comms.send` | write | manager — sending reminders (Phase 7) |

   And a new system role, **`finance.pledges_overseer`** — "Pledges overseer",
   holding the first two — for the pastors. (A role holds one module's
   permissions only, so a pastor's Membership role cannot carry these.)

**Check.**

- `npx prisma migrate dev` runs; the generated permission matrix passes with
  the five new permissions.
- An e2e test (`apps/api/test/pledges.e2e-spec.ts`): a clerk records a payment
  but gets 403 on the list of who owes; ten payments recorded in parallel
  (`Promise.all`) leave the balance exactly right and the pledge `COMPLETED`
  exactly when it reaches zero; a payment cannot be deleted by the app role.

**Commit.** "Record what people promised, and what they have paid"; "Correct a
pledge payment only through an approved request".

---

## 9.2 — The pages

**Goal.** Three screens, no more.

**Do.** Under `apps/portal/src/app/(app)/finance/pledges/`, following
`docs/adding-a-module.md` §4:

| Page | What is on it |
| --- | --- |
| Campaigns | Each campaign, its target, what was promised and what came in, as a bar. |
| One campaign | Its pledges with their balances, largest owed first; filters for open, completed, overdue. Names against amounts only for `read_sensitive`; others see counts and totals. |
| One person | Their pledges and payments on their Membership person page, inside the same timeline as everything else (`PLEDGE_PROMISED`, `PLEDGE_PAID`). |

Recording a pledge and recording a payment each open in the right-hand
`Drawer` from the row; cancelling a pledge is a `Dialog`, because it is a yes
or no. When recording a payment, offer to link it to a recent income entry
(the same suggest field the transaction form uses), so the books and the
pledge agree.

Add a **Pledges** item to Finance's `nav` behind `finance.pledges.read`.

**Check.** Walk it in the browser as the manager (everything), a clerk (can
record a payment from a pledge; no list of who owes), a pastor with the
overseer role (reads, cannot change), and someone with only
`finance.transactions.read` (no Pledges in the sidebar at all).

**Commit.** "The pledge pages"; "Show a person's promises on their own page".

---

## 9.3 — The reminder

**Goal.** Finance reminds everyone who still owes, monthly, without asking
anyone each time — and nobody is texted twice in a fortnight.

**Do.** Almost everything here is Phase 7, used — not new machinery.

1. **An audience provider** (7.5), registered by the Finance module:

   | Key | Parameters | Who is in it |
   | --- | --- | --- |
   | `finance.pledge_outstanding` | `campaignId?`, `minBalance?`, `overdueOnly?` | people with an `OPEN` pledge whose balance is above `minBalance`, with a phone, not opted out |

   It fills the blanks `first_name`, `campaign_name`, `amount`, `balance` and
   `due_date`, **already formatted for a text** (`200,000 TZS`, `12 Oktoba`),
   because formatting in a template is how someone gets texted `200000.00`.
   Add the four new blanks to the list in 7.6.

2. **Templates** in all three languages, drafted by Finance and approved by
   Communications (7.6). The default one names no figure (9.0, question 3).

3. **A beat** (7.8): the first Monday of each month at 10:00, two or three
   variants. Set it up in **Finance → Messages → Recurring**; no new screen.

4. **At most once a fortnight per person**, whatever beats exist. Add a setting
   `comms.personCooldownDays` (default `14`) to `modules/comms/settings.ts`,
   and check it in the Phase 7 resolver, for every message: skip anyone who
   was sent a message from the same department within that many days, with a
   new status `SKIPPED_RECENT`. Two campaigns reminding on the same Monday
   would otherwise be two texts in a minute.

5. Every reminder writes a `MESSAGE_SENT` interaction, so the next person to
   call them can see they were texted on Monday. (Do this in the Phase 7
   sender for every message to a person, not only here.)

**Check.** An e2e test: the audience holds only people who owe and have not
opted out; two campaigns reminding the same day produce one message per
person; the cooldown skips the second and counts it; each body carries the
way to stop; when a template uses `{{balance}}`, the figure matches the pledge
exactly.

**Commit.** "Remind people who still owe on a pledge, once a fortnight at
most".

---

## 9.4 — Phase check

- [ ] The leadership's written answers to 9.0 are in `docs/modules/pledges-brief.md`.
- [ ] `docs/data-inventory.md` section 3 is rewritten, and section 5 says how long pledges are kept.
- [ ] Names against amounts need `finance.pledges.read_sensitive`.
- [ ] A payment is never edited or deleted, only corrected through an approved request.
- [ ] The balance is calculated, never stored, and ten payments at once cannot break it.
- [ ] A reminder goes in the person's own language, names a figure only if an approved template does, and carries the way to stop.
- [ ] Nobody is texted twice in a fortnight.
- [ ] `appendix-database.md`, `what-works-now.md` and the metric list are updated.
- [ ] Someone other than the builder has walked it in a browser from a fresh database.

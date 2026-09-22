# Phase 9 — Pledges, and reminding people about them

**Goal of the phase.** Record what someone promised, what they have paid, and
what is left — and let Finance remind them, kindly and in their own language,
through the Communication system.

This is the second Finance iteration, promised in `00-decisions.md` Q8 and
asked for by the owner on 22 September:

> finance need the sms thing for reminding people about their pledges

It comes after Phase 7 (Communications, which sends) and after Phase 8 only
because Outreach was asked for first; it depends on Phase 7, not on Phase 8.

---

## 9.0 — Read this before you write any of it

Phase 4 was deliberately church-level: *income by source and expenses by
item, never a giver's name*. `docs/data-inventory.md` says so today, in
section 3, and the leadership read it as written.

**This phase changes that**, for pledges only. Before the first line of code:

1. The leadership agrees, in writing, that the church will hold per-person
   pledge records. Amend `docs/data-inventory.md` section 3 in the same pull
   request — not afterwards.
2. Decide who may see them. The recommendation is a new sensitive permission
   (`finance.pledges.read_sensitive` for the amounts against names) held by
   the finance manager and the pastors only, with the clerks able to record a
   payment without browsing the list.
3. Decide what a reminder may say. "You promised 200,000 and have paid
   50,000" in a text message that anyone holding the phone can read is a
   pastoral decision, not a technical one. The recommendation is that the
   default template names no figure — *"Salamu {{first_name}}, tunakukumbusha
   ahadi yako ya ujenzi. Karibu ofisini kwa maelezo."* — and that a template
   with `{{balance}}` in it needs the leadership's approval like any other
   (Phase 7 step 7.6 already makes that an approval).

**Until those three are settled, do not start.** The code is a fortnight; the
trust is not recoverable.

---

## 9.1 — What a pledge is

**Goal.** One shape that covers the ways this church actually takes promises.

**Do.**

```prisma
// sketch

/// Something the church is raising for: 'Ujenzi 2027', 'Bus fund'.
model PledgeCampaign {
  id        String   @id @default(uuid(7)) @db.Uuid
  churchId  String   @map("church_id") @db.Uuid
  name      String   @db.VarChar(80)
  /// What every pledge to it counts towards, for the progress bar.
  targetAmount Decimal? @map("target_amount") @db.Decimal(14, 2)
  startsOn  DateTime @map("starts_on") @db.Date
  endsOn    DateTime? @map("ends_on") @db.Date
  isActive  Boolean  @default(true) @map("is_active")

  @@unique([churchId, name])
  @@unique([churchId, id])
  @@map("pledge_campaigns")
}

/// One person's promise. The person is a `people` row: the same person the
/// rest of the system knows (D23).
model Pledge {
  id          String   @id @default(uuid(7)) @db.Uuid
  churchId    String   @map("church_id") @db.Uuid
  campaignId  String   @map("campaign_id") @db.Uuid
  personId    String   @map("person_id") @db.Uuid
  amount      Decimal  @db.Decimal(14, 2)
  /// 'ONE_OFF' | 'MONTHLY' | 'WEEKLY' — how they said they would pay it.
  rhythm      String   @default("ONE_OFF") @db.VarChar(10)
  dueOn       DateTime? @map("due_on") @db.Date
  note        String   @default("") @db.VarChar(300)
  status      PledgeStatus @default(OPEN)  // OPEN | COMPLETED | CANCELLED
  promisedOn  DateTime @map("promised_on") @db.Date
  recordedById String  @map("recorded_by_id") @db.Uuid
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  payments PledgePayment[]

  @@index([churchId, campaignId, status])
  @@index([churchId, personId])
  @@unique([churchId, id])
  @@map("pledges")
}

/// A payment against a pledge. It also points at the finance entry that
/// recorded the money, so the books and the pledge cannot disagree.
model PledgePayment {
  id            String   @id @default(uuid(7)) @db.Uuid
  churchId      String   @map("church_id") @db.Uuid
  pledgeId      String   @map("pledge_id") @db.Uuid
  amount        Decimal  @db.Decimal(14, 2)
  paidOn        DateTime @map("paid_on") @db.Date
  /// The finance_transactions row this money is part of, when there is one.
  transactionId String?  @map("transaction_id") @db.Uuid
  note          String   @default("") @db.VarChar(200)
  recordedById  String   @map("recorded_by_id") @db.Uuid
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  @@index([churchId, pledgeId])
  @@map("pledge_payments")
}
```

**The balance is never stored.** It is `amount - sum(payments)`, computed in
SQL, for the same reason transaction totals are: a stored total is a lie
waiting for a race. A pledge whose balance reaches zero is marked
`COMPLETED` by the same transaction that records the payment.

Permissions, added to the Finance module:

| Permission | Kind | Who |
| --- | --- | --- |
| `finance.pledges.read` | read | manager, pastors — the list and the progress |
| `finance.pledges.read_sensitive` | read | manager, pastors — names against amounts |
| `finance.pledges.manage` | write | manager — record a pledge, cancel one |
| `finance.pledges.record_payment` | write | clerk and manager — record a payment |
| `finance.comms.send` | write | manager — send the reminders (Phase 7) |

Corrections follow D17 exactly as the rest of Finance does: a payment is not
edited, it is a change request an administrator approves. Implement the
handler in the Finance module's own registry entry, beside the transaction
one.

**Check.** Migration with RLS; the permission matrix test covers the five new
permissions; a clerk can record a payment and cannot see the list of who owes
what; `npm run test:e2e -w @irca/api` green.

**Commit.** "Record what people promised, and what they have paid".

---

## 9.2 — The pages

**Goal.** Three screens, no more.

| Page | What is on it |
| --- | --- |
| Campaigns | Each campaign, its target, what has been promised and what has come in, as a bar. |
| One campaign | Its pledges, with balance, sorted by what is owed; filters for open, completed, overdue. Amounts against names only for `read_sensitive`. |
| One person | Their pledges and payments, on their Membership person page, in the same timeline everything else uses (`PLEDGE_PROMISED`, `PLEDGE_PAID` interactions). |

Recording a payment is a `Drawer` opened from the pledge row; recording a
pledge likewise; cancelling is a `Dialog` because it is a yes-or-no question.

**Check.** Walk it as the manager, as a clerk, and as someone with only
`finance.transactions.read`: the third sees no pledge pages at all.

**Commit.** "The pledge pages"; "Show a person's promises on their own page".

---

## 9.3 — The reminder

**Goal.** Finance can remind everyone who still owes, monthly, without asking
anyone each time.

**Do.**

1. An audience provider (Phase 7 step 7.5), registered by the Finance module:

   | Provider | Parameters | Who is in it |
   | --- | --- | --- |
   | `finance.pledge_outstanding` | `campaignId?`, `minBalance?`, `overdueOnly?` | people with an `OPEN` pledge whose balance is above `minBalance`, with a phone number, not opted out |

   Its `fields` give the template `first_name`, `campaign_name`, `amount`,
   `balance` and `due_date`, each already formatted for a text message
   (`200,000 TZS`, `12 Oktoba`), because number formatting in a template is
   how you end up texting somebody `200000.00`.

2. Templates, drafted by Finance and approved by Comms/Admin, in all three
   languages, sent in the person's own `lang` (Phase 7 step 7.6).
3. A beat (Phase 7 step 7.8): the first Monday of the month at 10:00, two or
   three variants, quiet hours respected. Setting it up is a Comms screen, not
   a new one here.
4. **A person is reminded at most once a fortnight**, whatever schedules
   exist: a per-person cooldown checked at resolve time, because two campaigns
   both reminding on the first Monday is otherwise two texts in a minute.
   `comms.person_cooldown_days`, a church setting, default 14.
5. `MESSAGE_SENT` interactions on the timeline, so the next person to call
   them can see they were texted on Monday.

**Check.** e2e: the audience contains only those who owe and have not opted
out; two campaigns reminding the same day produce one message per person; the
cooldown blocks the second; the rendered body carries the way to stop; the
figures in the body match the pledge exactly.

**Commit.** "Remind people who still owe on a pledge, once a fortnight at
most".

---

## 9.4 — Phase check

- [ ] The leadership's written agreement to per-person pledge records is in the PR.
- [ ] `docs/data-inventory.md` section 3 is rewritten, and section 5 says how long pledges are kept.
- [ ] Amounts against names need `finance.pledges.read_sensitive`.
- [ ] A payment is never edited, only changed through an approved request.
- [ ] The balance is computed, never stored, and a race cannot break it (parallel-payment test).
- [ ] A reminder goes in the person's own language, names a figure only if the template was approved with one, and carries the way to stop.
- [ ] Nobody is texted twice in a fortnight.

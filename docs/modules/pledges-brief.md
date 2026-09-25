# Pledges — department brief

What the church agreed before Phase 9 was built (`docs/plan/09-pledges-and-giving-reminders.md`,
step 9.0). The three questions only the leadership could answer, and how long
the records are kept, were answered by the owner on the leadership's behalf on
**25 September 2026**. The owner's request, of 22 September 2026, was:

> finance need the sms thing for reminding people about their pledges

Pledges belong to the **Finance** department (D28): its portal holds them, and
its leaders send the reminders.

## 1. Who is in the department, and who leads it?

- The finance manager records campaigns and each person's pledge, and cancels
  a pledge that will not be kept.
- The finance clerks record payments as the money comes in.
- The pastors oversee: they may read every pledge, and change nothing, through
  the **Pledges overseer** role.
- The Finance department's leaders send the reminders, from My departments →
  Finance → Messages, once Communications has given Finance the audience of
  people who still owe.

## 2. What do they do every week that involves a list, a record or a number?

- A campaign opens ("Ujenzi 2027", "Bus fund"), with a target if there is one.
- People promise an amount towards it, sometimes with a date or a rhythm
  ("monthly until December").
- They pay in parts, usually on a Sunday, in money the clerk also records as
  income in Transactions. A payment can point at that entry, so the books and
  the pledge agree.
- Once a month, those who still owe are reminded, kindly, by text.

## 3. What do they look up, change, and approve?

- **Question 1 — Will the church hold per-person pledge records?**
  **Yes, for pledges only** (owner, 25 Sept 2026). Per-person tithes and
  offerings are still not recorded, and are not coming (Q8): a pledge is a
  promise the church is owed, which is a different thing from recording what
  each person drops in an envelope.
- A payment is never edited or deleted. A clerk who recorded one wrongly asks
  for a correction or a void, and an administrator approves it in Admin →
  Requests, exactly as for a finance entry (D17).
- A pledge is cancelled by the finance manager, with a reason. It stays in the
  records, with any payments already made.

## 4. What do they need from other portals?

- **People**, from Membership: a pledge is made by someone already in People,
  the same person every portal knows (D23).
- **Transactions**, from Finance itself: a payment may point at the income
  entry that recorded the money.
- **Communications**: the audience of people who still owe, templates approved
  by Communications, and a monthly recurring message (a beat).
- **The timeline**: that someone promised and that they paid appear on their
  timeline, but only for those allowed to see pledges (section 5).

## 5. What must they never see?

- **Question 2 — Who may see names against amounts?** A new permission,
  `finance.pledges.read_sensitive`, held by the **finance manager** and by the
  **pastors** through the new **Pledges overseer** role (owner,
  25 Sept 2026). Everyone else allowed into Pledges sees each campaign's
  totals and counts, never who owes what.
- **Clerks** record a payment without browsing the list of who owes: they find
  the one person in front of them by name, and see that person's pledge only.
- The lines a pledge writes on a person's timeline are hidden from anyone
  without `finance.pledges.read_sensitive`. Outreach, Membership and a
  department's leaders read the rest of that timeline, not these.

## 6. What leaves the system, and who pays?

- **Question 3 — What may a reminder say?** **No figure by default** (owner,
  25 Sept 2026; Q10). The default template names no amount:

  > Salamu {{first_name}}, tunakukumbusha ahadi yako ya {{campaign_name}}.
  > Karibu ofisini kwa maelezo.

  A template carrying `{{amount}}` or `{{balance}}` may be written, but like
  every template it is sent only once Communications has approved it; the
  leadership asks Communications to hold such a template to that standard,
  because a text naming a debt is read by whoever picks up the phone.
- Every reminder is in the person's own language, carries the way to stop, and
  goes to nobody who has asked not to be texted.
- **Nobody is texted about their pledges more than once a fortnight**, however
  many campaigns or reminders exist.
- Reminders are paid for like every other text, from the Communications
  budget, through Beem.

## How long the records are kept

**Forever. Pledge records are never deleted** (owner, 25 Sept 2026). The
"campaign plus seven years" first proposed was refused: a pledge is part of
the church's history, and the answer to a bigger database is a bigger
database. Campaigns, pledges and payments cannot be deleted by the
application at all; the database refuses it.

A person who asks to be erased (`person:erase`) takes their name with them,
not the money: their pledges and payments stay, belonging to nobody, so
every campaign's totals still add up.

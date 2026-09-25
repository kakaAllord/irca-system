# Communications — department brief

The brief step 6.12 asks for, filled in from the owner's notes of 17 and
22 September 2026. **Sections 1–3 need the Communications team's own answers
before Phase 7 starts** (`docs/plan/07-communications.md`, step 7.1).

## 1. Who is in the department, and who leads it?

- Lead: _TBC — confirm with the team._
- Their one delegate: _TBC._
- Anyone else who only reads: _TBC._

Roles that follow: **Communications lead** (everything), **Communications
sender** (compose and send, no approving), **Communications viewer** (reads).

## 2. What do they do every week that involves a list, a record or a number?

- Welcome messages to people who came for the first time.
- Thank-you messages after giving.
- Reminders: Bible study, services, special events, pledges.
- Announcements to everyone.
- On behalf of departments who ask them to send something.

The last one is the point of the whole phase: departments should send their
own routine messages, and Comms should own the standards, not the queue.

## 3. What do they look up, change, and approve?

| Thing | Who |
| --- | --- |
| The words of a template | drafted by any department, approved by Comms/Admin |
| Who may send for a department | Admin, on the leader's word — leader plus one delegate |
| Which audiences a department may reach | Admin/Comms, deliberately |
| Church-wide and cross-department sending | Comms only |
| The sender id, the rate, the daily cap, quiet hours | Comms/Admin |

## 4. What do they need from other portals?

| Need | Permission | From |
| --- | --- | --- |
| Names, gender and phone numbers | `membership.people.read`, `membership.people.read_sensitive` | Membership |
| Who is a member, who is a visitor | `membership.people.read` | Membership |
| Who came for the first time | `membership.people.read` | Membership |
| Who still owes on a pledge | `finance.pledges.read` | Finance (Phase 9) |
| The Outreach team, for its own reminders | resolved by Outreach's audience provider | Outreach (Phase 8) |

Never a copy of the data: an audience is resolved when a message is sent and
never stored (Phase 7, step 7.5).

## 5. What must they never see?

- **Prayer requests.** They are behind `membership.people.read_sensitive` and
  Comms holds it for phone numbers — so the person detail Comms is served
  must be the gated shape, and prayer requests must not be in it. Check this
  with a test, not by looking.
- Finance's transactions, beyond pledge balances in Phase 9.

## 6. What leaves the system, and who pays?

SMS through **Beem Africa**, one account for the church, whose key and secret
Communications enters and changes itself in the portal (D26). Cost is counted
per segment (`sms.segments`, `sms.cost`), with a daily cap so a mistake cannot
empty the credit. The monthly budget: _TBC — needed for the cap._

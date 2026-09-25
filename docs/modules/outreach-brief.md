# Outreach & Evangelism — department brief

Filled in from the owner's notes of 22 September 2026. **Sections 1 and 3 need
the Outreach leader's own answers before Phase 8 starts**
(`docs/plan/08-outreach.md`, step 8.1).

## 1. Who is in the department, and who leads it?

- Leader: _TBC._
- Team size today: _TBC._ Everyone in it is a person in the church's People
  list; Outreach never creates a second record for them.
- Partner groups of two or three go out together. Whether these hold for a
  season or change weekly: _TBC — it decides what the Saturday screen shows
  first._

Who does what (D28, D29): the team is the **Outreach department** in Admin →
Departments. Its **leaders**, named by an administrator, run the portal by
leading it — partner groups, Saturdays, training, the report — and keep the
team's members and send its messages like any department's leaders. Those who
sign in to record hold the **Outreach member** role; a pastor reading the
numbers holds **Outreach viewer**.

## 2. What do they do every week?

| When | What |
| --- | --- |
| Saturday | Teams go out to areas. People are reached. Numbers and names come back, often written down afterwards when the team meets. |
| During the week | Calls, home visits, invitations. Several per person, in any order. |
| Sunday | Some of those people come. Outreach wants to know which. |
| Friday | Training: a topic, a trainer, a venue, and who came. |
| Monthly | A report upward, from numbers they currently count by hand. |

## 3. What would they look up, change, and approve?

- Look up: who we reached and have not followed up; whether someone came to
  church; a member's training attendance.
- Change: the team, partner groups, a session's areas and counts, a person's
  details as they are learnt.
- Approve: nothing internally. Their message templates are approved by
  Comms/Admin once (Phase 7).
- Report upward: _which figures, and to whom — TBC._

## 4. What do they need from other portals?

| Need | How | From |
| --- | --- | --- |
| Pick people for the team | My departments → Outreach: a search showing names and the end of a number | Departments |
| Know whether someone they reached is already in People | Matched by the API when recording, by phone then name | Membership's `people` table |
| Phone numbers, to call the people they reached | `outreach.reached.read`, for people Outreach reached only | Outreach itself |
| Whether someone came to church | The shared timeline (D23) | Every portal |
| Send training reminders | Being an Outreach department leader (D28) | Comms |

## 5. What must they never see?

- **Prayer requests** and follow-up notes written by the Membership team:
  both are behind `membership.people.read_sensitive`, which no Outreach role
  or leadership holds. The timeline shows that the Membership team called or
  visited, never what they wrote.
- **The rest of People.** Outreach sees the people it reached and its own
  team, not the church's whole list.
- Finance and Admin.

## 6. What leaves the system, and who pays?

- SMS reminders to the team, through Comms, counted against the daily cap.
- Session reports as PDFs, uploaded by the leader and kept in object storage
  (Phase 8, step 8.9). They may contain names and locations, and
  `person:erase` cannot reach inside a PDF — the erasure runbook says to check
  them by hand.

## 7. The sentence this department is judged by

> Capture minimally during the work, enrich the record later.

Four fields to record a person: name, phone, location, who reached them. If a
screen asks for more than that on a Saturday, it is wrong.

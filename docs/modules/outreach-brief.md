# Outreach & Evangelism — department brief

Filled in from the owner's notes of 22 September 2026, and the answers given on
25 September 2026 (`docs/plan/08-outreach.md`, step 8.1). What is still open is
marked **open**.

## 1. Who is in the department, and who leads it?

- Leader: named by an administrator in Admin → Departments → Outreach, from
  the confirmed members. Who it is was not given here (**open**, and not
  needed by the code).
- Team size: *"can just be big and more big … even if it is 100 or 200"*
  (25 Sept 2026). Built and tested for a team of 150 and more: every list of
  the team can be searched by name.
- Everyone in the team has **already registered on the registration form**
  (25 Sept 2026). A leader can add only people who have filled in the whole
  form; Outreach never creates a second record for them.
- Partner groups of two or three go out together. They are **not bound by
  time**, but **who was with whom, from when until when, is kept**
  (25 Sept 2026): a change to a group ends and starts dated memberships, and
  the Team page shows each group's history.
- Areas: **every team goes to a different place**, and types it in; there is
  no fixed list (25 Sept 2026). Areas already used are only suggested.

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
- Report upward: **how many people were reached, and how many got salvation**
  (25 Sept 2026). Both are on the dashboard for any period, each opening the
  list it was counted from; a salvation is ticked when recording someone, or
  counted by the team for those spoken to without taking details. To whom
  they report: **open**.

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

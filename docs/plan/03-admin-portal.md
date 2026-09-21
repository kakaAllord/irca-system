# Phase 3 — The Admin portal

**Outcome.** A church administrator can invite a person by email and choose
which portal roles they get (only from portals that exist and are enabled). The
person receives an email, follows the link, sets a password and lands signed
in. The administrator can change roles, disable and re-enable people, turn
portals on and off, create custom roles, **view the portal as any person**
(read-only), and read the activity log. Everyone can reset a forgotten
password, change their own, see their devices, and see **who has viewed the
portal as them**.

| Step | What |
| --- | --- |
| 3.1 | Email: outbox, providers, templates, worker |
| 3.2 | Invitations in the API |
| 3.3 | Accepting an invitation in the API |
| 3.4 | The accept-invitation page |
| 3.5 | Forgot and reset password |
| 3.6 | People API: list and detail |
| 3.7 | People page |
| 3.8 | Invite dialog |
| 3.9 | Person page: roles, disable, resend, **View as** |
| 3.10 | Roles pages and custom roles |
| 3.11 | Portals page: turning modules on and off |
| 3.12 | Activity page |
| 3.13 | Account page |
| 3.14 | Guard rails |
| 3.15 | Creating a church from the command line |
| 3.16 | Tests |
| 3.17 | Phase check |

---

## 3.1 — Email: outbox, providers, templates, worker

**Goal:** emails are never lost when the provider is down, are retried, are
counted per church, and can be tested without sending real mail.

**Why an outbox:** the invitation and its email are written in **one
transaction**. If the email provider is down, the invitation still exists and
the email goes out when the provider recovers. Calling the provider inside the
request would either lose the email or fail the invitation.

**Do**

1. Model:

   ```prisma
   enum EmailStatus {
     PENDING
     SENDING
     SENT
     FAILED      // gave up after the last retry
   }

   model EmailOutbox {
     id                String      @id @default(uuid(7)) @db.Uuid
     churchId          String?     @map("church_id") @db.Uuid
     toEmail           String      @map("to_email") @db.VarChar(254)
     template          String      @db.VarChar(60)       // 'invitation', 'password-reset', ...
     /// Template inputs. Links containing one-time tokens are scrubbed once sent (see worker).
     payload           Json
     subject           String?     @db.VarChar(200)
     status            EmailStatus @default(PENDING)
     attempts          Int         @default(0)
     nextAttemptAt     DateTime    @default(now()) @map("next_attempt_at") @db.Timestamptz(6)
     lastError         String?     @map("last_error")
     providerMessageId String?     @map("provider_message_id") @db.VarChar(200)
     createdAt         DateTime    @default(now()) @map("created_at") @db.Timestamptz(6)
     sentAt            DateTime?   @map("sent_at") @db.Timestamptz(6)

     @@index([status, nextAttemptAt])
     @@index([churchId, createdAt(sort: Desc)])
     @@map("email_outbox")
   }
   ```

   Core-owned (not in `TENANT_MODELS`). Only `EmailService` writes it.
2. Env: `EMAIL_PROVIDER=log|resend|memory`, `RESEND_API_KEY`,
   `EMAIL_FROM="IRCA Admin <no-reply@…>"`, `EMAIL_REPLY_TO`. Validate in
   `env.ts`: `RESEND_API_KEY` is required when the provider is `resend`, and
   `memory` is only allowed when `NODE_ENV=test`.
3. `EmailProvider` interface: `send({ to, subject, text, html, replyTo }) →
   { messageId }`. Three implementations:
   - `LogEmailProvider` (development): prints subject, recipient and **every
     link in the body** to the API console, so a developer can click it.
   - `MemoryEmailProvider` (tests): keeps messages in an array, exposed only
     through a test-only controller `GET /v1/test/emails`, registered **only
     when `NODE_ENV=test`** (the route audit treats it as `@Public()`).
   - `ResendEmailProvider` (production): `npm i -w @irca/api resend`.
4. Templates in `src/core/email/templates/*.ts`. Each is a pure function
   `(payload) => { subject, text, html }`. Keep the HTML simple: a single
   centred column, the church name, one button, the plain link below it,
   inline styles only (email clients ignore stylesheets). **Always include a
   plain-text version.** Unit-test each template's output.
5. `EmailService.enqueue(tx, { churchId, to, template, payload })` inserts a
   row **using the caller's transaction**.
6. Worker job `email-outbox` every 15 s via `JobRunner`:
   - Claim up to 20, **at most 5 per church**, so one church's bulk sending
     never delays another church's password reset (`multi-tenancy.md`, section 9):
     ```sql
     -- tenant: core job, all churches, fair share per church
     update email_outbox set status = 'SENDING', attempts = attempts + 1
     where id in (
       select id from (
         select id, row_number() over (partition by church_id order by created_at) as n
         from email_outbox
         where status = 'PENDING' and next_attempt_at <= now()
       ) ranked
       where n <= 5
       order by n, id
       limit 20
       for update skip locked)
     returning *;
     ```

     `for update` cannot sit on a query with a window function, so if Postgres
     rejects this shape, select the ids first (the inner query), then run
     `update … where id = any($ids) and status = 'PENDING' returning *` and
     treat rows another worker took as already claimed.
   - Before enqueueing, `QuotaService.consume('emails_per_day')` (2.11a).
     Invitations and password resets are exempt from the quota (people must
     always be able to get in), and reminders and notifications are not.
   - Render, send. On success: `SENT`, `sentAt`, `providerMessageId`,
     `subject`, and **scrub** `payload.link` → `"[sent]"`, so one-time tokens
     do not sit in the database.
   - On failure: back to `PENDING` with `nextAttemptAt` = now + backoff
     (1 min, 5 min, 30 min, 2 h, 6 h). After attempt 6: `FAILED`.
   - Rows stuck in `SENDING` for over 10 minutes (crash mid-send) go back to `PENDING`.
   - Count `email.sent` / `email.failed` per church (2.11).

**Check:** with `EMAIL_PROVIDER=log`, enqueue a test email from a scratch
script: within 15 s the console prints it and the row is `SENT` with the link
scrubbed. Break `RESEND_API_KEY` with the resend provider: the row retries with
growing delays.

**Commits:** "Queue emails in the database so none are lost"; "Send queued
emails with retries".

---

## 3.2 — Invitations in the API

**Goal:** an admin can invite someone by email with chosen roles, and resend
or revoke the invitation.

**Do**

1. Model (tenant, so add it to `TENANT_MODELS`):

   ```prisma
   model Invitation {
     id           String    @id @default(uuid(7)) @db.Uuid
     churchId     String    @map("church_id") @db.Uuid
     membershipId String    @map("membership_id") @db.Uuid
     email        String    @db.VarChar(254)
     tokenHash    String    @unique @map("token_hash") @db.Char(64)
     expiresAt    DateTime  @map("expires_at") @db.Timestamptz(6)
     acceptedAt   DateTime? @map("accepted_at") @db.Timestamptz(6)
     revokedAt    DateTime? @map("revoked_at") @db.Timestamptz(6)
     createdById  String    @map("created_by_id") @db.Uuid
     sentCount    Int       @default(1) @map("sent_count")
     lastSentAt   DateTime  @default(now()) @map("last_sent_at") @db.Timestamptz(6)
     createdAt    DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)

     @@index([churchId, createdAt(sort: Desc)])
     @@index([membershipId])
     @@map("invitations")
   }
   ```

2. **Design choice:** the invited person's `User` (status `INVITED`),
   `ChurchMembership` (status `INVITED`) and `MembershipRole`s are created
   **at invite time**. The invitation only holds the token. That way the admin
   can adjust roles before the person accepts, the People list shows invited
   people with their future roles, and there is one source of truth for roles.
   Roles do nothing until the membership is `ACTIVE` (2.5's SQL requires it).
3. Shared zod schema `InviteSchema`:
   `{ email, fullName (2–120), roleIds: uuid[] (1–20) }`.
4. **`POST /v1/admin/invitations`**, `@RequirePermission('admin.users.invite')`.
   In `InvitationService.invite`, in one transaction:
   1. Load the roles by id through `db.client` (tenant-scoped, so foreign
      roles are simply not found). Every id must be found, not deleted, and in
      a module that is **enabled** in this church. Otherwise `422` with code
      `ROLE_NOT_AVAILABLE` naming the role. **This is the rule "only create
      users for portals that already exist".**
   2. Find the user by normalised email:
      - **Not found** → create `User { status: INVITED, fullName }`.
      - **Found, and already has an `ACTIVE` membership here** → `409
        ALREADY_MEMBER` "Neema already has access. Change her roles on her page."
      - **Found, with an `INVITED` membership here** → `409 ALREADY_INVITED`
        "Already invited. Resend it from her page."
      - **Found, `DISABLED` membership here** → `409 MEMBER_DISABLED`
        "Re-enable her from her page instead."
      - **Found elsewhere** (a member of another church, or a dev) → reuse the
        user and do not touch their name or password.
   3. Create the membership (`INVITED`, `invitedById`) and its `MembershipRole`s.
   4. Create a token: `randomBytes(32).toString('base64url')`. Store the
      SHA-256. `expiresAt = now + 72 h`.
   5. `email.enqueue(tx, { template: 'invitation', payload: { link:
      `${PORTAL_ORIGIN}/accept-invite?token=${token}`, churchName, inviterName,
      roleSummary: 'Finance clerk', expiresAt, needsPassword:
      user.passwordHash === null } })`.
   6. `audit.recordIn(tx, { action: 'admin.user.invited', entityType: 'user',
      entityId: user.id, summary: 'Invited neema@… as Finance clerk', after:
      { email, roles } })`.
   7. Return the person as the People list shows them (3.6).
5. **`POST /v1/admin/users/:userId/invitation/resend`**
   (`admin.users.invite`): revoke the old invitation (`revokedAt`), create a
   new token and invitation (72 h), enqueue, audit. Rate limit: at most 5
   resends per person per day (`429`).
6. **`DELETE /v1/admin/users/:userId/invitation`** (`admin.users.invite`):
   revoke the invitation and set the membership to `DISABLED`. If the user has
   no other memberships and never set a password, set the user to `DISABLED`
   too. Audit.
7. The invitation email (template `invitation`):

   > **Subject:** You've been given access to IRCA Admin
   >
   > Hello Neema,
   >
   > Kaka Allord has given you access to **International Revival Church
   > Arusha** as **Finance clerk**.
   >
   > **[Set your password]** *(or "Open IRCA Admin" when the person already
   > has a password)*
   >
   > This link works once and expires on Thursday 24 September at 10:40.
   > If you weren't expecting this, you can ignore this email and nothing will
   > happen.

   Format dates in the church's timezone.

**Check:** with the log provider, invite `neema@example.com` as a Finance clerk
(after Phase 4 the Finance module exists; for now use the Auditor role) and
see the link in the console. Inviting the same email again → 409
`ALREADY_INVITED`. A role id from another church → 422.

**Commits:** "Invite people by email with the roles they will have";
"Resend and cancel invitations".

---

## 3.3 — Accepting an invitation in the API

**Goal:** the link lets the person in exactly once.

**Do**

1. **`GET /v1/invitations/:token`**, `@Public()`, throttled to 20/min/IP.
   Hash the token and find the invitation (core lookup, via `PrismaCore`: there is
   no church in context yet). Valid = not accepted, not revoked, not expired,
   and the membership is still `INVITED`. Return
   `{ churchName, email, fullName, inviterName, roleSummary, needsPassword }`.
   Invalid → `410 INVITATION_INVALID` with one of `reason: 'expired' | 'used' |
   'revoked'`. Showing why helps the person ask the right thing, and it
   reveals nothing sensitive, because they hold the link.
2. **`POST /v1/invitations/:token/accept`**, `@Public()`, throttled. Body
   `{ password?, fullName? }`:
   - `needsPassword` → `password` is required and must pass `PasswordSchema`
     (`422` with the policy message otherwise). `fullName` may correct the name
     the admin typed.
   - In one transaction: set `acceptedAt`, membership `ACTIVE` and `joinedAt`,
     the user `ACTIVE` with `passwordHash` and `passwordChangedAt` (if a password
     was given), and audit `admin.invitation.accepted` with `churchId` set
     explicitly.
   - Then create a session in that church, set the cookie, and return `MeResponse`.
   - A second accept with the same token → `410` (`used`).
3. Add `INVITATION_INVALID`, `ROLE_NOT_AVAILABLE`, `ALREADY_MEMBER`,
   `ALREADY_INVITED`, `MEMBER_DISABLED` and `LAST_ADMIN` to `ErrorCode`.

**Check:** e2e: accept with a weak password → 422; accept properly → 200 +
cookie + `/me` shows the new person with their roles; accept again → 410; an
expired invitation → 410 `expired`.

**Commit:** "Let an invited person set their password and sign in".

---

## 3.4 — The accept-invitation page

**Goal:** a person who has never seen the portal gets in without help.

```
┌──────────────────────────────────────┐
│   [I]  IRCA · Admin portal           │
│                                      │
│   Welcome, Neema                     │
│   Kaka Allord has given you access   │
│   to International Revival Church    │
│   Arusha as Finance clerk.           │
│                                      │
│   Your name                          │
│   [ Neema Mollel                 ]   │
│   Email                              │
│   neema@example.com  (not editable)  │
│   Choose a password                  │
│   [ ••••••••••••          ] [Show]   │
│   ✓ At least 10 characters           │   ← live, from PASSWORD_MIN
│   ✓ Not a common password            │
│   Type it again                      │
│   [ ••••••••••••          ]          │
│                                      │
│   [      Set password and sign in ]  │
└──────────────────────────────────────┘
```

**Do**

1. `src/app/(auth)/accept-invite/page.tsx` (server): read `token` from
   `searchParams`, call `GET /invitations/:token` with a helper that does not
   redirect on 4xx.
   - Invalid → a card explaining it: *expired*: "This invitation has
     expired. Ask {inviterName}… to send a new one." Note that 410 does not
     return the inviter, so say "your church administrator". *used*: "This
     invitation has already been used. Sign in instead." plus a link.
     *revoked*: "This invitation was cancelled."
   - Valid and `needsPassword=false` → a single button "Join
     {churchName}" (the person already has an account from another church).
2. The form (client): the password field uses `autoComplete="new-password"`,
   the email is shown as text **and** also sent as a hidden
   `autoComplete="username"` field so password managers save the pair.
   Validate the policy live with the shared schema. The second password must
   match. On submit → `POST /api/invitations/:token/accept` →
   `router.replace('/')` → `router.refresh()`.
3. **Remove the token from the address bar** after the page loads
   (`history.replaceState`), so it is not left in browser history or shown
   over a shoulder.
4. Set `Referrer-Policy: no-referrer` for `/accept-invite` and
   `/reset-password` (in `next.config.ts` `headers()`), so the token never
   leaks to another site in a `Referer` header.

**Check:** follow the logged link in a fresh private window → set password →
you land in the portal as Neema, seeing only what her roles allow. Reopen the
same link → "already been used".

**Commit:** "Add the page an invited person lands on".

---

## 3.5 — Forgot and reset password

**Goal:** anyone can recover their account without an admin, and the flow
reveals nothing about which emails exist.

**Do**

1. Model (core-owned):

   ```prisma
   model PasswordResetToken {
     id        String    @id @default(uuid(7)) @db.Uuid
     userId    String    @map("user_id") @db.Uuid
     tokenHash String    @unique @map("token_hash") @db.Char(64)
     expiresAt DateTime  @map("expires_at") @db.Timestamptz(6)
     usedAt    DateTime? @map("used_at") @db.Timestamptz(6)
     createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
     @@index([userId])
     @@map("password_reset_tokens")
   }
   ```

2. **`POST /v1/auth/forgot-password`** `{ email }`, `@Public()`, throttled
   5/15 min per IP **and** 3/hour per email. **Always** respond `202` with the
   same body, whatever happens. Only when the user exists and is `ACTIVE`:
   invalidate their earlier unused tokens, create a token (1 h), enqueue
   `password-reset`, and audit.
3. **`POST /v1/auth/reset-password`** `{ token, password }`, `@Public()`:
   valid token → set the password and `passwordChangedAt` (which signs out every
   session, see 1.11), mark the token used, audit, create a new session, and return `MeResponse`.
4. Pages `/forgot-password` ("If an account exists for that email, we've sent
   a link. It works for one hour.", always shown after submit) and
   `/reset-password?token=` (the same password component as 3.4, with the
   token removed from the URL after load). Unhide the "Forgot your password?"
   link on the login page.

**Check:** forgot with an unknown email and with a real one → the same
message; only the real one produces an email. Resetting signs out another
browser that was signed in as that person.

**Commit:** "Let people reset a forgotten password".

---

## 3.6 — People API: list and detail

**Do**

1. **`GET /v1/admin/users`**, `admin.users.read`. Query: `q` (name or email,
   case-insensitive contains), `status` (`ACTIVE|INVITED|DISABLED`), `module`,
   `roleId`, `page` (1-based), `pageSize` (default 25, max 100). It lists
   **memberships** of the current church, joined to users and roles. Each row:

   ```ts
   type PersonRow = {
     userId: string; fullName: string; email: string; initials: string;
     status: 'ACTIVE' | 'INVITED' | 'DISABLED';
     roles: { id: string; name: string; moduleKey: string; moduleName: string }[];
     lastActiveAt: string | null;           // max(sessions.last_seen_at) for this church
     invitation: null | { expiresAt: string; expired: boolean; sentCount: number };
     isYou: boolean;
     canImpersonate: boolean;               // computed with ImpersonationPolicy for the viewer
   };
   ```

   Returns `{ rows, total, page, pageSize }`.
2. **`GET /v1/admin/users/:userId`**, `admin.users.read`: the row above,
   plus `phone`, `joinedAt`, `invitedBy`, `activeSessions` (count only),
   `lastLoginAt`, and `recentActivity` (the last 10 audit events *by* this
   person, read through `AuditQueries.forChurch()`, so impersonation never
   shows here). There is deliberately **no** view-as history on this page (D16).
3. Devs call these through the dev console (Phase 6), not here. Admin routes
   require a church in context.

**Commit:** "List the people who have access to a church".

---

## 3.7 — People page

**Route:** `/admin/users`. **Title:** People. **Subtitle:** "Everyone who can
sign in to {church}'s portals."

```
[ Search name or email…      ]  [Status: any ▾] [Portal: any ▾]      [+ Invite person]
All (14)  Active (11)  Invited (2)  Disabled (1)                ← pill tabs like the design
┌────────────────────────────────────────────────────────────────────────────────┐
│ Person                     Roles                               Last active    │
│ (NM) Neema Mollel          Finance clerk                       2 hours ago  › │
│      neema@…                                                                   │
│ (JT) Joyce Temba           Pastor · Finance viewer             Yesterday    › │
│ (GK) Godlisten Kessy       Finance clerk   [Invited · expires in 2 days]      › │
│ (FN) Frank Ndosi   [Disabled]                                   3 Sept       › │
└────────────────────────────────────────────────────────────────────────────────┘
                                                          ‹ 1 2 › · 14 people
```

**Do**

1. A server component reads `searchParams` and calls `serverApi('/admin/users?…')`.
2. **Filtering is live**, as the owner asked for the old dashboard: the
   search box and selects update the URL with `router.replace` (debounced
   250 ms for typing). The server component re-renders with the new params. No
   "Filter" button. The URL is shareable, and Back works.
3. Status badges: Invited = accent outline ("expires in 2 days", or
   "**expired**" in `--danger`), Disabled = grey.
4. `+ Invite person` is wrapped in `<Can permission="admin.users.invite">`.
5. Clicking a row goes to `/admin/users/[userId]`.
6. Empty state: "No one matches these filters. **Clear them**".

**Check:** filters update as you type; Back restores the previous filter; as
an Auditor there is no Invite button.

**Commit:** "Add the People page".

---

## 3.8 — Invite dialog

```
┌ Invite a person ─────────────────────────────────────── ✕ ┐
│ Email                                                      │
│ [ neema@example.com                                   ]    │
│ Full name                                                  │
│ [ Neema Mollel                                        ]    │
│                                                            │
│ What can they use?                                         │
│  FINANCE                                                   │
│   ☐ Finance viewer    See the overview, transactions and   │
│                       reports. Change nothing.             │
│   ☑ Finance clerk     Everything a viewer can, plus record │
│                       income and expenses, and ask for     │
│                       corrections.                         │
│   ☐ Finance manager   Everything a clerk can, plus         │
│                       download entries and tidy the lists. │
│  ADMIN                                                     │
│   ☐ Church administrator …                                 │
│   ☐ Auditor …                                              │
│                                                            │
│  Portals that are turned off are not listed. Turn them on  │
│  in Portals.                                               │
│                                                            │
│                         [Cancel]  [Send invitation]        │
└────────────────────────────────────────────────────────────┘
```

**Do**

1. Roles come from `GET /v1/admin/roles?assignable=true`: roles of enabled
   modules, grouped by module, each with `description` and its permission
   labels (shown in a "What this allows" disclosure under each role).
2. At least one role must be ticked. The button stays disabled until it is.
3. On success: close, toast "Invitation sent to neema@example.com", and
   `router.refresh()` the list. On `409` show the API message inline under the
   email with a link to the person's page. On `422 ROLE_NOT_AVAILABLE` (a
   portal was turned off meanwhile), reload the role list and show the message.
4. Use Headless UI `Dialog`: focus moves into it, Esc closes it, and focus
   returns to the button.

**Commit:** "Invite people from the People page".

---

## 3.9 — Person page: roles, disable, resend, View as

**Route:** `/admin/users/[userId]`.

```
← People
(NM)  Neema Mollel                      [View as Neema]  [⋯]   ← ⋯: Disable / Resend / Cancel invitation
      neema@example.com · Active · joined 21 Sept 2026

Roles                                               [Edit roles]
  Finance · Finance clerk          granted by Kaka Allord, 21 Sept

Recent activity                                     See all →
  Recorded expense IRCA-EXP-2026-09-000014 · 2 hours ago
  …
```

**Do**

1. **Edit roles** (`<Can admin.users.manage>`): the same grouped checklist as
   the invite dialog. Saving calls `PUT /v1/admin/users/:userId/roles
   { roleIds }`. The API diffs, inserts and removes `MembershipRole`s,
   writes one audit event per grant/revoke (`admin.role.granted` /
   `admin.role.revoked`), and applies the guard rails (3.14).
2. **Disable** (`<Can admin.users.manage>`): confirm dialog "Neema will be
   signed out and won't be able to sign in to IRCA until re-enabled. Her
   records stay." → `POST /v1/admin/users/:userId/disable` → membership
   `DISABLED`, revokes her sessions **that are in this church**
   (`active_church_id = church`) and ends impersonations **of** her. Audit.
   **Enable** reverses it (roles are kept).
3. **Resend / cancel invitation** for invited people (3.2 endpoints).
4. **View as** (`<Can admin.users.impersonate>` **and** `row.canImpersonate`):
   **one click, no dialog and no reason** (D16). The button's tooltip says
   "See the portal exactly as Neema does. Read-only."
   → `POST /api/impersonation { subjectUserId }`, store the current
   path in `sessionStorage` (`irca_return_to`), `router.replace('/')` and
   `router.refresh()`. The banner from 2.16 takes over.
5. When `canImpersonate` is false (self, a dev, invited, disabled), hide the
   button. Do not show a disabled button with no explanation.

**Check:** as admin, View as the clerk: the banner shows, the sidebar is the
clerk's, no action buttons exist anywhere, and Stop returns you to Neema's
page. Sign in as Neema in another browser: nothing anywhere shows that she was
viewed. The Activity page does not show it either.

**Commits:** "Change a person's roles"; "Disable and re-enable people";
"Start viewing as a person from their page".

---

## 3.10 — Roles pages and custom roles

**Routes:** `/admin/roles` and `/admin/roles/[roleId]`.

**Do**

1. **API**
   - `GET /v1/admin/roles` (`admin.roles.read`): roles grouped by module
     (enabled modules first, disabled ones shown greyed with "portal off"),
     with `memberCount`, `isSystem`, and permissions `[{ key, label, kind }]`.
   - `POST /v1/admin/roles` (`admin.roles.manage`)
     `{ moduleKey, name, description, permissionKeys }`: the module must be
     enabled; every permission must belong to `moduleKey` and not be retired;
     the name must be unique in that module (`409`). Audit.
   - `PATCH /v1/admin/roles/:id`: custom roles only (`409 SYSTEM_ROLE` for
     system ones). Same validation. Audit with before/after permission lists.
   - `DELETE /v1/admin/roles/:id`: custom only, and only when `memberCount
     = 0` (`409 ROLE_IN_USE` listing the people). Soft delete (`deletedAt`).
2. **List page:** one card per module. Each role shows its name, "System" or
   "Custom", "5 people", and a one-line description. `+ New role` per module
   (`<Can admin.roles.manage>`).
3. **Role page:** the name, description, and the module's permissions as
   two columns, **Can see** (read) and **Can change** (write), with ticks.
   Read-only for system roles, with the note "Built-in roles change only when
   the portal is updated." For custom roles it is an editable checklist. Ticking
   a write permission with no read permission in the same resource shows a
   hint: "Usually also needs 'See transactions'".
4. A "People with this role" list at the bottom, linking to each person.

**Check:** create "Treasurer" in Finance with read + request_change but not
create; assign it to someone; they can ask for corrections but not record.
(Fully checkable in Phase 4.)

**Commit:** "Let admins make their own roles from the permissions a portal offers".

---

## 3.11 — Portals page: turning modules on and off

**Route:** `/admin/portals`.

```
Portals
Turn on the parts of the system your church uses. People can only be given
roles in portals that are on.

┌ Membership ───────────────────── On ●─┐  ┌ Finance ──────────────────── Off ─○┐
│ Registrations, members, applications, │  │ Income, expenses and reports.      │
│ discipleship and insights.            │  │                                    │
│ 12 people have roles here             │  │ Turn on to create its roles.       │
└───────────────────────────────────────┘  └────────────────────────────────────┘
┌ Admin ──────────────────── Always on ─┐
│ People, roles, portals and activity.  │
└───────────────────────────────────────┘
```

**Do**

1. **API**
   - `GET /v1/admin/modules` (`admin.modules.read`): every module in
     `CHURCH_MODULES` with `enabled`, `kind`, and `peopleWithRoles`.
   - `PUT /v1/admin/modules/:key` `{ enabled }` (`admin.modules.manage`):
     `kind: 'core'` → `409` ("Admin is always on"). On enable: upsert
     `church_modules`, call `ensureModuleRoles` (2.3), and audit. On disable:
     set `enabled=false`, `disabledAt/ById`, and audit. **No roles or data are
     deleted.**
   - Unknown key (not in code) → `404`. "Only portals that already exist"
     falls out of this: the list comes from code.
2. **Disable confirmation:** "Turn off Finance? 5 people will lose access to
   Finance straight away. Their roles and all Finance records are kept and
   come back if you turn it on again." Checking the box "I understand" enables
   the button.
3. A person currently on a Finance page gets a 403 on their next request, and
   their next `/me` drops the module. No extra code is needed.

**Check:** turn Finance off while the clerk is signed in (second browser):
their next navigation shows the 403 state, and the sidebar loses Finance. Turn
it on: everything is back, same roles.

**Commit:** "Turn portals on and off without losing their roles or data".

---

## 3.12 — Activity page

**Route:** `/admin/audit`. **Title:** Activity. **Subtitle:** "Everything
changed in {church}."

**Do**

1. `GET /v1/admin/audit` (`admin.audit.read`), filters: `actorUserId`,
   `action` prefix (`finance.`, `admin.`, `membership.`), `from`, `to`
   (church-local dates), and keyset pagination by `(createdAt, id)` descending
   (`before` cursor). The audit table grows forever, and offset paging gets slow.
   It reads through `AuditQueries.forChurch()`, so **impersonation never
   appears here** (D16). That is the dev console's impersonation log (6.4).
2. Rows: time (church local), who, the `summary`, and the entity link (e.g. to
   the transaction).
3. Expanding a row shows `before`/`after` as a field-by-field diff (changed
   fields only, old value struck through).
4. Labels for `action` come from `packages/shared/src/audit-actions.ts`.

**Commit:** "Show a church its activity log".

---

## 3.13 — Account page

**Route:** `/account`, for everyone signed in (`@AuthenticatedOnly()` APIs).
While impersonating it shows the **subject's** account, read-only, with no
password form.

**Do**

1. **Profile:** full name and phone. `PATCH /v1/me` (write, own record only).
2. **Change password:** current, new, repeat. `POST /v1/me/password` checks
   the current password (with the login rate limit), sets the new one, and
   **revokes every other session** (keeps this one: set `passwordChangedAt`,
   then immediately create a fresh session for this browser).
3. **Devices:** `GET /v1/me/sessions` (created, last seen, IP, a parsed user
   agent such as "Chrome on Android") with a *Sign out* per device and *Sign
   out everywhere else*. These are the person's own sessions only. An admin
   viewing as them uses the admin's session, so it never appears in this list.

There is deliberately no "who viewed as me" section (D16).

**Commit:** "Let people manage their own account".

---

## 3.14 — Guard rails

Enforce all of these **in the API** (the UI just explains them), each with a
test:

| Rule | Error |
| --- | --- |
| A church always keeps at least one ACTIVE Church administrator: removing the role from, or disabling, the last one fails. | `409 LAST_ADMIN` "IRCA needs at least one administrator. Make someone else an administrator first." |
| You cannot disable yourself. | `409` "You can't disable your own access." |
| You cannot remove your own Church administrator role if you are the last one (covered above). If you are not the last, it is allowed, with a confirm dialog: "You will lose access to Admin immediately." | |
| Roles can only be granted from enabled modules of this church. | `422 ROLE_NOT_AVAILABLE` |
| Nobody can make someone a dev through the portal. `platform_role` is set only by the CLI (1.14). | (no endpoint exists) |
| Invitation tokens and reset tokens work once and expire (72 h / 1 h). | `410` |
| Emails in invitations are normalised, so `Neema@X.com ` and `neema@x.com` are one person. | |

**Commit:** "Keep every church with an administrator and roles within its portals".

---

## 3.15 — Creating a church from the command line

**Goal:** production gets IRCA (and any later church) with its first
administrator, before the dev console UI exists (Phase 6).

**Do** — CLI command:

```bash
npm run cli -w @irca/api -- church:create --code IRCA --slug irca \
  --name "International Revival Church Arusha" \
  --admin-email pastor@example.com --admin-name "Pastor Ndelimbi"
```

It validates the code (`^[A-Z][A-Z0-9]{1,9}$`) and slug
(`^[a-z][a-z0-9-]{1,39}$`), creates the church, enables `admin`, runs
`ensureModuleRoles`, and **invites** the first administrator through the
normal invitation code (so they set their own password), with
`createdById` = the dev running it (`--as dev@…`). It prints the result.

**Commit:** "Create a church and invite its first administrator from the command line".

---

## 3.16 — Tests

**API e2e** (`test/admin/*.e2e-spec.ts`):

- Invite: success enqueues exactly one email containing a link; duplicate
  → 409; foreign role → 422; role of a disabled module → 422; the invited
  person cannot sign in before accepting; roles granted at invite do nothing
  before acceptance.
- Accept: weak password 422; success signs in; reuse 410; expiry 410; after
  revoke 410; existing user from another church joins without a password step.
- Forgot/reset: identical responses for unknown and known emails; reset
  signs out other sessions; token reuse 410.
- Roles: custom role CRUD; system role immutable; delete in use 409;
  permission from another module 422.
- Modules: enable creates system roles; disable removes permissions in `/me`
  but keeps `membership_roles` rows; admin cannot be disabled.
- Guard rails table from 3.14, one test per row.
- Permission matrix: Auditor can `GET` every admin route and gets `403` on every
  write route.
- Impersonation from the admin UI flow: `canImpersonate` flags are right for
  self/dev/invited/disabled/other church.
- `GET /v1/admin/audit` as a Church administrator, right after that same admin
  viewed as someone, contains no `impersonation.*` rows and no row with an
  `impersonationId`.

**Playwright** (`e2e/invite.spec.ts`), using `EMAIL_PROVIDER=memory` and
`GET /v1/test/emails`:

1. Admin signs in, invites `new.person@example.com` as Auditor.
2. The test reads the email, extracts the link, opens it in a **new browser
   context**, sets a password, and lands in the portal seeing Admin in
   read-only form (no Invite button).
3. Admin views as the new person (one click, no dialog): banner, no buttons, Stop works.
4. In the new person's own browser, the Account page and everything else show
   no sign of it, and the admin's Activity page shows nothing either.

**Commit:** "Test inviting, accepting, roles, portals and view-as end to end".

---

## 3.17 — Phase check

- [ ] A real invitation email (Resend in a staging environment) arrives, looks right on a phone, and its link works once.
- [ ] Forgot password works and reveals nothing about which emails exist.
- [ ] Roles offered are only those of enabled portals, and the API refuses others.
- [ ] Turning a portal off and on keeps roles and data.
- [ ] View as works from the Person page, is read-only, and is visible to the viewed person.
- [ ] The last administrator cannot be removed.
- [ ] The Activity page shows every step of the above with the right actor and subject.
- [ ] All tests green in CI.

# IRCA registration

The progressive registration flow from `Church registration progressive flow.zip`,
built as a Next.js app on PostgreSQL. The zip is treated as a guide to how the
screens should look and feel, not as an implementation.

## Running it

Postgres must be running locally. Copy `.env.example` to `.env.local`; the
connection string is set to `postgres:postgres@localhost:5432`.

This app is one workspace of the IRCA system monorepo. Install from the
repository root, then run it from here or by workspace name:

```bash
npm install                      # at the repository root: one lockfile for every app
cd apps/registration
cp .env.example .env.local
npm run db:setup   # creates the irca_registration database and applies db/schema.sql
npm run dev        # http://localhost:3001
# or, from the root: npm run dev -w @irca/registration
```

`DATABASE_URL` has no fallback. If it is unset the app says so and stops, rather
than connecting to a plausible-looking local default and appearing merely empty.

## Deploying to Vercel

Add Neon from the Vercel marketplace, then push. That is the whole thing.

The integration writes the connection variables into the project itself, so
there is nothing to copy by hand, and `vercel.json` sets the build command to
`npm run db:migrate && next build` — the schema is applied before the app is
built, on every deploy.

Deploying against a database you created yourself works the same way; set
`DATABASE_URL` under Settings → Environment Variables and nothing else. The
integration also sets `DATABASE_URL_UNPOOLED`, and `db:migrate` prefers it when
it is there so that a build-time task does not occupy a pooler slot, but it is
an optimisation rather than a requirement. The advice to run migrations over a
direct connection is aimed at engines that take advisory locks and set session
state, like Prisma and Drizzle; this schema is plain DDL in a single statement
batch, which transaction-mode PgBouncer is happy with.

One thing worth changing by hand: end the connection string with
`?sslmode=verify-full` rather than the `?sslmode=require` Neon hands you.
node-postgres currently treats `require` as an alias for `verify-full` and warns
about it, but in pg 9 it will mean "encrypt without verifying the certificate",
so pinning `verify-full` keeps the stronger behaviour across that change.

`channel_binding=require` in a Neon URL does nothing on its own: it is a libpq
parameter, and this driver parses it and moves on. Channel binding is turned on
in `src/lib/db.ts` instead, where the driver actually reads it.

**Why the build command.** Vercel has no release phase, so the build is the only
hook that runs once per deploy. The tempting alternative — applying the schema
lazily on the first request — puts every serverless instance in a race over the
same DDL and lets a migration error keep instances from becoming ready.
`db/schema.sql` is written to be idempotent (`create table if not exists`,
`create or replace function`), so re-applying it on every deploy is a no-op once
the tables are there, and a failure fails the build rather than the site.

## How it is put together

**One question, one URL.** The design prototype drives the flow with an array
index (`state.i`). That is fine for a mockup and wrong for the real thing:
ticking "I want to join the church" inserts three steps mid-flow and every index
after it shifts. Each question has its own URL instead, so the back button, a
refresh, and a link from the office all land where they should.

**Branching is recomputed, never stored.** `applicableSteps()` filters the step
list through each step's `when`/`memberOnly` predicate on every request.

**Answers are saved per step.** Every screen promises "Saved, you can come
back", so the write happens on Continue rather than at the end.

**The token is the identity.** The office sends an unfinished registration's
link by SMS to a phone that has never seen our cookie, so `registrations.token`
identifies the row. The cookie only saves someone on the same device from
starting over.

**Validation lives in one place and runs twice.** `validateStep()` greys the
Continue button on the client and runs again on the server. The greyed button is
a courtesy; anyone can POST.

**Answers are stored in English, shown in the visitor's language.** The database
holds stable keys (`A friend`, `Joining the church`) so the office can query
them, and `labelOf()` translates them back for the review screen.

### Losing nothing

Continue saves a finished answer. Autosave catches the half of one someone
leaves behind: a visitor who types their name and is called into the service is
still in the office's list afterwards.

Two halves, and the second is the one that matters:

- A **debounce** (1.2s idle), so typing a name costs one request rather than
  one per keystroke.
- A **flush when the page goes away**, through `navigator.sendBeacon` to
  `/api/draft`. This is the point of the whole thing: people abandon forms on
  phones by switching apps or locking the screen, and `beforeunload`/`unload`
  fire unreliably on mobile, never fire on an app switch, and disqualify the
  page from the back/forward cache. `visibilitychange` to hidden is the event
  that actually fires, with `pagehide` behind it.

A beacon is a plain POST, which is why the draft endpoint is a route handler
rather than a server action. It deliberately does **not** validate: a draft is
partial by definition, and a phone number with three digits typed so far is
exactly the thing worth keeping. Continue still runs the full rules.

It writes only the keys the step owns, the same rule the Continue path uses, and
swallows the once-per-number conflict, which Continue surfaces properly.

### Phone numbers

Lengths come from Google's libphonenumber, via `libphonenumber-js`. Shipping its
metadata to the client would cost about 145KB, which is real money on Tanzanian
mobile data, so `scripts/gen-dial-codes.mjs` extracts just what the validator
needs, per country: the dial code, the valid national-number lengths, and a real
example number for the placeholder. That is 245 countries in about 20KB.

The length check turns out to be prefix-independent, which is what makes the
extraction possible: probing every length from 3 to 15 recovers the exact set.

A single "at least seven digits" rule would be wrong nearly everywhere:
Tanzania is exactly 9, Kenya accepts 7 to 10, the UK 7, 9, 10, 11 or 12. Because
those sets are not contiguous, a number can land in a gap: 8 digits for the UK
is neither too short nor too long. `checkPhone` only says "too long" past the
longest valid length, since below that "keep going" is the more useful thing to
tell someone still typing.

`dial_cc` is stored alongside `dial` because the dial code alone is ambiguous:
+1 covers the US, Canada and a dozen more, and they do not share a length.

### The country picker

A native `<select>` cannot show a flag, and flag emoji have no font on Windows,
so the office's desktop would show "TZ" where a phone shows a flag. It is also a
poor way through 245 options. So it is a bottom sheet with a search box and real
SVG flags from `country-flag-icons` (a few hundred bytes each, in `/public/flags`,
fetched only for rows on screen). Search matches the country name, the dial code
with or without its `+`, and the ISO code.

The sheet renders through a portal into `document.body`. It has to: the question
area animates in with a transform, and a transformed ancestor becomes the
containing block for `position: fixed`, so a sheet rendered in place gets
trapped inside the scrolling panel instead of covering the screen.

### Date of birth

Three horizontal rails you thumb through, rather than the usual set of vertical
columns squeezed side by side. Horizontal rows give the day, month and year each
the full width, and a sideways thumb swipe is the easiest gesture on a phone
held one-handed.

The year rail is seeded from the age band given two screens earlier. Someone who
said "19 to 35" opens on the year of a 27-year-old and can only roll within that
band, so they are a few flicks from their answer rather than scrolling through a
century. This is why the year is not split into a "19 / 20" wheel and then
digits: that is two extra interactions to reach somewhere the age band already
told us.

Physics are CSS `scroll-snap`, so it inherits the platform's own momentum.
Settling is detected with a debounced scroll handler; `scrollend` is used where
it exists but only became Baseline in late 2025, and these are not new phones.

Nothing is recorded until a rail is actually moved, so an untouched picker never
files a birthday we invented.

### Changing language

The design hides the other two languages once one is chosen, and that is right
for the body of the screen. But someone who tapped the wrong one on the first
screen should not have to start again, so the switch lives in the header of
every screen of the flow.

Switching calls a server action and then `router.refresh()` rather than
navigating. The server re-renders the screen they are on in the new language,
while anything half-typed into the current question survives, because the step's
draft lives in client state and the component never unmounts.

An unrecognised language value is ignored rather than coerced to English:
quietly moving someone off the language they chose because a value failed to
parse is worse than doing nothing.

Walking back from the first question still reaches the language screen
(`/?change=<token>`), which updates that registration rather than starting a
second one.

### The walk-with-God screen

Questions appear one at a time, each when the one above it is answered. Someone
who is not yet born again is not asked about their baptism or about being filled
with the Holy Spirit; those questions presuppose the first, and asking anyway
reads as not listening. `faithQuestions()` is the single definition of that
chain, read by the screen, by the "how much is left" count and by the review, so
they cannot drift apart.

### Logo

`scripts/optimise-logo.mjs` keys the white background to transparent with a soft
alpha ramp. Compositing the source over a coloured canvas does nothing, because
a JPEG has no alpha: the white is opaque pixels, not absence. It also trims the
margin and emits WebP. AVIF is enabled in `next.config.ts`, which takes what
actually reaches a phone from 26.6KB to about 12KB.

## Where people get to

`src/office/InsightsReport.tsx` (formerly the `/admin/insights` route, see
below) answers "which question is losing people" and "what is nobody
filling in", as counts **and** percentages. At a couple of dozen visitors a
Sunday a percentage alone lies: "50% skipped it" reads like a finding until you
see it was one person out of two.

Per question: **reached**, **answered**, **left blank**, **stopped here**. Plus
a breakdown of what people choose for every question with a list of options,
which is what tells you an option nobody ever picks is a line to cut.

Two things it gets right that are easy to get wrong:

- **Each question is counted only against the people who were shown it.**
  Someone who never said a friend invited them was never asked who, so they are
  not counted as having skipped it.
- **Drop-off is measured against the furthest step reached, not the current
  one.** Walking back to fix an answer is not giving up, and `current_step`
  alone would report it as though it were. `furthest_step` only moves forwards.
  It also records the screen someone is *on*, not the one they last finished,
  because the question that loses somebody is the one in front of them.

It is all derived from the registrations table, with no event log. Every
question it answers is a fact about the row as it stands. An events table would
buy per-visit timing and repeat visits, at the cost of a write per interaction.

## Schema

One wide typed table rather than an `answers(key, value)` table. EAV would
survive question changes without migrations, but it turns the review screen and
every export into a pivot, and this flow is fixed. Multi-answer questions are
`text[]`, which `pg` maps natively.

Two indexes worth knowing about:

- `registrations_status_updated_idx` the office list, unfinished first.
- `registrations_phone_idx` unique on `(dial, phone)` where the phone is not
  blank, because registration is meant to happen once. It is partial so the many
  in-progress rows with no phone yet do not collide. Hitting it surfaces as
  "That number is already registered. Ask the office for your link."

## Things left deliberately undone

- **There is no office screen at the moment.** `/admin` and `/admin/insights`
  were served with no sign-in while listing prayer requests and phone numbers,
  so the routes were taken down. Their code is kept, unrouted, in `src/office/`
  as the reference for the Membership portal, which brings the same list and
  insights back behind login and roles (Phase 5 of `docs/plan`). Until then the
  office has no view of registrations in the app; ask a developer for a query.
- **The two pastors on the done screen are hardcoded** in
  `src/app/r/[token]/done/page.tsx`. Move them to a table when the office wants
  to change them without a deploy.
- **Numbers are validated by length, not by prefix.** `isValidPhoneNumber` from
  libphonenumber-js would also reject a number whose operator prefix does not
  exist, but that needs the full metadata on the client. Worth revisiting if the
  office finds people mistyping the leading digits.

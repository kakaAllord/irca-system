# Phase 4 — The Finance portal (and the RBAC test case)

**Outcome.** The finance team records **income** against a list of *income
sources* (Tithe, Sadaka, Harambee…) and **expenses** against a list of
*expense items* (Electricity bill, Generator fuel…). While typing they get
suggestions from that list. If the item does not exist, they create it first
(in a small dialog, without leaving the form) and then use it. Every entry gets
a permanent number:

```
IRCA-INC-2026-09-000001      IRCA-EXP-2026-09-000001
└┬─┘ └┬┘ └─┬┘ └┬┘ └──┬─┘
 │    │    │   │     └ counter: restarts every month, separately for INC and EXP, no gaps
 │    │    │   └ month of the transaction date
 │    │    └ year of the transaction date
 │    └ INC = income, EXP = expense
 └ the church's code
```

Entries are never deleted, so the numbers never have gaps. **Nobody in
Finance can change an entry directly, not even to void it.** They send a
*change request* with the new values and a reason, and a church administrator
approves or rejects it in the Admin portal's **Requests** inbox (D17). The
database refuses any change to an entry that does not come from an approved
request. There are an overview, a filterable transaction list, a lists
(catalog) page, and a statement report with print and CSV.

This phase is also **the RBAC test case.** It follows `docs/adding-a-module.md`
exactly, and ends with a scripted walkthrough (4.15) that creates finance users
by email invitation and checks every permission, impersonation, a module
switched off, and a second church.

| Step | What | Status |
| --- | --- | --- |
| 4.1 | The Finance module manifest | Done: `3f0cc33` |
| 4.2 | Tables, constraints and the database's own safety checks | Done: `8be0a66` |
| 4.3 | Shared helpers: the code format, names, money | Done: `3f0cc33` |
| 4.4 | The number allocator | Done: `367ee1a` (in `src/core/sequences/`) |
| 4.5 | Income sources and expense items API (suggest, create, manage) | Done: `44ab620` |
| 4.6 | Transactions API | Done: `44ab620` |
| 4.6a | Change requests: the core mechanism and Finance's handler | Done: `367ee1a`, `44ab620` |
| 4.7 | Overview and report queries | Done: `44ab620` |
| 4.8 | The suggest-or-create field | Done: `9e45abd` |
| 4.9 | Record expense / record income page | Done: `9e45abd` |
| 4.10 | Transactions page | Done: `9e45abd` |
| 4.11 | Transaction page: details and requesting a change | Done: `9e45abd` |
| 4.11a | Requests: the Admin inbox and Finance's list | Done: `9e45abd` |
| 4.12 | Lists page (income sources and expense items) | Done: `9e45abd` |
| 4.13 | Overview page | Done: `9e45abd` |
| 4.14 | Reports page | Done: `9e45abd` |
| 4.15 | **The RBAC walkthrough** | For the owner: `docs/what-works-now.md` |
| 4.16 | Automated tests | Done: `3ffc740`, `77dbd5a` |
| 4.17 | Phase check | See below |

**What was built differently from this plan, and why**

- `replacedById` is not a column. A replacement points at what it replaces
  (`replaces_id`, unique), and the old entry's "replaced by" is read back
  through that one link. Two columns saying the same thing could disagree, and
  a voided entry's row is deliberately hard to change.
- The catalog service uses raw SQL only where it must: trigram suggestions and
  the "used N times" counts. Rows are written through Prisma so their ids are
  UUID v7 like every other table's. Raw SQL always goes through `db.tx()`,
  because the tenant extension cannot see inside a raw query and only the
  transaction sets the church for row-level security.
- The 50-at-once numbering test drives a real socket rather than supertest's
  in-process server, which resets connections at that concurrency.
- The demo-data command (4.7's check) was not needed: the overview's numbers
  are checked against SQL sums in the tests instead.

---

## 4.1 — The Finance module manifest

**Do** — `packages/shared/src/modules/finance.ts`, then add it to `CHURCH_MODULES`:

```ts
export const financeModule = defineModule({
  key: 'finance',
  name: 'Finance',
  description: 'Income, expenses and reports.',
  kind: 'department',
  home: '/finance',
  permissions: {
    'finance.overview.read':       { kind: 'read',  label: 'See the finance overview' },
    'finance.transactions.read':   { kind: 'read',  label: 'See income and expense entries' },
    'finance.transactions.create': { kind: 'write', label: 'Record income and expenses' },
    'finance.transactions.request_change': { kind: 'write', label: 'Ask an administrator to correct or void an entry',
                                     hint: 'Entries are never changed directly. An administrator approves each change.' },
    'finance.transactions.export': { kind: 'read',  label: 'Download entries as CSV' },
    'finance.catalog.read':        { kind: 'read',  label: 'See income sources and expense items' },
    'finance.catalog.create':      { kind: 'write', label: 'Add a new income source or expense item while recording' },
    'finance.catalog.manage':      { kind: 'write', label: 'Rename and turn off income sources and expense items' },
    'finance.reports.read':        { kind: 'read',  label: 'See reports and statements' },
  },
  systemRoles: [
    { key: 'finance.viewer', name: 'Finance viewer',
      description: 'See the overview, entries and reports. Change nothing.',
      permissions: ['finance.overview.read', 'finance.transactions.read', 'finance.catalog.read', 'finance.reports.read'] },
    { key: 'finance.clerk', name: 'Finance clerk',
      description: 'Everything a viewer can, plus record income and expenses, add new items while doing so, and ask for corrections.',
      permissions: ['finance.overview.read', 'finance.transactions.read', 'finance.catalog.read', 'finance.reports.read',
                    'finance.transactions.create', 'finance.transactions.request_change', 'finance.catalog.create'] },
    { key: 'finance.manager', name: 'Finance manager',
      description: 'Everything a clerk can, plus download entries and tidy the lists.',
      permissions: ['finance.overview.read', 'finance.transactions.read', 'finance.catalog.read', 'finance.reports.read',
                    'finance.transactions.create', 'finance.transactions.request_change', 'finance.catalog.create',
                    'finance.transactions.export', 'finance.catalog.manage'] },
  ],
  nav: [
    { label: 'Overview',     href: '/finance',              mark: 'F', permission: 'finance.overview.read' },
    { label: 'Transactions', href: '/finance/transactions', mark: 'T', permission: 'finance.transactions.read' },
    { label: 'Lists',        href: '/finance/lists',        mark: 'L', permission: 'finance.catalog.read' },
    { label: 'Requests',     href: '/finance/requests',     mark: 'Q', permission: 'finance.transactions.read' },
    { label: 'Reports',      href: '/finance/reports',      mark: 'R', permission: 'finance.reports.read' },
  ],
});
```

Approving is **not** a Finance permission. It lives in the core Admin module
(`admin.requests.decide`, 4.6a), because the owner's rule is that changes go
to the church admin. It also means every future department gets approvals
the same way.

**Check:** reboot the API: the sync reports 9 new Finance permissions. The Portals
page lists Finance as *Off*. Turn it on: three Finance roles appear under Roles.

**Commit:** "Describe the Finance portal".

---

## 4.2 — Tables, constraints and the database's own safety checks

**Do**

1. Models (all tenant models: add each to `TENANT_MODELS` **and** to `TENANT_PLANE_MODELS` (02 step 2.4b), and give each the row-level security template from 02 step 2.4a in this migration. `ChangeRequest` from 4.6a too):

   ```prisma
   enum FinanceKind {
     INCOME
     EXPENSE
   }

   enum FinanceStatus {
     POSTED
     VOIDED
   }

   enum PaymentMethod {
     CASH
     MOBILE_MONEY
     BANK_TRANSFER
     CHEQUE
     CARD
     OTHER
   }

   model FinanceIncomeSource {
     id            String    @id @default(uuid(7)) @db.Uuid
     churchId      String    @map("church_id") @db.Uuid
     name          String    @db.VarChar(80)            // as shown: "Sunday offering"
     nameKey       String    @map("name_key") @db.VarChar(80)  // normalised for matching: "sunday offering"
     description   String    @default("") @db.VarChar(300)
     isActive      Boolean   @default(true) @map("is_active")
     createdById   String    @map("created_by_id") @db.Uuid
     createdAt     DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
     updatedAt     DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)

     @@unique([churchId, nameKey])
     @@map("finance_income_sources")
   }

   model FinanceExpenseItem {
     // identical columns to FinanceIncomeSource
     @@unique([churchId, nameKey])
     @@map("finance_expense_items")
   }

   model FinanceTransaction {
     id              String        @id @default(uuid(7)) @db.Uuid
     churchId        String        @map("church_id") @db.Uuid
     code            String        @unique @db.VarChar(40)       // IRCA-EXP-2026-09-000001
     kind            FinanceKind
     status          FinanceStatus @default(POSTED)
     txnDate         DateTime      @map("txn_date") @db.Date
     periodYear      Int           @map("period_year")
     periodMonth     Int           @map("period_month")
     seq             Int
     amount          Decimal       @db.Decimal(14, 2)
     currency        String        @db.Char(3)
     incomeSourceId  String?       @map("income_source_id") @db.Uuid
     expenseItemId   String?       @map("expense_item_id") @db.Uuid
     method          PaymentMethod
     reference       String?       @db.VarChar(80)               // receipt no., M-Pesa code, cheque no.
     counterparty    String?       @db.VarChar(120)              // who paid (income) / who was paid (expense)
     notes           String?       @db.VarChar(1000)
     /// Generated by the form. A retried submit returns the first entry instead of making a second.
     clientRequestId String        @map("client_request_id") @db.Uuid
     createdById     String        @map("created_by_id") @db.Uuid
     createdAt       DateTime      @default(now()) @map("created_at") @db.Timestamptz(6)
     updatedAt       DateTime      @updatedAt @map("updated_at") @db.Timestamptz(6)
     voidedAt        DateTime?     @map("voided_at") @db.Timestamptz(6)
     voidedById      String?       @map("voided_by_id") @db.Uuid   // the approver
     voidReason      String?       @map("void_reason") @db.VarChar(500)
     /// Starts at 1, and goes up by one each time an approved change is applied.
     revision        Int           @default(1)
     /// The approved change request that made the latest change. The trigger
     /// below refuses any update that does not set this to a newly approved request.
     appliedRequestId String?      @map("applied_request_id") @db.Uuid
     /// When an approved change moved the entry to another month, the old entry is
     /// voided and a new one (new number) is created. These link the two.
     replacesId      String?       @map("replaces_id") @db.Uuid
     replacedById    String?       @map("replaced_by_id") @db.Uuid

     incomeSource FinanceIncomeSource? @relation(fields: [incomeSourceId], references: [id])
     expenseItem  FinanceExpenseItem?  @relation(fields: [expenseItemId], references: [id])

     @@unique([churchId, kind, periodYear, periodMonth, seq])
     @@unique([churchId, clientRequestId])
     @@index([churchId, txnDate(sort: Desc)])
     @@index([churchId, kind, status, txnDate])
     @@index([churchId, incomeSourceId])
     @@index([churchId, expenseItemId])
     @@map("finance_transactions")
   }

   /// Generic per-church counters. Finance uses keys like 'finance:EXP:2026-09';
   /// Membership uses 'membership:member_number'.
   model ChurchSequence {
     churchId  String   @map("church_id") @db.Uuid
     key       String   @db.VarChar(80)
     lastValue Int      @default(0) @map("last_value")
     updatedAt DateTime @default(now()) @map("updated_at") @db.Timestamptz(6)

     @@id([churchId, key])
     @@map("church_sequences")
   }
   ```

2. `npx prisma migrate dev --name finance --create-only`, then **append** this
   SQL to the migration. These rules hold even if application code is wrong:

   ```sql
   create extension if not exists pg_trgm;

   -- Typo-tolerant suggestions ("electrcity" still finds "Electricity bill").
   create index finance_expense_items_name_trgm on finance_expense_items using gin (name_key gin_trgm_ops);
   create index finance_income_sources_name_trgm on finance_income_sources using gin (name_key gin_trgm_ops);

   alter table finance_transactions
     add constraint finance_txn_amount_positive check (amount > 0),
     add constraint finance_txn_one_target check (
       (kind = 'INCOME'  and income_source_id is not null and expense_item_id is null) or
       (kind = 'EXPENSE' and expense_item_id  is not null and income_source_id is null)),
     add constraint finance_txn_period_matches_date check (
       period_year = extract(year from txn_date) and period_month = extract(month from txn_date)),
     add constraint finance_txn_void_consistent check (
       (status = 'VOIDED') = (voided_at is not null)),
     add constraint finance_txn_code_shape check (code ~ '^[A-Z][A-Z0-9]{1,9}-(INC|EXP)-[0-9]{4}-[0-9]{2}-[0-9]{6,}$');

   -- Entries are never deleted: voiding is the only way to take one out of the totals.
   revoke delete, truncate on table finance_transactions from irca_app;

   -- A posted entry changes only through a change request an administrator has
   -- approved (D17). Some things never change at all, and a void is final.
   create function finance_txn_guard() returns trigger as $$
   begin
     -- Never, not even with approval: the number and what it encodes.
     if new.code <> old.code or new.kind <> old.kind or new.seq <> old.seq
        or new.period_year <> old.period_year or new.period_month <> old.period_month
        or new.church_id <> old.church_id or new.currency <> old.currency
        or new.created_by_id <> old.created_by_id or new.client_request_id <> old.client_request_id then
       raise exception 'finance_transactions: the number and kind of % never change', old.code;
     end if;
     if old.status = 'VOIDED' then
       raise exception 'finance_transactions: % was voided and cannot change', old.code;
     end if;
     -- Anything else needs a newly approved, not yet applied, request for this entry.
     if new.applied_request_id is not distinct from old.applied_request_id
        or not exists (select 1 from change_requests r
                       where r.id = new.applied_request_id and r.church_id = old.church_id
                         and r.entity_type = 'finance_transaction' and r.entity_id = old.id::text
                         and r.status = 'APPROVED' and r.applied_at is null) then
       raise exception 'finance_transactions: % can only change through an approved change request', old.code;
     end if;
     if new.revision <> old.revision + 1 then
       raise exception 'finance_transactions: revision of % must go up by one', old.code;
     end if;
     return new;
   end $$ language plpgsql;

   create trigger finance_txn_guard before update on finance_transactions
     for each row execute function finance_txn_guard();

   -- A church's code is printed on its entries, so it is frozen once there are any.
   create function church_code_guard() returns trigger as $$
   begin
     if new.code <> old.code and exists (select 1 from finance_transactions where church_id = old.id) then
       raise exception 'churches: code % is used on finance entries and cannot change', old.code;
     end if;
     return new;
   end $$ language plpgsql;

   create trigger church_code_guard before update on churches
     for each row execute function church_code_guard();
   ```

   The trigger refers to `change_requests`, which is created in 4.6a. **Put
   4.6a's table in this same migration, before the trigger.**

   Why can the *date* change but not the *month*? The month is part of the
   number. An approved change that moves an entry to another month is applied
   as "void the old entry, create a new one in the new month, and link them"
   (4.6a), so every number still tells the truth.
3. Apply it, then run the Check.

**Check** (as `irca_app` in psql, on a test row): `delete from
finance_transactions` → permission denied; `update … set notes = 'x'` → the
"approved change request" message. **Even notes cannot be changed directly.**

**Commit:** "Store finance entries so they cannot be deleted or rewritten".

---

## 4.3 — Shared helpers: the code format, names, money

**Do** — `packages/shared/src/finance/`:

1. `code.ts`:

   ```ts
   export type FinanceKindCode = 'INC' | 'EXP';
   export const kindCode = (k: 'INCOME' | 'EXPENSE'): FinanceKindCode => (k === 'INCOME' ? 'INC' : 'EXP');

   /** IRCA-EXP-2026-09-000001. Past 999,999 in one month the counter simply grows a digit. */
   export function formatTransactionCode(p: { churchCode: string; kind: 'INCOME' | 'EXPENSE';
                                              year: number; month: number; seq: number }): string {
     return [p.churchCode, kindCode(p.kind), String(p.year),
             String(p.month).padStart(2, '0'), String(p.seq).padStart(6, '0')].join('-');
   }

   const CODE_RE = /^([A-Z][A-Z0-9]{1,9})-(INC|EXP)-(\d{4})-(\d{2})-(\d{6,})$/;
   export function parseTransactionCode(code: string) { /* returns the parts or null */ }

   /** The sequence key for a kind and month: 'finance:EXP:2026-09'. */
   export const sequenceKey = (kind: 'INCOME' | 'EXPENSE', year: number, month: number) =>
     `finance:${kindCode(kind)}:${year}-${String(month).padStart(2, '0')}`;
   ```

   Tests: `seq 1` → `000001`; `seq 1234567` → `1234567`; month 9 → `09`;
   parse(format(x)) = x; lowercase or wrong shapes → null.
2. `names.ts`:

   ```ts
   /** How an item is shown: tidy spaces, keep the person's capitalisation. */
   export const tidyName = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim();
   /** How items are matched: "  Electricity  BILL " and "electricity bill" are the same item. */
   export const nameKey = (s: string) => tidyName(s).toLocaleLowerCase('en');
   ```

3. `money.ts`:

   ```ts
   /** Up to 12 digits and 2 decimals, commas allowed while typing: "150,000" or "150000.50". */
   export const AmountSchema = z.string().trim()
     .transform(s => s.replace(/,/g, ''))
     .pipe(z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, 'Enter an amount like 150000 or 150000.50'))
     .refine(s => Number(s) > 0, 'The amount must be more than zero');

   /** 150000 → "150,000"; "150000.5" → "150,000.50". Display only; never compute with the result. */
   export function formatMoney(amount: string, currency = 'TZS'): string { /* Intl.NumberFormat('en-TZ') */ }
   ```

   **Rule for everyone:** amounts are strings everywhere outside SQL. Totals
   come from `sum()` in Postgres, never from adding numbers in JavaScript.
4. `schemas.ts`: `CreateTransactionSchema` (discriminated on `kind`:
   income requires `incomeSourceId`, expense requires `expenseItemId`),
   `txnDate` as `YYYY-MM-DD`, `method`, optional `reference` (≤80),
   `counterparty` (≤120), `notes` (≤1000), and `clientRequestId` (uuid).
   Also `FinanceChangeRequestSchema` (`action: 'EDIT' | 'VOID'`, `proposed` as a
   partial of the create schema without `kind` or `clientRequestId`, and
   `reason` 5–500 chars),
   `CreateCatalogItemSchema { name: 2–80 after tidyName, description ≤300,
   confirmDistinct?: boolean }`.

**Commit:** "Share the entry number format and money rules".

---

## 4.4 — The number allocator

**Goal:** numbers are unique, have no gaps, and stay correct when two clerks
save at the same moment.

**How it works:** the counter row for (church, `finance:EXP:2026-09`) is
incremented **inside the same database transaction** that inserts the entry.
Postgres locks that one counter row until the transaction commits, so a second
clerk saving an expense in the same month waits a few milliseconds and then
gets the next number. If the insert fails and the transaction rolls back, the
increment rolls back with it, which is why there are no gaps. Income and
expenses, and different months, use different rows, so they never wait for
each other.

**Do** — `src/modules/finance/sequence.service.ts` (shared with Membership
later, so consider placing it in `src/core/sequences/`):

```ts
// sketch
async next(tx: TenantTx, key: string): Promise<number> {
  const churchId = this.auth.churchId;
  const rows = await tx.$queryRaw<{ last_value: number }[]>`
    -- tenant: church_id = ${churchId}
    insert into church_sequences (church_id, key, last_value, updated_at)
    values (${churchId}::uuid, ${key}, 1, now())
    on conflict (church_id, key)
    do update set last_value = church_sequences.last_value + 1, updated_at = now()
    returning last_value`;
  return rows[0]!.last_value;
}
```

**Never** call `next` outside a transaction that also inserts the entry, or
you will create gaps.

**Check** — e2e `test/finance/sequence.e2e-spec.ts`: fire **50 expense
creates in parallel** (`Promise.all`) for September plus 10 incomes. Expect
expense codes `…-EXP-2026-09-000001` to `…-000050`, all distinct and
consecutive, and incomes `000001`–`000010`. Then make the 51st fail after
allocation (for example, an invalid item id that fails the FK), and the
next successful one is still `000051`.

**Commit:** "Number entries per month without gaps, even under load".

---

## 4.5 — Income sources and expense items API

Both lists behave identically. Build it once as a generic `CatalogService`
parameterised by the model, with two thin controllers:
`/v1/finance/income-sources` and `/v1/finance/expense-items`.

**Endpoints**

| Method & path | Permission | What it does |
| --- | --- | --- |
| `GET /…/suggest?q=&limit=8` | `finance.catalog.read` | Suggestions while typing (below). |
| `GET /…?q=&status=active\|inactive\|all&page=` | `finance.catalog.read` | The list page, with `uses` (all time) and `lastUsedOn`. |
| `POST /…` | `finance.catalog.create` | Create (duplicate rules below). |
| `PATCH /…/:id` `{ name?, description? }` | `finance.catalog.manage` | Rename or re-describe. The same duplicate rules apply to the new name. |
| `POST /…/:id/deactivate`, `/…/:id/activate` | `finance.catalog.manage` | Turned-off items are not suggested and cannot be used for new entries. Past entries keep them. |

There is **no delete**. An item used by an entry must exist forever, and an
unused one can simply be turned off.

**Suggest query** (raw SQL, because of trigram similarity):

```sql
-- tenant: church_id = $1
select i.id, i.name, i.description,
       (i.name_key like $2 || '%')           as starts_with,
       similarity(i.name_key, $2)            as score,
       coalesce(u.uses, 0)                   as uses
from finance_expense_items i
left join lateral (
  select count(*)::int as uses from finance_transactions t
  where t.church_id = i.church_id and t.expense_item_id = i.id
    and t.status = 'POSTED' and t.txn_date > current_date - 180
) u on true
where i.church_id = $1 and i.is_active
  and ($2 = '' or i.name_key like '%' || $2 || '%' or i.name_key % $2)
order by starts_with desc, score desc, uses desc, i.name
limit $3;
```

- `$2` is `nameKey(q)`. An empty `q` (the field just focused) returns the
  most-used items, so the common ones are one click away.
- The response also says whether an **exact** match exists
  (`exact: { id, name, isActive } | null`), which drives the "Create" option in
  the UI.
- The lateral count is fine for hundreds of items. If a church ever has
  thousands, replace it with a `use_count` column maintained on insert. Do not
  optimise before then.

**Create rules** (in this order):

1. `name` → `tidyName`, and `key` → `nameKey`. Reject a name under 2 characters.
2. **Exact match** on `(church, nameKey)`:
   - active → `409 ALREADY_EXISTS` with `details: { existing: { id, name } }`.
     The UI simply selects it.
   - inactive → `409 ALREADY_EXISTS` with `details: { existing, inactive: true }`.
     The UI says "turned off, ask a finance manager".
3. **Similar match** (`similarity(name_key, key) >= 0.5`, top 3), unless the
   body says `confirmDistinct: true` → `409 SIMILAR_EXISTS` with
   `details: { candidates: [{ id, name }] }`. This is what stops "Electricity",
   "Electricity bill" and "Umeme" from becoming three items by accident.
4. Insert, audit `finance.catalog.created`, return `201 { id, name, description }`.
5. The unique index is the final word: a concurrent identical create gets
   `P2002` → the filter maps it to `409 CONFLICT`, and the UI re-runs suggest and selects.

**Commit (several):** "List and suggest expense items and income sources";
"Add items without creating near-duplicates"; "Rename and turn off items".

---

## 4.6 — Transactions API

**Endpoints**

| Method & path | Permission |
| --- | --- |
| `POST /v1/finance/transactions` | `finance.transactions.create` |
| `GET /v1/finance/transactions?…` | `finance.transactions.read` |
| `GET /v1/finance/transactions/:code` | `finance.transactions.read` |
| `POST /v1/finance/transactions/:code/change-requests` | `finance.transactions.request_change` (4.6a) |
| `GET /v1/finance/transactions/export.csv?…` | `finance.transactions.export` |

**Create** (`TransactionService.create`):

1. Validate with `CreateTransactionSchema`.
2. **Idempotency:** if an entry with this `clientRequestId` exists for the
   church, return it with `200` (not `201`) and do nothing else. The form
   generates the id once per entry, so a double-click or a retry after a
   dropped connection cannot create two expenses.
3. **Date rules:** `txnDate` must not be after *today in the church's
   timezone*, and not before 2000-01-01. (Entries more than 60 days old are
   allowed, and the UI asks for confirmation.)
4. The item or source must exist in this church (tenant scoping makes a foreign
   id "not found") and be active → otherwise `422 ITEM_NOT_AVAILABLE`.
5. In **one** `db.tx(...)` (2.4a: it also sets the church for row-level security):
   - read the church's `code` and `currency`;
   - `seq = sequences.next(tx, sequenceKey(kind, y, m))` (4.4);
   - `code = formatTransactionCode(...)`;
   - insert the entry, with `periodYear/Month` from `txnDate`, `currency` from
     the church, and `createdById = auth.userId`;
   - `audit.recordIn(tx, { action: 'finance.transaction.created', entityType:
     'finance_transaction', entityId: code, summary: 'Recorded expense
     IRCA-EXP-2026-09-000014 · Generator fuel · TZS 150,000', after: {...} })`.
6. After commit: `usage.inc('finance.transactions.created')`.
7. Return `201` with the full entry (amount as a string).

**List** query parameters: `kind`, `status` (default `POSTED`; `all` includes
voided), `from`, `to` (dates), `incomeSourceId`, `expenseItemId`, `method`,
`q` (matches code, reference, counterparty or notes, case-insensitive),
`page`, `pageSize` (≤100), `sort` (`date_desc` default, `date_asc`,
`amount_desc`, `amount_asc`). The response includes the page **and totals for
the whole filtered set** (`incomeTotal`, `expenseTotal`, `net`, `count`),
computed in SQL on posted entries only.

**There is no edit or void endpoint.** Every correction, including a void,
is a change request (4.6a).

**Export:** streams CSV with the list filters applied: `Code, Date, Kind,
Source or item, Amount, Currency, Method, Reference, Payer/Payee, Notes,
Status, Recorded by, Recorded at, Voided at, Void reason`. **Protect against
CSV formula injection:** prefix any cell starting with `=`, `+`, `-`, `@`, tab
or CR with `'`. Record audit `finance.transactions.exported` with the filters
(`recordNow`, since this is a GET). The filename is
`IRCA-finance-2026-09-01-to-2026-09-30.csv`.

**Commits:** "Record income and expenses with their numbers"; "List and find
entries with totals"; "Download entries as CSV".

---

## 4.6a — Change requests: the core mechanism and Finance's handler

**Goal:** a person asks for a correction, an administrator decides, and the
change is applied exactly as approved. It is built once in core, so Media,
Outreach and every later department use the same inbox.

**Rules (D17)**

| Rule | Why |
| --- | --- |
| Every change to a posted entry, **including voiding it**, is a request. | The owner's rule: to edit finance records, one sends a request to admin. A void changes the totals as much as an edit does. |
| A request carries the **full proposed values** and a **reason** (5–500 characters). | The approver sees exactly what will happen, and why. |
| Only holders of `admin.requests.decide` (Church administrators) approve or reject. | "Send the request to admin." |
| **Nobody decides their own request**, even if they are an administrator. | Four eyes on money. If the church has one administrator, they must add a second before they can approve their own corrections. The API says so. |
| One open request per entry at a time. | Two requests racing on one entry would each be approved against a stale "before". |
| The request is re-validated when approved (the item is still active, the date is not in the future). | Things change between asking and deciding. |
| A rejected request changes nothing, and needs a note from the approver. | The requester learns why. |
| The requester can cancel while it is pending. | |
| Every step is audited, and the approver and requester get an email. | |

**Do**

1. Core model (a tenant model, so add it to `TENANT_MODELS`), in the Finance
   migration before the trigger:

   ```prisma
   enum ChangeRequestStatus {
     PENDING
     APPROVED     // decided yes; applied in the same transaction
     REJECTED
     CANCELLED
   }

   /// A request, from anyone in any module, to change a record that may not be
   /// changed directly. Decided in Admin → Requests.
   model ChangeRequest {
     id           String              @id @default(uuid(7)) @db.Uuid
     churchId     String              @map("church_id") @db.Uuid
     moduleKey    String              @map("module_key") @db.VarChar(40)    // 'finance'
     entityType   String              @map("entity_type") @db.VarChar(60)   // 'finance_transaction'
     entityId     String              @map("entity_id") @db.VarChar(80)     // the entry's id
     entityLabel  String              @map("entity_label") @db.VarChar(120) // 'IRCA-EXP-2026-09-000014'
     action       String              @db.VarChar(20)                       // 'EDIT' | 'VOID'
     /// The record as it was when asked, and the values asked for (only changed fields).
     before       Json
     proposed     Json
     reason       String              @db.VarChar(500)
     status       ChangeRequestStatus @default(PENDING)
     requestedById String             @map("requested_by_id") @db.Uuid
     requestedAt  DateTime            @default(now()) @map("requested_at") @db.Timestamptz(6)
     decidedById  String?             @map("decided_by_id") @db.Uuid
     decidedAt    DateTime?           @map("decided_at") @db.Timestamptz(6)
     decisionNote String?             @map("decision_note") @db.VarChar(500)
     appliedAt    DateTime?           @map("applied_at") @db.Timestamptz(6)
     /// What applying produced, e.g. { newCode: 'IRCA-EXP-2026-08-000003' } after a month move.
     result       Json?

     @@index([churchId, status, requestedAt(sort: Desc)])
     @@index([churchId, entityType, entityId])
     @@map("change_requests")
   }
   ```

   Migration extras:

   ```sql
   create unique index change_requests_one_open on change_requests (church_id, entity_type, entity_id)
     where status = 'PENDING';
   alter table change_requests add constraint change_requests_not_self
     check (decided_by_id is null or decided_by_id <> requested_by_id);
   ```

2. Admin module manifest (`packages/shared/src/modules/admin.ts`). Add
   `'admin.requests.read': { kind: 'read', label: 'See change requests from every portal' }`
   and `'admin.requests.decide': { kind: 'write', label: 'Approve or reject change requests' }`.
   Give both to *Church administrator* and `read` to *Auditor*. Add the nav item
   `{ label: 'Requests', href: '/admin/requests', mark: 'Q', permission: 'admin.requests.read' }`
   as the **first** Admin item.
3. Core service `src/core/change-requests/`:
   - A **handler registry.** A module registers, per `entityType`, a
     `ChangeRequestHandler` with `describe(entityId) → { label, before }`,
     `validate(proposed, before, action)`, and `apply(tx, request) → result`.
     Unknown entity types are refused.
   - `create({ entityType, entityId, action, proposed, reason })`: loads
     `before` through the handler, keeps only fields that really differ
     (`proposed` must not be empty for `EDIT`), validates, inserts (a
     `P2002` on the partial index → `409 REQUEST_ALREADY_OPEN` with the open
     request's id), audits `change_request.created`, and enqueues the email
     `change-request-submitted` to every holder of `admin.requests.decide` in
     the church except the requester.
   - `approve(id, note?)`: in **one** transaction, lock the request (`select
     … for update`). It must be `PENDING`, and the decider must not be the
     requester (`409 CANNOT_DECIDE_OWN_REQUEST`, "Another administrator must
     approve this."). **Re-check that `before` still matches the record**
     (otherwise `409 REQUEST_STALE`, and the request is marked cancelled with the
     note "The entry changed since this was asked"). Validate again, set
     `APPROVED` + `decidedBy/At/Note`, call `handler.apply(tx, request)`, then
     set `appliedAt` and `result`. Audit `change_request.approved`, and email
     `change-request-decided` to the requester.
   - `reject(id, note)` (the note is required), and `cancel(id)` (requester only,
     while `PENDING`).
   - Nothing in core knows about finance. The handler does.
4. Finance's handler, for `entityType: 'finance_transaction'`:
   - **Proposable fields:** `txnDate`, `incomeSourceId` / `expenseItemId`
     (matching the kind), `amount`, `method`, `reference`, `counterparty`,
     `notes`. `kind` cannot be proposed. Income recorded as an expense is fixed
     by voiding it and recording it again.
   - `action: 'VOID'` → `proposed` is `{}`, and applying sets `status =
     VOIDED`, `voidedAt`, `voidedById = approver`, `voidReason = request.reason`,
     `appliedRequestId`, and `revision + 1`.
   - `EDIT` **within the same month** → one `update` with the new values,
     `appliedRequestId = request.id` and `revision = revision + 1` (that is what
     the trigger checks).
   - `EDIT` that **moves the date to another month** → in the same
     transaction: create a new entry with all the new values (new number from
     the new month's sequence, `replacesId = old.id`, `createdById = the
     requester`, a fresh `clientRequestId`), then void the old one
     (`voidReason = 'Replaced by <new code>: <reason>'`, `replacedById`,
     `appliedRequestId`, `revision + 1`). `result = { newCode }`.
   - Audit `finance.transaction.changed` / `.voided` / `.replaced`, with
     before/after, and `requestId` linking to the change request.
   - Count `finance.transactions.voided` and `finance.change_requests.applied`.
5. **Endpoints**

   | Route | Permission |
   | --- | --- |
   | `POST /v1/finance/transactions/:code/change-requests` `{ action, proposed, reason }` | `finance.transactions.request_change` |
   | `GET /v1/finance/change-requests?status=&mine=` | `finance.transactions.read` (Finance's own list, 4.11a) |
   | `POST /v1/finance/change-requests/:id/cancel` | `finance.transactions.request_change`, and only the requester (checked in the service) |
   | `GET /v1/admin/requests?status=&module=` | `admin.requests.read` |
   | `GET /v1/admin/requests/:id` | `admin.requests.read` |
   | `POST /v1/admin/requests/:id/approve` `{ note? }` | `admin.requests.decide` |
   | `POST /v1/admin/requests/:id/reject` `{ note }` | `admin.requests.decide` |

   `/me` gains `badges: { '/admin/requests': <pending count> }` for holders of
   `admin.requests.read`, so the sidebar shows the number, as the design does for
   Applications.
6. Add `REQUEST_ALREADY_OPEN`, `CANNOT_DECIDE_OWN_REQUEST`, `REQUEST_STALE`
   and `ITEM_NOT_AVAILABLE` to `ErrorCode` in `packages/shared`.
7. Two email templates, `change-request-submitted` ("Neema Mollel asks to change
   IRCA-EXP-2026-09-000014: amount 150,000 → 105,000. Reason: typed an extra
   zero. [Review the request]") and `change-request-decided` ("Approved by
   Pastor Sarah" / "Rejected: …").

**Check:** e2e: request → approve (by another admin) → the entry has the new
amount, `revision = 2`, and history shows both steps. Self-approve → 409.
A second request while one is pending → 409. Direct SQL update → the trigger's
error. A month move → the old entry is voided with a link, and a new number
exists in the new month.

**Commits:** "Let any portal ask an administrator to change a protected
record"; "Correct and void finance entries only through approved requests";
"Move an entry to another month by replacing it under a new number"; "Tell
administrators about requests and requesters about decisions".

---

## 4.7 — Overview and report queries

All sums in SQL, voided entries excluded, and amounts returned as strings.
Months are the church's calendar months (`period_year`, `period_month`).

1. **`GET /v1/finance/overview?month=2026-09`** (`finance.overview.read`):
   `{ month, income, expense, net, count, previous: { income, expense, net },
     bySource: [{ id, name, total, share }], topItems: [{ id, name, total,
     share }] (10), trend: [{ month, income, expense }] (last 12 months),
     recent: [...10 entries] }`. `recent` is included only if the caller also
   has `finance.transactions.read`. Otherwise it is `null`, and the page hides
   that card.
2. **`GET /v1/finance/reports/statement?from=&to=`** (`finance.reports.read`):
   income by source, expenses by item, their totals, the net, the entry count,
   and a per-month breakdown for the range. Range ≤ 24 months.
3. **`GET /v1/finance/reports/statement.csv`**: the same numbers as CSV
   (`finance.reports.read`, audited as an export).

**Check:** seed 30 random entries over three months (write a dev-only
`npm run cli -- finance:demo-data --church IRCA` command). The overview's
numbers must equal a hand-written `select sum(amount) …`.

**Commit:** "Summarise finance by month, source and item".

---

## 4.8 — The suggest-or-create field

**Goal:** the one component the finance team uses most. It must be quick,
forgiving of typos, keyboard-friendly, and must never let a free-typed name be
saved as an item that does not exist.

**Behaviour** (build `CatalogCombobox` in
`apps/portal/src/modules/finance/components/`, on Headless UI `Combobox`):

```
Expense item
[ gener|                                   ▾ ]
 ┌───────────────────────────────────────────┐
 │ Generator fuel              used 14 times │  ← best match, highlighted
 │ Generator service            used 2 times │
 │ General cleaning supplies    used 6 times │
 │───────────────────────────────────────────│
 │ ＋ Create expense item "gener"            │  ← only when no exact match AND can('finance.catalog.create')
 └───────────────────────────────────────────┘
```

1. **Props:** `kind: 'income' | 'expense'`, `value: { id, name } | null`,
   `onChange`, `error`.
2. **Focus with an empty box** → show the most-used items (`suggest?q=`).
3. **Typing** → debounce 150 ms → `GET suggest?q=…`. Cancel the previous
   request with an `AbortController`, so a slow early response cannot overwrite
   a later one. Show a small spinner in the field while loading.
4. Each option: the name, "used N times" on the right in `--fg3`, and the
   description underneath if any.
5. **The last option** when `q` is not empty and `exact` is null:
   - with `can('finance.catalog.create')`: **"＋ Create expense item “…”"**;
   - without it: a non-selectable line, "No item called “…”. Ask a finance
     manager to add it."
   - when `exact` exists but is **inactive**: a non-selectable line,
     "“Umeme” is turned off. A finance manager can turn it back on."
6. **Choosing "Create…"** opens a small dialog **on top of the form** (the
   form keeps everything typed so far):

   ```
   New expense item
   Name         [ Generator fuel              ]   ← prefilled with what was typed, tidied
   Description  [ Diesel for the church genera ]   ← optional
                             [Cancel] [Create and use]
   ```

   - `201` → close, select the new item, and move focus to the next field
     (Amount).
   - `409 ALREADY_EXISTS` (someone just created it) → select the existing
     one with the toast "“Generator fuel” already existed. Selected it."
   - `409 SIMILAR_EXISTS` → the dialog changes to:

     ```
     Did you mean one of these?
     [ Use “Generator fuel” ]  [ Use “Generator service” ]
     No, “Genrator fuel” is different → [Create it anyway]   ← sends confirmDistinct: true
     ```

7. **Free text is never a value.** If the person types and tabs away without
   choosing, the field shows the error "Choose an expense item from the list,
   or create it." and the form will not submit. The value is always
   `{ id, name }` from the server.
8. Keyboard: ↑/↓ moves, Enter chooses, Esc closes the list (a second Esc
   clears), and the Create option is reachable by keyboard like any other.
   Screen readers announce "3 suggestions" (Headless UI provides the ARIA
   pattern; add a visually hidden live region for the count).
9. Unit tests (Vitest + Testing Library + a mocked `clientApi`): debounce and
   abort; the create option appears only with the permission; free text blocks
   submission; the similar-name flow calls with `confirmDistinct`.

**Commits:** "Suggest expense items and income sources while typing"; "Create
a missing item without leaving the form".

---

## 4.9 — Record expense / record income page

**Routes:** `/finance/transactions/new?kind=expense` and `?kind=income`, reached
from the "+ Record expense" and "+ Record income" buttons on Overview and
Transactions (each in `<Can permission="finance.transactions.create">`). The
page itself calls `requirePagePermission(me, 'finance.transactions.create')`.

```
Record an expense                                           ← PageHeader
Paid out by International Revival Church Arusha

Date            [ 21/09/2026 ▾ ]            ← defaults to today (church timezone); no future dates
Expense item    [ Generator fuel         ▾ ] ← CatalogCombobox (4.8)
Amount (TZS)    [ 150,000                  ]
Paid by         ( Cash ) (Mobile money) (Bank transfer) (Cheque) (Card) (Other)   ← pill radio group
Reference       [ M-Pesa code, receipt or cheque number ]   optional
Paid to         [ Total Energies Njiro              ]      optional
Notes           [                                   ]      optional

                                   [Cancel]  [Save expense]
```

For income, the labels change: "Record income", "Income source", "Received
by", "Received from".

**Do**

1. Generate `clientRequestId = crypto.randomUUID()` **once when the form
   mounts**, and again only after a successful save, when "Record another" is clicked.
2. **Amount field:** `inputMode="decimal"`. Allow digits, one dot and commas
   while typing. On blur, reformat with thousands separators. Validate with
   `AmountSchema`. Show the currency from `me.church.currency`.
3. **Date older than 60 days** → on save, a confirm dialog: "This entry is
   dated 12 June 2026, more than 60 days ago. It will be numbered as a June
   entry (IRCA-EXP-2026-06-…). Save it?"
4. On save → `POST /api/finance/transactions`. Success replaces the form with:

   ```
   ✓ Saved as IRCA-EXP-2026-09-000014
     Generator fuel · TZS 150,000 · Cash · 21 Sept 2026
     [Record another expense]   [View entry]
   ```

   "Record another" **keeps the date and payment method** (clerks usually
   enter a stack of receipts from one day), clears the rest, and focuses the item field.
5. Field errors from `VALIDATION_FAILED` appear under their fields. A `422
   ITEM_NOT_AVAILABLE` (turned off meanwhile) shows under the item field.
6. Leaving the page with unsaved input asks "Discard this entry?"
   (`beforeunload` plus an intercept on in-app links).

**Check:** record 3 expenses from one day using "Record another": the date and
method stick, and the numbers go 000001, 000002, 000003. Double-click Save
fast: only one entry is created. Type a new item name, create it in the
dialog, save: done without leaving the page.

**Commits:** "Record an expense or income from one form"; "Keep the day and
method when recording several entries".

---

## 4.10 — Transactions page

**Route:** `/finance/transactions`.

```
Transactions                                  [Export CSV]  [+ Record income] [+ Record expense]
All · Income · Expenses          This month ▾   [Source or item ▾] [Method ▾]  ☐ Show voided
[ Search number, reference, payer or payee… ]

 Number                     Date        Source / item      Payer / payee        Method    Amount
 IRCA-EXP-2026-09-000014    21 Sept     Generator fuel     Total Energies Njiro Cash    −150,000
 IRCA-INC-2026-09-000031    20 Sept     Sunday offering    —                    Cash   +2,340,000
 IRCA-EXP-2026-09-000009    18 Sept     Electricity bill   TANESCO              M-money  −86,500  [Voided]  ← struck through
 ──────────────────────────────────────────────────────────────────────────────────────────────
 38 entries · Income 4,820,000 · Expenses 1,215,500 · Net 3,604,500              ‹ 1 2 ›
```

**Do**

1. A server component, with live filters in the URL (same pattern as the
   People page, 3.7).
2. Date presets: This month (default), Last month, This year, Last year,
   Custom (two date inputs). Everything is computed in the church's timezone on
   the server.
3. Codes in a monospace font (`font-variant-numeric: tabular-nums` for
   amounts too). Income amounts in `--pos` with `+`, expenses in `--fg` with
   `−`, voided rows struck through with a "Voided" badge.
4. The totals line uses the API's totals for the **whole filtered set**, not
   just this page.
5. Buttons in `<Can>`: Export (`finance.transactions.export`), the two record
   buttons (`finance.transactions.create`).
6. Clicking a row opens `/finance/transactions/[code]`.

**Commit:** "Add the Transactions page".

---

## 4.11 — Transaction page: details and requesting a change

**Route:** `/finance/transactions/[code]`.

```
← Transactions
IRCA-EXP-2026-09-000014                    [Posted]        [Request a change ▾]  ← <Can request_change>
Expense · Generator fuel                                      ├ Correct this entry
TZS 150,000                                                   └ Void this entry

┌ Change requested by you on 21 Sept, 11:05 — waiting for an administrator ─────┐   ← only while pending
│ Amount  150,000 → 105,000      Reason: typed an extra zero       [Cancel request] │
└──────────────────────────────────────────────────────────────────────────────────┘

Date          21 September 2026
Paid by       Cash
Reference     —
Paid to       Total Energies Njiro
Notes         For the Sunday service generator
Recorded by   Neema Mollel · 21 Sept 2026, 10:42
Revision      2 · last changed 22 Sept by request, approved by Pastor Sarah

History
  21 Sept 10:42  Neema Mollel recorded this entry
  21 Sept 11:05  Neema Mollel asked to change the amount: "typed an extra zero"
  22 Sept 09:14  Pastor Sarah approved: amount 150,000 → 105,000
```

**Do**

1. `GET /api/finance/transactions/:code` includes `openRequest` (the pending
   change request, if any) and `revision`. A 404 (unknown code, or another
   church's) shows "No entry with that number."
2. **No field on this page is editable.** Everything goes through the menu:
   - **Correct this entry** opens a form **prefilled with the current values**
     (the same fields and components as 4.9, including the item combobox),
     plus a required **Reason** ("What was wrong?"). Only changed fields are
     sent, and "Send request" stays disabled until something has changed. If the
     new date is in another month, a warning shows under it: "This moves the
     entry to August. When approved, it gets a new number (IRCA-EXP-2026-08-…),
     and this one is voided and points to it."
   - **Void this entry** opens a dialog with a required reason: "Ask an
     administrator to void IRCA-EXP-2026-09-000014? If approved, it stays in
     the records with its number and stops counting in totals. This can't be
     undone."
   - Both send `POST …/change-requests`, then show the pending banner with
     **Cancel request** (only for the requester).
   - While a request is open, the menu is disabled, with the text "A change is
     already waiting for approval."
3. A voided entry shows the banner "Voided on 22 Sept, approved by Pastor
   Sarah: Entered twice — duplicate of 000013". A replaced entry shows "Moved to
   August as **IRCA-EXP-2026-08-000003**" (a link), and the new entry shows
   "Replaces IRCA-EXP-2026-09-000014".
4. History comes from `GET /v1/finance/transactions/:code/history`
   (`finance.transactions.read`), read through `AuditQueries.forChurch()`: the
   entry's own events plus its change requests' events.

**Commit:** "Show an entry and ask an administrator to correct or void it".

---

## 4.11a — Requests: the Admin inbox and Finance's list

**Admin → Requests** (`/admin/requests`, the first Admin item, with a count badge):

```
Requests                                   Pending (3) · Approved · Rejected · All      Portal: any ▾
Changes people have asked for. Nothing changes until an administrator approves.

┌ FINANCE · Correct IRCA-EXP-2026-09-000014 ────────────────── asked 2 hours ago ─┐
│ Neema Mollel (Finance clerk): "typed an extra zero"                              │
│   Amount        150,000   →  105,000                                             │
│                                              [Reject…]  [Approve]                │  ← <Can admin.requests.decide>
└──────────────────────────────────────────────────────────────────────────────────┘
┌ FINANCE · Void IRCA-EXP-2026-09-000009 ─────────────────────── asked yesterday ─┐
│ Kaka Allord (you): "Entered twice — duplicate of 000008"                         │
│ You asked for this. Another administrator must decide.                           │  ← no buttons for own request
└──────────────────────────────────────────────────────────────────────────────────┘
```

1. Each card shows the module, the action and the entry (linked), who asked
   and their role, the reason, and a **before → after** table of only the
   changed fields, with names instead of ids (item names, method labels,
   formatted amounts). A month move shows the warning line from 4.11.
2. **Approve** asks for confirmation ("Change the amount of
   IRCA-EXP-2026-09-000014 to 105,000?") with an optional note. **Reject…**
   requires a note. After deciding, the card moves to its tab, and a toast
   shows the result (for a month move: "Now IRCA-EXP-2026-08-000003").
3. `409 REQUEST_STALE` → the card updates with "The entry changed since this
   was asked. The request was withdrawn."
4. The Portal filter is there for the future (Media, Outreach…). With only
   Finance using requests, it shows one option.

**Finance → Requests** (`/finance/requests`, `finance.transactions.read`):
Finance's own requests, read-only, with a **Only mine** toggle so clerks can
follow what they asked for. There are no approve buttons here, ever: deciding
happens in Admin.

Built as a **table with expandable rows**, not cards: a row says what is asked,
about which entry, by whom, when and where it stands, and the reason, the
before → after and the decision open underneath the one you are looking at.
Cards made a reader wade through everything about every request to find the
one they wanted (owner's words: "one needs to look around all those thrown in
data before understanding what they are even talking about"). The Admin inbox
keeps its cards, because deciding needs the whole request in view at once.

**Commits:** "Add the administrators' Requests inbox"; "Let finance staff
follow the changes they asked for".

---

## 4.12 — Lists page (income sources and expense items)

**Route:** `/finance/lists`, with tabs **Expense items** | **Income sources**.

```
Lists                                                              [+ New expense item]
Expense items · Income sources
[ Search… ]   Active ▾

 Name                  Description                 Used    Last used     
 Generator fuel        Diesel for the generator      14    21 Sept 2026   [Rename] [Turn off]
 Electricity bill      TANESCO                        9    18 Sept 2026   [Rename] [Turn off]
 Umeme                                                1     2 Aug 2026    [Rename] [Turn off]   ← obvious duplicate
```

**Do**

1. Rename and Turn off in `<Can finance.catalog.manage>`, and + New in
   `<Can finance.catalog.create>` (it reuses the create dialog and similar-name
   flow from 4.8).
2. Rename dialog note: "Past entries will show the new name."
3. Turn off dialog: "“Umeme” won't be suggested and can't be used for new
   entries. Its 1 past entry keeps it."
4. **Duplicates:** there is no "merge" in this phase (it would need to change
   posted entries, which the trigger forbids by design). The fix for a duplicate
   is: turn it off, and use the right one from now on. If the finance team asks
   for merging, it becomes a reporting-level "counts as" mapping, and that is a
   later decision.

**Commit:** "Let finance managers tidy their lists".

---

## 4.13 — Overview page

**Route:** `/finance` (the module home).

```
Finance                                        ‹ September 2026 ›   [+ Record income] [+ Record expense]
Income and expenses for International Revival Church Arusha

┌ Income ──────────┐ ┌ Expenses ────────┐ ┌ Net ─────────────┐ ┌ Entries ─┐
│ 4,820,000        │ │ 1,215,500        │ │ 3,604,500        │ │ 38       │
│ +12% vs August   │ │ −4% vs August    │ │                  │ │          │
└──────────────────┘ └──────────────────┘ └──────────────────┘ └──────────┘

Last 12 months                              Income by source           
 ▇▇ ▆▆ ▇▇ ...  (paired bars: income/expense)   Tithe            ███████████  2,900,000  60%
                                               Sunday offering  ██████       1,340,000  28%
Top expenses this month                        Harambee         ██             580,000  12%
 Generator fuel ███ 450,000
 Electricity    ██  260,000                  Recent entries                  See all →
 ...                                          IRCA-EXP-2026-09-000014 · Generator fuel · −150,000
```

**Do**

1. Use the design's stat tiles and bar style (CSS bars, `--neutral-bar`, and
   `--accent` for highlights). No chart library is needed for this.
2. The month switcher updates `?month=` in the URL.
3. The percentage change is hidden when the previous month is 0 (no "+∞%").
4. The Recent entries card appears only when the API returned it (4.7).
5. The empty state for a new church: "No entries yet. Record your first income
   or expense." plus the buttons (in `<Can>`).

**Commit:** "Add the Finance overview".

---

## 4.14 — Reports page

**Route:** `/finance/reports`.

**Do**

1. A date range, with presets (This month, Last month, This quarter, This
   year, Last year, Custom).
2. A statement layout:

   ```
   International Revival Church Arusha — Statement, 1 Sept 2026 to 30 Sept 2026
   INCOME                                   EXPENSES
   Tithe                  2,900,000         Generator fuel           450,000
   Sunday offering        1,340,000         Electricity bill         260,000
   Harambee                 580,000         ...
   Total income           4,820,000         Total expenses         1,215,500
                                            NET                    3,604,500
   Per month (only when the range spans more than one month): table of month / income / expense / net
   38 entries · voided entries excluded · printed 21 Sept 2026 by Kaka Allord
   ```

3. **Print:** a print stylesheet hides the sidebar, top bar and buttons,
   uses black on white, and repeats the church name and range at the top. The
   *Print* button calls `window.print()`.
4. **Download CSV** (`finance.reports.read`) → `statement.csv`.

**Commit:** "Add a printable finance statement".

---

## 4.15 — The RBAC walkthrough

**Goal:** prove, by hand and in a browser, that access works exactly as
designed, using real invitations. Do this on a fresh database
(`npm run db:reset && npm run db:seed`) with `EMAIL_PROVIDER=log`. Record the
results in the phase PR as a filled-in copy of the tables below.

### Setup (as `admin@irca.local`, Church administrator)

1. Portals → turn **Finance on**. Roles now lists Finance viewer, clerk and manager.
2. People → invite **three** people, following each link from the API console
   in a **separate private window**, and set their passwords:
   - `mhazini@example.com`: *Finance manager*
   - `clerk@example.com`: *Finance clerk* (if the seed already made
     `clerk@irca.local`, use a new address; the point is the email flow)
   - `viewer@example.com`: *Finance viewer*
3. Roles → Finance → **New role** "Recorder (no new items)" with: overview,
   transactions.read, transactions.create, catalog.read, reports.read (no
   `catalog.create`, no `request_change`). Invite `recorder@example.com` with it.
4. Invite a **second Church administrator**, `pastor2@example.com`. Approvals
   need someone other than the requester.

### What each person must be able to do

Tick ✓ (allowed and works) or ✗ (hidden in the UI **and** refused by the API).
To test the API side of every ✗, use DevTools: copy the "Save" request as
`fetch` from a person who *can*, and replay it in a person who can't. It must
return `403 FORBIDDEN`.

| Action | Manager | Clerk | Recorder | Viewer | Church admin (no finance role) |
| --- | --- | --- | --- | --- | --- |
| See Finance in the sidebar | ✓ | ✓ | ✓ | ✓ | ✗ |
| Open Overview | ✓ | ✓ | ✓ | ✓ | ✗ (403 page) |
| See Transactions list | ✓ | ✓ | ✓ | ✓ | ✗ |
| Record an expense with an existing item | ✓ | ✓ | ✓ | ✗ | ✗ |
| Type a new item → "Create" offered | ✓ | ✓ | ✗ ("Ask a finance manager") | ✗ | ✗ |
| Change any field of an entry directly | ✗ | ✗ | ✗ | ✗ | ✗ (no such button or endpoint, for anyone) |
| Request a correction or a void | ✓ | ✓ | ✗ | ✗ | ✗ |
| See Finance → Requests | ✓ | ✓ | ✓ | ✓ | ✗ |
| Approve / reject in Admin → Requests | ✗ | ✗ | ✗ | ✗ | ✓ (never their own request) |
| Export CSV | ✓ | ✗ | ✗ | ✗ | ✗ |
| Rename / turn off an item | ✓ | ✗ | ✗ | ✗ | ✗ |
| See Reports and print | ✓ | ✓ | ✓ | ✓ | ✗ |
| Open Admin | ✗ | ✗ | ✗ | ✗ | ✓ |

### Numbering

1. As the clerk, record 2 September expenses and 1 September income: expect
   `IRCA-EXP-2026-09-000001`, `…-000002`, `IRCA-INC-2026-09-000001`.
2. Record an expense dated **31 August**: expect `IRCA-EXP-2026-08-000001`
   (the date decides the month) and the 60-day warning only if it applies.
3. As the manager, **request** a void of `IRCA-EXP-2026-09-000002`, and as
   the church admin approve it in Admin → Requests. Record another expense:
   expect `…-000003`. The voided number is never reused.

### Change requests

1. As the clerk, request a correction of `…-000001`'s amount, with a reason.
   The entry page shows the pending banner, and the admin gets an email and a
   badge on **Requests**.
2. The church admin approves: the amount changes, the revision becomes 2, the
   history shows the request and the approval, and the clerk gets an email.
3. As the clerk, request a date change of `…-000003` to **15 August**. When
   approved, it becomes `IRCA-EXP-2026-08-000002`, and `…-2026-09-000003` is
   voided with "Replaced by IRCA-EXP-2026-08-000002".
4. As the church admin, add yourself the Finance clerk role (Q1), request a
   void, and try to approve it yourself: the card says "Another administrator
   must decide", and replaying the approve `POST` returns
   `409 CANNOT_DECIDE_OWN_REQUEST`. `pastor2` approves it.
5. Request, then reject with a note: nothing changes, and the clerk sees the note.
6. In psql as `irca_app`, `update finance_transactions set notes = 'x'` →
   the trigger refuses it.

### Impersonation (read-only)

1. As the church admin: People → the clerk → **View as** (one click). Expect
   the banner, the Finance sidebar, **no** Record or Request-a-change buttons anywhere,
   and the lists page with no Create/Rename.
2. In DevTools, replay a create-expense `POST` → `403 IMPERSONATION_READ_ONLY`.
3. Stop viewing. Sign in as the clerk: **nothing anywhere** shows she was
   viewed. Admin → Activity does not show it either. As the dev, open
   `/platform/impersonations`: `log --since 1h --views` shows the admin's START,
   every page viewed, and the END.
4. As the **dev** (`dev@irca.local`), in the dev console (Phase 6; until
   then via the API), view as the manager of IRCA: same read-only behaviour,
   and the manager's Request-a-change menu is **not** shown. View as the
   church admin: Requests shows the pending cards with **no** Approve buttons.

### Switching Finance off

1. Admin → Portals → turn Finance off while the clerk has the Overview open in
   another window. The clerk's next click shows the 403 state, and the sidebar
   loses Finance.
2. Turn it back on: the clerk has the same role again, and all entries are intact.

### A second church

1. `npm run cli -w @irca/api -- church:create --code TEST --slug test --name "Test Church" --admin-email t-admin@example.com --admin-name "Test Admin"`.
2. Accept that invitation, turn on Finance in TEST, and record an expense:
   expect `TEST-EXP-2026-09-000001`, numbered independently of IRCA.
3. As TEST's admin, try `GET /api/finance/transactions/IRCA-EXP-2026-09-000001`
   → 404. The expense item suggestions contain none of IRCA's items.
4. Invite `clerk@example.com` (already an IRCA user) to TEST as viewer: the
   email says "Open IRCA Admin" (no password step). After accepting, the church
   switcher appears, and the person is a clerk in IRCA and a viewer in TEST.

**Commit:** the filled-in tables go in the PR description, not the repository.

---

## 4.16 — Automated tests

**API e2e** (`test/finance/*.e2e-spec.ts`):

- **Permission matrix, generated:** for each of the four roles above plus
  "no finance role", call every finance route, and assert 2xx or 403 against a
  table in the test file that mirrors 4.15. A new route without a row in the
  table fails the test.
- Numbering: the 50-parallel test (4.4); month from the date; separate INC/EXP
  counters; a void does not free a number; a TEST church numbers independently.
- Idempotency: the same `clientRequestId` twice → one row, and the second
  response is `200` with the same code.
- Date: tomorrow (church timezone) → 422; `2026-09-30` at 23:30
  Africa/Dar_es_Salaam is still September.
- Catalog: exact duplicate → 409 `ALREADY_EXISTS`; "Electricty bill" →
  409 `SIMILAR_EXISTS` with "Electricity bill" among the candidates;
  `confirmDistinct` → 201; inactive items are not suggested and cannot be used.
- Database guards: as `irca_app`, `delete` fails, and **any** direct `update`
  (amount, notes, status) fails without an approved, unapplied change request.
  Reusing an already applied request id fails too.
- Change requests: create → approve by another admin → applied, with revision + 1;
  self-approval → 409 (API) and the check constraint also refuses it (DB); a second
  open request → 409; approval after the entry changed → 409 `REQUEST_STALE`;
  approval re-validates (item turned off meanwhile → 422, and the request stays
  pending); a month move creates a new number in the right month and voids the old
  one with both links; reject needs a note; only the requester can cancel; a
  holder of `admin.requests.read` without `decide` → 403 on approve; emails are
  enqueued to every approver except the requester.
- Totals: the overview equals raw SQL sums with voided entries excluded.
- CSV: a notes value `=HYPERLINK(...)` comes out as `'=HYPERLINK(...)`.
- Impersonation: every finance write route → 403 `IMPERSONATION_READ_ONLY`.
- Tenancy: church B cannot read, suggest, export or request changes to church
  A's data, and B's admin cannot see or decide A's requests.

**Playwright** (`e2e/finance.spec.ts`):

1. A clerk records an expense by typing a new item, creating it in the dialog,
   and saving. The success panel shows `IRCA-EXP-…-000001`.
2. A recorder types a new item and sees "Ask a finance manager". There is no
   Create option.
3. A manager requests a void with a reason, and a church admin approves it in
   Admin → Requests. The list shows it struck through, and the totals drop.
4. An admin views as the clerk: no Record buttons exist.

**Commit:** "Test finance access, numbering and entry rules end to end".

---

## 4.17 — Phase check

- [ ] The 4.15 walkthrough, by the owner, against a deployment (`docs/what-works-now.md`).
- [x] 50 parallel creates give 50 consecutive numbers (`test/finance.e2e-spec.ts`).
- [x] Entries cannot be deleted or have their amount changed, even with SQL as the app role.
- [x] Suggestions tolerate a typo, and near-duplicates are caught before they are created.
- [x] Every Finance button is inside `<Can>`, confirmed by viewing as a clerk in `e2e/finance.spec.ts`.
- [x] No entry can change without an approved request, including by SQL as `irca_app`.
- [x] The change-request tests pass, including the month move and the self-approval refusal.
- [x] `docs/adding-a-module.md` corrected with what Finance taught us.
- [x] Usage for `finance.transactions.created` is counted (`UsageService.inc`, flushed each minute).

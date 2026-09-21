-- CreateEnum
CREATE TYPE "ChangeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FinanceKind" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "FinanceStatus" AS ENUM ('POSTED', 'VOIDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'MOBILE_MONEY', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'OTHER');

-- CreateTable
CREATE TABLE "change_requests" (
    "id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
    "module_key" VARCHAR(40) NOT NULL,
    "entity_type" VARCHAR(60) NOT NULL,
    "entity_id" VARCHAR(80) NOT NULL,
    "entity_label" VARCHAR(120) NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "before" JSONB NOT NULL,
    "proposed" JSONB NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requested_by_id" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "decision_note" VARCHAR(500),
    "applied_at" TIMESTAMPTZ(6),
    "result" JSONB,

    CONSTRAINT "change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "church_sequences" (
    "church_id" UUID NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "last_value" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "church_sequences_pkey" PRIMARY KEY ("church_id","key")
);

-- CreateTable
CREATE TABLE "finance_income_sources" (
    "id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "name_key" VARCHAR(80) NOT NULL,
    "description" VARCHAR(300) NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "finance_income_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_expense_items" (
    "id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "name_key" VARCHAR(80) NOT NULL,
    "description" VARCHAR(300) NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "finance_expense_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_transactions" (
    "id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "kind" "FinanceKind" NOT NULL,
    "status" "FinanceStatus" NOT NULL DEFAULT 'POSTED',
    "txn_date" DATE NOT NULL,
    "period_year" INTEGER NOT NULL,
    "period_month" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "income_source_id" UUID,
    "expense_item_id" UUID,
    "method" "PaymentMethod" NOT NULL,
    "reference" VARCHAR(80),
    "counterparty" VARCHAR(120),
    "notes" VARCHAR(1000),
    "client_request_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "voided_at" TIMESTAMPTZ(6),
    "voided_by_id" UUID,
    "void_reason" VARCHAR(500),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "applied_request_id" UUID,
    "replaces_id" UUID,

    CONSTRAINT "finance_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "change_requests_church_id_status_requested_at_idx" ON "change_requests"("church_id", "status", "requested_at" DESC);

-- CreateIndex
CREATE INDEX "change_requests_church_id_entity_type_entity_id_idx" ON "change_requests"("church_id", "entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "finance_income_sources_church_id_name_key_key" ON "finance_income_sources"("church_id", "name_key");

-- CreateIndex
CREATE UNIQUE INDEX "finance_income_sources_church_id_id_key" ON "finance_income_sources"("church_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "finance_expense_items_church_id_name_key_key" ON "finance_expense_items"("church_id", "name_key");

-- CreateIndex
CREATE UNIQUE INDEX "finance_expense_items_church_id_id_key" ON "finance_expense_items"("church_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "finance_transactions_code_key" ON "finance_transactions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "finance_transactions_replaces_id_key" ON "finance_transactions"("replaces_id");

-- CreateIndex
CREATE INDEX "finance_transactions_church_id_txn_date_idx" ON "finance_transactions"("church_id", "txn_date" DESC);

-- CreateIndex
CREATE INDEX "finance_transactions_church_id_kind_status_txn_date_idx" ON "finance_transactions"("church_id", "kind", "status", "txn_date");

-- CreateIndex
CREATE INDEX "finance_transactions_church_id_income_source_id_idx" ON "finance_transactions"("church_id", "income_source_id");

-- CreateIndex
CREATE INDEX "finance_transactions_church_id_expense_item_id_idx" ON "finance_transactions"("church_id", "expense_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "finance_transactions_church_id_kind_period_year_period_mont_key" ON "finance_transactions"("church_id", "kind", "period_year", "period_month", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "finance_transactions_church_id_client_request_id_key" ON "finance_transactions"("church_id", "client_request_id");

-- AddForeignKey
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "church_sequences" ADD CONSTRAINT "church_sequences_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_income_sources" ADD CONSTRAINT "finance_income_sources_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_expense_items" ADD CONSTRAINT "finance_expense_items_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_church_id_income_source_id_fkey" FOREIGN KEY ("church_id", "income_source_id") REFERENCES "finance_income_sources"("church_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_church_id_expense_item_id_fkey" FOREIGN KEY ("church_id", "expense_item_id") REFERENCES "finance_expense_items"("church_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_replaces_id_fkey" FOREIGN KEY ("replaces_id") REFERENCES "finance_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Rules the database keeps by itself, so they hold even when the code is wrong.
-- ---------------------------------------------------------------------------

-- Typo-tolerant suggestions: "electrcity" still finds "Electricity bill".
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX finance_expense_items_name_trgm ON finance_expense_items USING gin (name_key gin_trgm_ops);
CREATE INDEX finance_income_sources_name_trgm ON finance_income_sources USING gin (name_key gin_trgm_ops);

-- One open request per record, and nobody decides their own (D17).
CREATE UNIQUE INDEX change_requests_one_open ON change_requests (church_id, entity_type, entity_id)
  WHERE status = 'PENDING';
ALTER TABLE change_requests ADD CONSTRAINT change_requests_not_self
  CHECK (decided_by_id IS NULL OR decided_by_id <> requested_by_id);

ALTER TABLE finance_transactions
  ADD CONSTRAINT finance_txn_amount_positive CHECK (amount > 0),
  ADD CONSTRAINT finance_txn_one_target CHECK (
    (kind = 'INCOME'  AND income_source_id IS NOT NULL AND expense_item_id  IS NULL) OR
    (kind = 'EXPENSE' AND expense_item_id  IS NOT NULL AND income_source_id IS NULL)),
  ADD CONSTRAINT finance_txn_period_matches_date CHECK (
    period_year = extract(year from txn_date) AND period_month = extract(month from txn_date)),
  ADD CONSTRAINT finance_txn_void_consistent CHECK ((status = 'VOIDED') = (voided_at IS NOT NULL)),
  ADD CONSTRAINT finance_txn_code_shape CHECK (code ~ '^[A-Z][A-Z0-9]{1,9}-(INC|EXP)-[0-9]{4}-[0-9]{2}-[0-9]{6,}$');

-- Entries are never deleted: voiding is the only way out of the totals, and
-- that is what keeps the numbers free of gaps.
REVOKE DELETE, TRUNCATE ON TABLE finance_transactions FROM irca_app, irca_core;

-- A posted entry changes only through a change request an administrator has
-- approved (D17). Some things never change at all, and a void is final.
CREATE FUNCTION finance_txn_guard() RETURNS trigger AS $$
begin
  if new.code <> old.code or new.kind <> old.kind or new.seq <> old.seq
     or new.period_year <> old.period_year or new.period_month <> old.period_month
     or new.church_id <> old.church_id or new.currency <> old.currency
     or new.created_by_id <> old.created_by_id or new.client_request_id <> old.client_request_id then
    raise exception 'finance_transactions: the number and kind of % never change', old.code;
  end if;
  if old.status = 'VOIDED' then
    raise exception 'finance_transactions: % was voided and cannot change', old.code;
  end if;
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
end $$ LANGUAGE plpgsql;

CREATE TRIGGER finance_txn_guard BEFORE UPDATE ON finance_transactions
  FOR EACH ROW EXECUTE FUNCTION finance_txn_guard();

-- A church's code is printed on its entries, so it is frozen once there are any.
CREATE FUNCTION church_code_guard() RETURNS trigger AS $$
begin
  if new.code <> old.code and exists (select 1 from finance_transactions where church_id = old.id) then
    raise exception 'churches: code % is used on finance entries and cannot change', old.code;
  end if;
  return new;
end $$ LANGUAGE plpgsql;

CREATE TRIGGER church_code_guard BEFORE UPDATE ON churches
  FOR EACH ROW EXECUTE FUNCTION church_code_guard();

-- Church-owned tables: one church at a time for feature code, everything for
-- core, and read-only for backups. Same template as every tenant table.
DO $$
declare t text;
begin
  foreach t in array array[
    'change_requests', 'church_sequences', 'finance_income_sources',
    'finance_expense_items', 'finance_transactions'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for all to irca_app, irca_readonly using (church_id = app_church_id()) with check (church_id = app_church_id())',
      t || '_tenant', t);
    execute format('create policy %I on %I for all to irca_core using (true) with check (true)', t || '_core', t);
    execute format('create policy %I on %I for select to irca_backup using (true)', t || '_backup', t);
  end loop;
end $$;

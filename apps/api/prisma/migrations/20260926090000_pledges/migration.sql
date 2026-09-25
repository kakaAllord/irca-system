-- Pledges (Phase 9): what a person promised towards a campaign, and what they
-- have paid. Agreed by the leadership on 25 Sept 2026, including that none of
-- it is ever deleted (docs/modules/pledges-brief.md).
-- CreateEnum
CREATE TYPE "PledgeStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PledgeRhythm" AS ENUM ('ONE_OFF', 'WEEKLY', 'MONTHLY');

-- AlterEnum


ALTER TYPE "InteractionKind" ADD VALUE 'PLEDGE_PROMISED';
ALTER TYPE "InteractionKind" ADD VALUE 'PLEDGE_PAID';

-- CreateTable
CREATE TABLE "pledge_campaigns" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "target_amount" DECIMAL(14,2),
    "starts_on" DATE NOT NULL,
    "ends_on" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pledge_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pledges" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "person_id" UUID,
    "amount" DECIMAL(14,2) NOT NULL,
    "rhythm" "PledgeRhythm" NOT NULL DEFAULT 'ONE_OFF',
    "due_on" DATE,
    "note" VARCHAR(300) NOT NULL DEFAULT '',
    "status" "PledgeStatus" NOT NULL DEFAULT 'OPEN',
    "promised_on" DATE NOT NULL,
    "recorded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "cancelled_by_id" UUID,
    "cancel_reason" VARCHAR(300),
    "client_request_id" UUID NOT NULL,

    CONSTRAINT "pledges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pledge_payments" (
    "id" UUID NOT NULL,
    "pledge_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paid_on" DATE NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "transaction_id" UUID,
    "note" VARCHAR(200) NOT NULL DEFAULT '',
    "status" "FinanceStatus" NOT NULL DEFAULT 'POSTED',
    "recorded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "client_request_id" UUID NOT NULL,
    "voided_at" TIMESTAMPTZ(6),
    "voided_by_id" UUID,
    "void_reason" VARCHAR(500),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "applied_request_id" UUID,

    CONSTRAINT "pledge_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pledge_campaigns_name_key" ON "pledge_campaigns"("name");

-- CreateIndex
CREATE UNIQUE INDEX "pledges_client_request_id_key" ON "pledges"("client_request_id");

-- CreateIndex
CREATE INDEX "pledges_campaign_id_status_idx" ON "pledges"("campaign_id", "status");

-- CreateIndex
CREATE INDEX "pledges_person_id_idx" ON "pledges"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "pledge_payments_client_request_id_key" ON "pledge_payments"("client_request_id");

-- CreateIndex
CREATE INDEX "pledge_payments_pledge_id_idx" ON "pledge_payments"("pledge_id");

-- CreateIndex
CREATE INDEX "pledge_payments_transaction_id_idx" ON "pledge_payments"("transaction_id");

-- AddForeignKey
ALTER TABLE "pledges" ADD CONSTRAINT "pledges_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "pledge_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pledges" ADD CONSTRAINT "pledges_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pledge_payments" ADD CONSTRAINT "pledge_payments_pledge_id_fkey" FOREIGN KEY ("pledge_id") REFERENCES "pledges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pledge_payments" ADD CONSTRAINT "pledge_payments_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "finance_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;


alter table pledge_campaigns add constraint pledge_campaigns_target_positive
  check (target_amount is null or target_amount > 0);
alter table pledge_campaigns add constraint pledge_campaigns_dates
  check (ends_on is null or ends_on >= starts_on);
alter table pledges add constraint pledges_amount_positive check (amount > 0);
alter table pledge_payments add constraint pledge_payments_amount_positive check (amount > 0);

-- Pledge records are never deleted, by anyone the application connects as.
revoke delete, truncate on table pledge_campaigns, pledges, pledge_payments from irca_app;

-- What was promised, by whom, towards what and when, is written once. A
-- pledge's status moves (open, paid in full, cancelled), and it loses its
-- person only when that person is erased: the money stays, the name goes.
create function pledge_guard() returns trigger as $$
begin
  if new.campaign_id <> old.campaign_id or new.amount <> old.amount
     or new.promised_on <> old.promised_on or new.recorded_by_id <> old.recorded_by_id
     or new.client_request_id <> old.client_request_id or new.created_at <> old.created_at then
    raise exception 'pledges: what was promised, by whom and when never changes';
  end if;
  if new.person_id is distinct from old.person_id and new.person_id is not null then
    raise exception 'pledges: a pledge stays with the person who made it';
  end if;
  if old.status = 'CANCELLED' and new.status <> 'CANCELLED' then
    raise exception 'pledges: a cancelled pledge stays cancelled';
  end if;
  return new;
end $$ language plpgsql;

create trigger pledge_guard before update on pledges
  for each row execute function pledge_guard();

-- A payment is money, and changes like a finance entry does (D17): only
-- through a change request an administrator has approved and that has not
-- been applied yet, one revision at a time, and never once voided.
create function pledge_payment_guard() returns trigger as $$
begin
  if new.pledge_id <> old.pledge_id or new.recorded_by_id <> old.recorded_by_id
     or new.client_request_id <> old.client_request_id or new.created_at <> old.created_at then
    raise exception 'pledge_payments: which pledge a payment is for, and who recorded it, never change';
  end if;
  if old.status = 'VOIDED' then
    raise exception 'pledge_payments: a voided payment cannot change';
  end if;
  if new.applied_request_id is not distinct from old.applied_request_id
     or not exists (select 1 from change_requests r
                    where r.id = new.applied_request_id
                      and r.entity_type = 'pledge_payment' and r.entity_id = old.id::text
                      and r.status = 'APPROVED' and r.applied_at is null) then
    raise exception 'pledge_payments: a payment can only change through an approved change request';
  end if;
  if new.revision <> old.revision + 1 then
    raise exception 'pledge_payments: revision must go up by one';
  end if;
  return new;
end $$ language plpgsql;

create trigger pledge_payment_guard before update on pledge_payments
  for each row execute function pledge_payment_guard();

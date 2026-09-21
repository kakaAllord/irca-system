-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');

-- DropForeignKey
ALTER TABLE "membership_roles" DROP CONSTRAINT "membership_roles_church_id_membership_id_fkey";

-- DropForeignKey
ALTER TABLE "membership_roles" DROP CONSTRAINT "membership_roles_church_id_role_id_fkey";

-- DropForeignKey
ALTER TABLE "role_permissions" DROP CONSTRAINT "role_permissions_church_id_role_id_fkey";

-- CreateTable
CREATE TABLE "email_outbox" (
    "id" UUID NOT NULL,
    "church_id" UUID,
    "to_email" VARCHAR(254) NOT NULL,
    "template" VARCHAR(60) NOT NULL,
    "payload" JSONB NOT NULL,
    "subject" VARCHAR(200),
    "status" "EmailStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" TEXT,
    "provider_message_id" VARCHAR(200),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),

    CONSTRAINT "email_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "church_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_by_id" UUID NOT NULL,
    "sent_count" INTEGER NOT NULL DEFAULT 1,
    "last_sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_outbox_status_next_attempt_at_idx" ON "email_outbox"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "email_outbox_church_id_created_at_idx" ON "email_outbox"("church_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex
CREATE INDEX "invitations_church_id_created_at_idx" ON "invitations"("church_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "invitations_membership_id_idx" ON "invitations"("membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_church_id_role_id_fkey" FOREIGN KEY ("church_id", "role_id") REFERENCES "roles"("church_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_church_id_membership_id_fkey" FOREIGN KEY ("church_id", "membership_id") REFERENCES "church_memberships"("church_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_church_id_role_id_fkey" FOREIGN KEY ("church_id", "role_id") REFERENCES "roles"("church_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_church_id_membership_id_fkey" FOREIGN KEY ("church_id", "membership_id") REFERENCES "church_memberships"("church_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Invitations belong to a church, like any other church-owned table.
alter table invitations enable row level security;
create policy invitations_tenant on invitations for all to irca_app, irca_readonly
  using (church_id = app_church_id()) with check (church_id = app_church_id());
create policy invitations_core on invitations for all to irca_core using (true) with check (true);
create policy invitations_backup on invitations for select to irca_backup using (true);

-- The outbox and password resets are core's alone: feature code has no policy
-- on them, so it sees nothing in them and cannot write to them.
do $$
declare t text;
begin
  foreach t in array array['email_outbox', 'password_reset_tokens'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for all to irca_core using (true) with check (true)', t || '_core', t);
    execute format('create policy %I on %I for select to irca_backup using (true)', t || '_backup', t);
  end loop;
end $$;

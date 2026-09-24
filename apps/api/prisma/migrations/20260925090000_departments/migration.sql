-- The church's departments, their leaders and their members (D28), and the
-- link from a staff account to the person it belongs to.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "person_id" UUID;

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(300) NOT NULL DEFAULT '',
    "module_key" VARCHAR(40),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "department_leaders" (
    "id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "title" VARCHAR(60) NOT NULL,
    "added_by_id" UUID,
    "added_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(6),
    "ended_by_id" UUID,

    CONSTRAINT "department_leaders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "department_members" (
    "id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "added_by_id" UUID,
    "added_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(6),
    "ended_by_id" UUID,

    CONSTRAINT "department_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- CreateIndex
CREATE UNIQUE INDEX "departments_module_key_key" ON "departments"("module_key");

-- CreateIndex
CREATE INDEX "department_leaders_person_id_idx" ON "department_leaders"("person_id");

-- CreateIndex
CREATE INDEX "department_leaders_department_id_idx" ON "department_leaders"("department_id");

-- CreateIndex
CREATE INDEX "department_members_person_id_idx" ON "department_members"("person_id");

-- CreateIndex
CREATE INDEX "department_members_department_id_idx" ON "department_members"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_person_id_key" ON "users"("person_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_leaders" ADD CONSTRAINT "department_leaders_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_leaders" ADD CONSTRAINT "department_leaders_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_members" ADD CONSTRAINT "department_members_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_members" ADD CONSTRAINT "department_members_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A person leads, or belongs to, a department once at a time. Ending a
-- leadership and naming them again later is two rows, which is the history.
create unique index department_leaders_open_idx on department_leaders (department_id, person_id)
  where ended_at is null;
create unique index department_members_open_idx on department_members (department_id, person_id)
  where ended_at is null;

-- Departments are archived, and leaderships and memberships are ended, never
-- deleted, so "who led the choir in 2027" keeps an answer. Erasing a person
-- (person:erase, as the owner) still takes theirs with them.
revoke delete, truncate on table departments, department_leaders, department_members from irca_app;

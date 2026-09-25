-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL,
    "module_key" VARCHAR(30) NOT NULL,
    "entity_type" VARCHAR(40) NOT NULL,
    "entity_id" UUID NOT NULL,
    "key" VARCHAR(300) NOT NULL,
    "original_name" VARCHAR(200) NOT NULL,
    "content_type" VARCHAR(100) NOT NULL,
    "bytes" INTEGER NOT NULL,
    "uploaded_by_id" UUID NOT NULL,
    "uploaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "files_key_key" ON "files"("key");

-- CreateIndex
CREATE INDEX "files_entity_type_entity_id_idx" ON "files"("entity_type", "entity_id");

-- A file's row outlives it: replacing a file marks the old row, and the
-- nightly check reports rows whose object is missing rather than deleting
-- them. The application records files and marks them replaced, nothing more.
revoke delete, truncate on table files from irca_app;
revoke update on table files from irca_app;
grant update (deleted_at) on table files to irca_app;

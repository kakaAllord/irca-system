-- What the alert job has already told the owner about (docs/plan/10, step
-- 10.4). The application role reads and writes it through the default
-- privileges; it holds no personal data.
CREATE TABLE "alerts" (
    "key" VARCHAR(80) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "summary" VARCHAR(300) NOT NULL DEFAULT '',
    "detail" JSONB,
    "raised_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("key")
);

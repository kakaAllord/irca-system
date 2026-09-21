// Applies db/schema.sql to an existing database. Idempotent, so it is safe to
// run on every deploy — this is what the Vercel build calls, because Vercel has
// no release phase and the build is the only once-per-deploy hook there is.
//
// Run with: npm run db:migrate
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

// DATABASE_URL on its own is enough. Vercel's Neon integration also sets
// DATABASE_URL_UNPOOLED, and we take it when it is there — a build-time task
// has no reason to occupy a pooler slot — but this schema is plain DDL in a
// single statement batch, which transaction-mode PgBouncer handles fine. The
// direct connection matters for migration engines that take advisory locks or
// set session state, like Prisma and Drizzle; there is no such engine here.
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

if (!url) {
  console.error(
    'DATABASE_URL is not set. Locally: copy .env.example to .env.local.\n' +
      'On Vercel: set it under Settings → Environment Variables.',
  );
  process.exit(1);
}

const db = new Client({ connectionString: url, enableChannelBinding: true });
await db.connect();
try {
  await db.query(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  console.log(`schema applied to ${new URL(url).pathname.slice(1)}`);
} finally {
  await db.end();
}

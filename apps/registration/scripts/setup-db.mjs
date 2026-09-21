// Local convenience: creates the database if it is missing, then applies the
// schema. Deploys do not use this — a hosted Postgres comes with the database
// already made and the app role rarely has rights on the maintenance database.
//
// Run with: npm run db:setup
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env.local.');
  process.exit(1);
}

const url = new URL(process.env.DATABASE_URL);
const dbName = decodeURIComponent(url.pathname.slice(1));

const admin = new Client({ connectionString: new URL('/postgres', url).toString() });
await admin.connect();
try {
  const { rowCount } = await admin.query(
    'select 1 from pg_database where datname = $1',
    [dbName],
  );
  if (!rowCount) {
    if (!/^[a-z_][a-z0-9_]*$/i.test(dbName)) throw new Error(`unsafe database name: ${dbName}`);
    await admin.query(`create database "${dbName}"`);
    console.log(`created database ${dbName}`);
  } else {
    console.log(`database ${dbName} already exists`);
  }
} finally {
  await admin.end();
}

// One implementation of "apply the schema", shared with the deploy path.
const { status } = spawnSync(
  process.execPath,
  [fileURLToPath(new URL('./apply-schema.mjs', import.meta.url))],
  { stdio: 'inherit' },
);
process.exit(status ?? 1);

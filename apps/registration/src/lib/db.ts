import { Pool } from 'pg';

// One pool for the process. Next's dev server re-evaluates modules on every
// edit, so it is stashed on globalThis — otherwise a morning of hot reloads
// leaves a few dozen orphaned pools holding connections open.
const globalForPool = globalThis as unknown as { ircaPool?: Pool };

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;

  // No fallback. A wrong-but-plausible default is worse than no default: it
  // connects to an empty local database and the app looks merely broken
  // instead of telling you the variable is missing.
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Locally: copy .env.example to .env.local. ' +
        'On Vercel: set it under Settings → Environment Variables.',
    );
  }

  return new Pool({
    connectionString,
    max: 10,
    // channel_binding=require in the URL is a libpq parameter, and this driver
    // is not libpq — it parses the key and then ignores it. SCRAM-SHA-256-PLUS
    // is only negotiated when this flag is set. Safe everywhere: the mechanism
    // is offered by the server, and a local socket without TLS simply falls
    // back to plain SCRAM-SHA-256.
    enableChannelBinding: true,
  });
}

// Built on first query rather than on import, so that `next build` can collect
// pages without a database in reach — the throw above should reach whoever is
// running the app, not whoever is building it.
export function getPool(): Pool {
  const pool = globalForPool.ircaPool ?? createPool();
  if (process.env.NODE_ENV !== 'production') globalForPool.ircaPool = pool;
  return pool;
}

export function query<T extends Record<string, unknown>>(
  text: string,
  params?: unknown[],
) {
  return getPool().query<T>(text, params);
}

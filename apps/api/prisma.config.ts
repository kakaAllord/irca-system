import { config } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// Prisma 7 no longer reads .env by itself. Tests use their own database.
config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env', quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  // The CLI (migrate, seed, studio) connects as irca_owner, the only role that
  // may change the schema. The running API never uses this URL: each of its
  // clients gets its own driver adapter and role (src/core/database).
  datasource: {
    // `prisma generate` reads only the schema, and CI and a fresh clone
    // typecheck before any .env exists. Every command that connects still
    // refuses to start without the URL, and says which variable is missing.
    url: process.argv.includes('generate')
      ? (process.env.DIRECT_DATABASE_URL ?? '')
      : env('DIRECT_DATABASE_URL'),
    // Prisma builds a throwaway copy of the schema to work out what a migration
    // should contain. It normally creates that database itself; set
    // SHADOW_DATABASE_URL to point at one you made by hand, which is what a
    // machine whose `template1` the CLI may not copy needs.
    ...(process.env.SHADOW_DATABASE_URL
      ? { shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL }
      : {}),
  },
});

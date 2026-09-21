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
    url: env('DIRECT_DATABASE_URL'),
  },
});

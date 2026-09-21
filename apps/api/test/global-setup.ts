import { execSync } from 'node:child_process';

/**
 * Once per test run: bring irca_test up to the latest migration, so tests run
 * against exactly the schema, grants and policies production gets.
 *
 * `migrate deploy` only applies what is missing and never drops anything. The
 * tests themselves empty the tables they fill (truncateAll in helpers.ts).
 * prisma.config.ts reads .env.test when NODE_ENV is test, so this can only ever
 * reach irca_test. To rebuild irca_test from nothing, run
 * `NODE_ENV=test npm run db:reset -w @irca/api` yourself.
 */
export default function setup() {
  execSync('npx prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, NODE_ENV: 'test' },
  });
}

import { execSync } from 'node:child_process';

/**
 * Brings irca_test up to date and seeds it: the seed only upserts, so the
 * known accounts exist however the database was left. Nothing is dropped.
 * The seed writes the permissions and built-in roles itself, so a database
 * the API has never booted against is still usable.
 */
export default function setup() {
  const env = { ...process.env, NODE_ENV: 'test' };
  execSync('npx prisma migrate deploy', { cwd: 'apps/api', stdio: 'pipe', env });
  execSync('npx prisma db seed', { cwd: 'apps/api', stdio: 'pipe', env });
}

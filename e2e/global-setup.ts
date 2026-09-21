import { execSync } from 'node:child_process';

/**
 * Brings irca_test up to date and seeds it: the seed only upserts, so the
 * known accounts exist however the database was left. Nothing is dropped.
 */
export default function setup() {
  const env = { ...process.env, NODE_ENV: 'test' };
  execSync('npx prisma migrate deploy', { cwd: 'apps/api', stdio: 'pipe', env });
  // The permissions and built-in roles come from the code. The API writes them
  // at every boot, but the seed needs them first, so they are written here.
  execSync('npm run -s build', { cwd: 'apps/api', stdio: 'pipe', env });
  execSync('node dist/cli/main.js registry:sync', { cwd: 'apps/api', stdio: 'pipe', env });
  execSync('npx prisma db seed', { cwd: 'apps/api', stdio: 'pipe', env });
}

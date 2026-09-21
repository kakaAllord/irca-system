/* eslint-disable no-console -- a script reports to its terminal */
// Local and test data: two churches and a few accounts to sign in with.
//
// Refuses to run anywhere but development and test, because it writes known
// passwords. TEST exists from the start, with records that overlap IRCA's,
// so a leak between churches shows up as a wrong row in a test rather than
// an empty page (docs/plan/multi-tenancy.md, section 15).
import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PasswordService } from '../src/core/auth/password.service.js';

config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env', quiet: true });

const env = process.env.NODE_ENV;
if (env !== 'development' && env !== 'test') {
  console.error(
    `Refusing to seed with NODE_ENV=${env ?? '(unset)'}: the seed writes known passwords.`,
  );
  process.exit(1);
}

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DIRECT_DATABASE_URL! }),
});
const passwords = new PasswordService();

async function church(code: string, slug: string, name: string) {
  return db.church.upsert({
    where: { code },
    update: { name, slug },
    create: { code, slug, name },
  });
}

async function user(
  email: string,
  fullName: string,
  password: string,
  platformRole: 'NONE' | 'DEV' = 'NONE',
) {
  const passwordHash = await passwords.hash(password);
  return db.user.upsert({
    where: { email },
    update: {
      fullName,
      passwordHash,
      platformRole,
      status: 'ACTIVE',
      failedLoginCount: 0,
      lockedUntil: null,
    },
    create: { email, fullName, passwordHash, platformRole, status: 'ACTIVE' },
  });
}

async function member(churchId: string, userId: string) {
  return db.churchMembership.upsert({
    where: { churchId_userId: { churchId, userId } },
    update: { status: 'ACTIVE' },
    create: { churchId, userId, status: 'ACTIVE', joinedAt: new Date() },
  });
}

const irca = await church('IRCA', 'irca', 'International Revival Church Arusha');
const test = await church('TEST', 'test', 'Test Church');

await user('dev@irca.local', 'Dev Account', 'dev-password-123', 'DEV');
await member(irca.id, (await user('admin@irca.local', 'IRCA Admin', 'admin-password-123')).id);
await member(irca.id, (await user('clerk@irca.local', 'Neema Mollel', 'clerk-password-123')).id);
await member(test.id, (await user('admin@test.local', 'Test Admin', 'admin-password-123')).id);

console.log(
  'seeded: IRCA and TEST, with dev@irca.local, admin@irca.local, clerk@irca.local, admin@test.local',
);
await db.$disconnect();
